// src/app/api/spaces/route.ts
//
// GET  /api/spaces  -> list spaces visible to the current viewer (hosted +
//                       active/scheduled/live). No auth required; the viewer
//                       is inferred from the session cookie when present.
// POST /api/spaces  -> create a new space; requires an authenticated session.
//
// The POST handler supports three flows:
//   - Immediate  (no startNow, no scheduledAt): creates an `active` space.
//   - Scheduled  (scheduledAt: <ISO string>): creates a `scheduled` space.
//   - Start now  (startNow: true): opens an `active` space, mints a host
//                 LiveKit token and returns it so the host lands straight in
//                 the room. The show stays OFF AIR: nothing is published to
//                 Bluesky and no recording starts until the host presses
//                 "On air" (POST /api/spaces/[id]/live). The title is
//                 optional in this flow. Without one the host's existing
//                 default-titled show is reopened for a new session (one
//                 landing page per show, many sessions) and only created
//                 when they have none; `spaceId` reopens a specific show
//                 they host. A title always creates a new show.

import { NextResponse, type NextRequest } from 'next/server';
import {
  createSpace,
  defaultShowTitle,
  findDefaultHostedSpace,
  getSpacesForUser,
  originFromRequest,
  reopenSpace,
  resolveSpaceForUser,
  toPublicSpace,
} from '@/lib/spaces';
import { createHostToken } from '@/lib/livekit';
import { getCurrentUser } from '@/lib/session';
import { decoratePublicSpaces } from '@/lib/space-extras';
import { normalizeTags } from '@/lib/tags';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { check, ValidationError, validationErrorResponse } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Maximum lead time (ms) accepted for `scheduledAt`. */
const SCHEDULE_MAX_DAYS = 30;
const SCHEDULE_MAX_MS = SCHEDULE_MAX_DAYS * 24 * 60 * 60 * 1000;
/** `scheduledAt` must align to this UTC minute boundary. */
const SCHEDULE_BOUNDARY_MINUTES = 15;

export async function GET(request: NextRequest): Promise<NextResponse> {
  // The stale-show sweep (one LiveKit round trip per active show) runs from
  // the cron trigger every five minutes, not here: doing it per request made
  // the listing take seconds. Visibility rules already hide expired rows.
  const user = await getCurrentUser();
  const spaces = await getSpacesForUser(user?.did ?? null);
  const origin = originFromRequest(request);
  const decorated = await decoratePublicSpaces(
    spaces.map((s) => toPublicSpace(s, origin)),
    user?.did ?? null
  );
  return NextResponse.json({ spaces: decorated }, { status: 200 });
}

interface CreateSpaceBody {
  title?: unknown;
  description?: unknown;
  scheduledAt?: unknown;
  startNow?: unknown;
  tags?: unknown;
  /** startNow only: reopen this show (id or slug) the caller hosts. */
  spaceId?: unknown;
}

/**
 * Decide whether the supplied `scheduledAt` sits on a 15-minute UTC boundary
 * (minutes divisible by 15, zero seconds and milliseconds).
 */
