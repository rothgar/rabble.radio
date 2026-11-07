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
//   - Start now  (startNow: true): creates an `active` space, mints a host
//                 LiveKit token and returns it so the host lands straight in
//                 the room. The show stays OFF AIR: nothing is published to
//                 Bluesky and no recording starts until the host presses
//                 "On air" (POST /api/spaces/[id]/live). The title is
//                 optional in this flow; a default is used and the host can
//                 rename the show from inside the room.

import { NextResponse, type NextRequest } from 'next/server';
import {
  createSpace,
  defaultShowTitle,
  getSpacesForUser,
  toPublicSpace,
} from '@/lib/spaces';
import { createHostToken } from '@/lib/livekit';
import { getCurrentUser } from '@/lib/session';
import { decoratePublicSpaces } from '@/lib/space-extras';
import { normalizeTags } from '@/lib/tags';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Maximum lead time (ms) accepted for `scheduledAt`. */
const SCHEDULE_MAX_DAYS = 30;
const SCHEDULE_MAX_MS = SCHEDULE_MAX_DAYS * 24 * 60 * 60 * 1000;
/** `scheduledAt` must align to this UTC minute boundary. */
const SCHEDULE_BOUNDARY_MINUTES = 15;

function originFromRequest(request: Request): string {
  try {
    const url = new URL(request.url);
    const host = url.host.toLowerCase();
    if (
      host === '0.0.0.0:3000' ||
      host === '127.0.0.1:3000' ||
      host === '0.0.0.0' ||
      host === '127.0.0.1'
    ) {
      return (
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.PUBLIC_URL ||
        'https://rabble.invalid'
      );
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    return (
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.PUBLIC_URL ||
      'https://rabble.invalid'
    );
  }
}

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

  // ---- startNow validation (first, because it relaxes the title rule) ---
  let startNow = false;
  if (body.startNow !== undefined) {
    if (typeof body.startNow !== 'boolean') {
      return NextResponse.json(
        {
          error: 'validation_error',
          message: 'startNow must be a boolean.',
        },
        { status: 400 }
      );
    }
    startNow = body.startNow;
  }

  const rawTitle = typeof body.title === 'string' ? body.title.trim() : '';
  const title = rawTitle || (startNow ? defaultShowTitle(user.handle) : '');
  if (!title) {
    return NextResponse.json(
      { error: 'validation_error', message: 'Title is required.' },
      { status: 400 }
    );
  }
  if (title.length > 200) {
    return NextResponse.json(
      {
        error: 'validation_error',
        message: 'Title must be 200 characters or fewer.',
      },
      { status: 400 }
    );
  }

  const description =
    typeof body.description === 'string' && body.description.trim().length > 0
      ? body.description.trim()
      : null;
  if (description && description.length > 2000) {
    return NextResponse.json(
      {
        error: 'validation_error',
        message: 'Description must be 2000 characters or fewer.',
      },
      { status: 400 }
    );
  }

  // Tags must be a subset of the allowed YouTube categories, up to 3.
  const tags = normalizeTags(body.tags);
  if (Array.isArray(body.tags) && body.tags.length > 0 && tags.length === 0) {
    return NextResponse.json(
      {
        error: 'validation_error',
        message: 'Tags must be valid YouTube categories.',
      },
      { status: 400 }
    );
  }

  // `scheduledAt` is "provided" only when it is a non-empty string. Anything
  // else (undefined, null, empty/whitespace string) is treated as "not
  // provided" so the start-now + empty-string combination is allowed.
  const hasScheduledAtString =
    typeof body.scheduledAt === 'string' &&
    body.scheduledAt.trim().length > 0;

  if (startNow && hasScheduledAtString) {
    return NextResponse.json(
      {
        error: 'validation_error',
        message: 'Cannot combine startNow with scheduledAt.',
      },
      { status: 400 }
    );
  }

  // ---- scheduledAt validation --------------------------------------------
  let scheduledAt: Date | null = null;
  if (body.scheduledAt !== undefined && body.scheduledAt !== null) {
    if (typeof body.scheduledAt !== 'string') {
      return NextResponse.json(
        {
          error: 'validation_error',
          message: 'scheduledAt must be an ISO date string.',
        },
        { status: 400 }
      );
    }
    const trimmed = body.scheduledAt.trim();
    if (trimmed.length === 0) {
      // Empty string collapses to "no scheduledAt" (keeps the existing
      // behaviour where undefined/null means "create immediately").
      scheduledAt = null;
    } else {
      const parsed = new Date(trimmed);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          {
            error: 'validation_error',
            message: 'scheduledAt is not a valid ISO date string.',
          },
          { status: 400 }
        );
      }
      const now = new Date();
      if (parsed.getTime() <= now.getTime()) {
        return NextResponse.json(
          {
            error: 'validation_error',
            message: 'scheduledAt must be in the future.',
          },
          { status: 400 }
        );
      }
      if (parsed.getTime() > now.getTime() + SCHEDULE_MAX_MS) {
        return NextResponse.json(
          {
            error: 'validation_error',
            message: `scheduledAt must be within ${SCHEDULE_MAX_DAYS} days.`,
          },
          { status: 400 }
        );
      }
      if (!isOnScheduleBoundary(parsed)) {
        return NextResponse.json(
          {
            error: 'validation_error',
            message: 'scheduledAt must be on a 15-minute UTC boundary.',
          },
          { status: 400 }
        );
      }
      scheduledAt = parsed;
    }
  }

  // ---- Create the row ---------------------------------------------------
  let space;
  try {
    space = await createSpace({
      title,
      description,
      tags,
      hostId: user.did,
      // startNow always creates a row with no scheduledAt; the scheduledAt
      // path keeps whatever the caller validated.
      scheduledAt: startNow ? null : scheduledAt,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to create space.';
    return NextResponse.json(
      { error: 'create_failed', message },
      { status: 500 }
    );
  }

  const origin = originFromRequest(request);

  // ---- Start-now flow ---------------------------------------------------
  if (startNow) {
    // Resolve the latest displayName / avatarUrl for the host so the
    // SpaceRoom header can render `@handle` immediately on the redirected
    // page. We query the User row independently from getCurrentUser()
    // because the session cookie only carries `did` + `handle`.
    const hostProfile = await prisma.user.findUnique({
      where: { did: user.did },
      select: { displayName: true, avatarUrl: true },
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

    logger.info('spaces.start_now.created', { spaceId: space.id, did: user.did });
    return NextResponse.json(
      {
        space: toPublicSpace(space, origin),
        startNow: true,
        token: hostToken.token,
        wsUrl: hostToken.wsUrl,
        role: 'host',
        roomName: hostToken.roomName,
        identity: hostToken.identity,
        handle: user.handle,
        displayName: hostProfile?.displayName ?? null,
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
