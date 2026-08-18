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
//                 LiveKit token, transitions to `live`, publishes the
//                 ATProto live banner, and starts a recording (best-effort).

import { NextResponse, type NextRequest } from 'next/server';
import {
  createSpace,
  getSpacesForUser,
  setSpaceLive,
  toPublicSpace,
  tryExpireStaleSpaces,
} from '@/lib/spaces';
import { publishLiveStatus } from '@/lib/atproto';
import {
  createRecording,
  findActiveRecordingForSpace,
  buildRecordingKey,
} from '@/lib/recording';
import {
  createHostToken,
  roomNameForSpace,
  startRecording,
} from '@/lib/livekit';
import { getCurrentUser } from '@/lib/session';
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
        'https://rabble.exe.xyz'
      );
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    return (
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.PUBLIC_URL ||
      'https://rabble.exe.xyz'
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Best-effort cleanup before we read the listing. Failures are swallowed
  // by the helper so the request still returns data.
  await tryExpireStaleSpaces();
  const user = await getCurrentUser();
  const spaces = await getSpacesForUser(user?.did ?? null);
  const origin = originFromRequest(request);
  return NextResponse.json(
    { spaces: spaces.map((s) => toPublicSpace(s, origin)) },
    { status: 200 }
  );
}

interface CreateSpaceBody {
  title?: unknown;
  description?: unknown;
  scheduledAt?: unknown;
  startNow?: unknown;
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

  const title = typeof body.title === 'string' ? body.title.trim() : '';
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

  // ---- startNow validation -----------------------------------------------
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
    // Diagnostic: log the resolved host avatarUrl at debug level so we can
    // confirm whether the database has the value before the response
    // leaves the server. Temporary aid; remove once avatar rendering is
    // verified end-to-end.
    logger.debug('spaces.start_now.profile_resolved', {
      did: user.did,
      avatarUrl: hostProfile?.avatarUrl ?? null,
    });
    // Generate the host token first. If this fails we leave the freshly
    // created space in its `active` status — the spec is explicit that we
    // do NOT transition it to live when token minting fails.
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

    try {
      const liveSpace = await setSpaceLive(space.id, true);
      const spaceUrl = `${origin}/space/${liveSpace.id}`;
      const session = { did: user.did, handle: user.handle };
      const atproto = await publishLiveStatus({
        session,
        spaceUrl,
        title: liveSpace.title,
      });
      if (!atproto.ok) {
        // Roll back the live flag so the UI does not believe the space is
        // live while the ATProto banner is missing.
        await setSpaceLive(space.id, false).catch((rollbackErr) => {
          logger.error('spaces.start_now.rollback_failed', {
            err: rollbackErr,
            spaceId: space.id,
          });
        });
        return NextResponse.json(
          {
            error: 'atproto_failed',
            message: atproto.error ?? 'Failed to publish live status.',
          },
          { status: 502 }
        );
      }

      // Recording is best-effort. If the Egress service is unreachable or
      // misconfigured the host is still live; we surface a `recordingError`
      // field in the response envelope so the client can warn the host.
      let recordingError: string | undefined;
      try {
        const existing = await findActiveRecordingForSpace(liveSpace.id);
        if (!existing) {
          const roomName = roomNameForSpace(liveSpace.id);
          const startedAt = new Date();
          const s3Key = buildRecordingKey(roomName, startedAt);
          const started = await startRecording(roomName, { filepath: s3Key });
          if (started) {
            await createRecording({
              spaceId: liveSpace.id,
              hostDid: user.did,
              egressId: started.egressId,
              s3Key,
              contentType: 'video/mp4',
              now: startedAt,
            });
          } else {
            recordingError = 'recording_unavailable';
            logger.warn('recording.start.unavailable', {
              spaceId: liveSpace.id,
            });
          }
        }
      } catch (err) {
        recordingError =
          err instanceof Error ? err.message : 'recording_failed';
        logger.error('recording.start.failed', { err, spaceId: space.id });
      }

      return NextResponse.json(
        {
          space: toPublicSpace(liveSpace, origin),
          startNow: true,
          token: hostToken.token,
          wsUrl: hostToken.wsUrl,
          role: 'host',
          roomName: hostToken.roomName,
          identity: hostToken.identity,
          handle: user.handle,
          displayName: hostProfile?.displayName ?? null,
          avatarUrl: hostProfile?.avatarUrl ?? null,
          ...(recordingError ? { recordingError } : {}),
        },
        { status: 201 }
      );
    } catch (err) {
      // Any unexpected error after we transitioned the space to live must
      // roll the row back to `active` so it does not look permanently
      // live to viewers.
      await setSpaceLive(space.id, false).catch((rollbackErr) => {
        logger.error('spaces.start_now.rollback_failed', {
          err: rollbackErr,
          spaceId: space.id,
        });
      });
      logger.error('spaces.start_now.failed', { err, spaceId: space.id });
      return NextResponse.json(
        {
          error: 'start_now_failed',
          message:
            err instanceof Error ? err.message : 'Failed to start space.',
        },
        { status: 500 }
      );
    }
  }

  // ---- Default / scheduled flow -----------------------------------------
  return NextResponse.json(
    { space: toPublicSpace(space, origin) },
    { status: 201 }
  );
}