function isOnScheduleBoundary(d: Date): boolean {
  return (
    d.getUTCMinutes() % SCHEDULE_BOUNDARY_MINUTES === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: CreateSpaceBody;
  try {
    body = (await request.json()) as CreateSpaceBody;
  } catch {
    return NextResponse.json(
      { error: 'invalid_json', message: 'Request body must be JSON.' },
      { status: 400 }
    );
  }

  let startNow = false;
  let rawTitle = '';
  let title = '';
  let description: string | null = null;
  let tags: string[] = [];
  let scheduledAt: Date | null = null;

  try {
    // ---- startNow validation (first, because it relaxes the title rule) ---
    if (body.startNow !== undefined) {
      check(typeof body.startNow === 'boolean', 'startNow must be a boolean.');
      startNow = body.startNow;
    }

    rawTitle = typeof body.title === 'string' ? body.title.trim() : '';
    title = rawTitle || (startNow ? defaultShowTitle(user.handle, user.displayName) : '');
    check(title, 'Title is required.');
    check(title.length <= 200, 'Title must be 200 characters or fewer.');

    description =
      typeof body.description === 'string' && body.description.trim().length > 0
        ? body.description.trim()
        : null;
    check(!description || description.length <= 2000, 'Description must be 2000 characters or fewer.');

    // Tags must be a subset of the allowed YouTube categories, up to 3.
    tags = normalizeTags(body.tags);
    check(
      !(Array.isArray(body.tags) && body.tags.length > 0 && tags.length === 0),
      'Tags must be valid YouTube categories.'
    );

    // `scheduledAt` is "provided" only when it is a non-empty string. Anything
    // else (undefined, null, empty/whitespace string) is treated as "not
    // provided" so the start-now + empty-string combination is allowed.
    const hasScheduledAtString =
      typeof body.scheduledAt === 'string' && body.scheduledAt.trim().length > 0;
    check(!(startNow && hasScheduledAtString), 'Cannot combine startNow with scheduledAt.');

    // ---- scheduledAt validation --------------------------------------------
    if (body.scheduledAt !== undefined && body.scheduledAt !== null) {
      check(typeof body.scheduledAt === 'string', 'scheduledAt must be an ISO date string.');
      const trimmed = body.scheduledAt.trim();
      // Empty string collapses to "no scheduledAt" (keeps the existing
      // behaviour where undefined/null means "create immediately").
      if (trimmed.length > 0) {
        const parsed = new Date(trimmed);
        check(!Number.isNaN(parsed.getTime()), 'scheduledAt is not a valid ISO date string.');
        const now = new Date();
        check(parsed.getTime() > now.getTime(), 'scheduledAt must be in the future.');
        check(
          parsed.getTime() <= now.getTime() + SCHEDULE_MAX_MS,
          `scheduledAt must be within ${SCHEDULE_MAX_DAYS} days.`
        );
        check(isOnScheduleBoundary(parsed), 'scheduledAt must be on a 15-minute UTC boundary.');
        scheduledAt = parsed;
      }
    }
  } catch (err) {
    if (err instanceof ValidationError) return validationErrorResponse(err);
    throw err;
  }

  // ---- Reuse an existing show for a new session ---------------------------
  let space;
  let reopened = false;
  if (startNow) {
    const spaceId = typeof body.spaceId === 'string' ? body.spaceId.trim() : '';
    let existing = null;
    // Only the untitled-default lookup refreshes the title on reopen: a show
    // picked by spaceId was chosen deliberately and keeps whatever title it
    // has (issue #44).
    let refreshDefaultTitle = false;
    if (spaceId) {
      const resolved = await resolveSpaceForUser(spaceId, user.did);
      if (!resolved || !resolved.isHost) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
      }
      existing = resolved.space;
    } else if (!rawTitle) {
      existing = await findDefaultHostedSpace(user.did);
      refreshDefaultTitle = true;
    }
    if (existing) {
      try {
        const refreshedTitle =
          refreshDefaultTitle && existing.title !== title ? title : undefined;
        space = refreshedTitle
          ? await reopenSpace(existing.id, undefined, refreshedTitle)
          : await reopenSpace(existing.id);
        reopened = true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to reopen show.';
        return NextResponse.json({ error: 'create_failed', message }, { status: 500 });
      }
    }
  }

  // ---- Create the row ---------------------------------------------------
  if (!space) {
    try {
      space = await createSpace({
        title,
        description,
        tags,
        hostId: user.did,
        // startNow always creates a row with no scheduledAt; the scheduledAt
        // path keeps whatever the caller validated.
        scheduledAt: startNow ? null : scheduledAt,
        // Untitled startNow fills `title` in from the handle/display name
        // above; mark the row so it's findable even after that changes.
        isDefaultTitled: startNow && !rawTitle,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create space.';
      return NextResponse.json({ error: 'create_failed', message }, { status: 500 });
    }
  }

  const origin = originFromRequest(request);

  // ---- Start-now flow ---------------------------------------------------
  if (startNow) {
    // Resolve the latest avatarUrl for the host so the SpaceRoom header can
    // render it immediately on the redirected page. displayName comes from
    // getCurrentUser() already; avatarUrl isn't part of that session shape.
    const hostProfile = await prisma.user.findUnique({
      where: { did: user.did },
      select: { avatarUrl: true },
    });
    // The space stays `active` (off air). If token minting fails the row is
    // left as a plain active space the host can still open from Stations.
    let hostToken;
    try {
      hostToken = await createHostToken(space.id, {
        did: user.did,
        handle: user.handle,
      });
    } catch (err) {
      logger.error('spaces.start_now.token_failed', {
        err,
        spaceId: space.id,
      });
      return NextResponse.json(
        {
          error: 'token_failed',
          message:
            err instanceof Error
              ? err.message
              : 'Failed to create host token.',
        },
        { status: 500 }
      );
    }

    logger.info(reopened ? 'spaces.start_now.reopened' : 'spaces.start_now.created', {
      spaceId: space.id,
      did: user.did,
    });
    return NextResponse.json(
      {
        space: toPublicSpace(space, origin),
        startNow: true,
        reopened,
        token: hostToken.token,
        wsUrl: hostToken.wsUrl,
        role: 'host',
        roomName: hostToken.roomName,
        identity: hostToken.identity,
        handle: user.handle,
        displayName: user.displayName,
        avatarUrl: hostProfile?.avatarUrl ?? null,
        onAir: false,
      },
      { status: 201 }
    );
  }

  // ---- Default / scheduled flow -----------------------------------------
  return NextResponse.json(
    { space: toPublicSpace(space, origin) },
    { status: 201 }
  );
}
