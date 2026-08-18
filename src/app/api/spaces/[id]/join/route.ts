// src/app/api/spaces/[id]/join/route.ts
//
// POST /api/spaces/[id]/join
//
// Mint a LiveKit access token scoped to the requested space. Requires an
// authenticated session. The caller is treated as the space host iff their
// session DID matches the space's hostId; everyone else joins as audience.
//
// Returns:
//   { token, wsUrl, role, roomName }

import { NextResponse, type NextRequest } from 'next/server';
import {
  createRoom,
  generateToken,
  getLiveKitClient,
  LiveKitConfigError,
  roomNameForSpace,
  type SpaceRole,
} from '@/lib/livekit';
import { getSpaceById, getSpaceBySlug } from '@/lib/spaces';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { createLogger, correlationIdFromRequest } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface JoinResponseBody {
  token: string;
  wsUrl: string;
  role: SpaceRole;
  roomName: string;
  identity: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface ErrorBody {
  error: string;
  message?: string;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse<JoinResponseBody | ErrorBody>> {
  const correlationId = correlationIdFromRequest(request);
  const log = createLogger({ correlationId });
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Resolve by primary key first, then fall back to slug so shareable URLs
  // work either way. Match the behaviour of GET /api/spaces/[id].
  let space = await getSpaceById(id);
  if (!space) {
    space = await getSpaceBySlug(id);
  }
  if (!space) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const role: SpaceRole =
    user.did === space.hostId ? 'host' : 'audience';
  const roomName = roomNameForSpace(space.id);

  try {
    // createRoom is idempotent and skipped if the room already exists.
    await createRoom(space.id);
  } catch (err) {
    // If LiveKit is unreachable we still want the call to fail cleanly rather
    // than hang. Surface a 503 so the UI can show a retry button.
    log.error('livekit.join.create_room_failed', { err, spaceId: space.id, did: user.did });
    return NextResponse.json(
      {
        error: 'livekit_unavailable',
        message:
          err instanceof Error
            ? err.message
            : 'Could not reach the LiveKit server.',
        correlationId,
      },
      { status: 503 }
    );
  }

  // Ensure the client is reachable; if not, this throws LiveKitConfigError.
  getLiveKitClient();

  // Resolve the latest displayName / avatarUrl from the User row so the
  // client can render a friendly header label without a follow-up
  // /api/users round-trip. Falls back to empty strings (not the raw DID)
  // if the row is missing for any reason.
  const profile = await prisma.user.findUnique({
    where: { did: user.did },
    select: { displayName: true, avatarUrl: true },
  });
  // Diagnostic: log the resolved avatarUrl at debug level so we can
  // confirm whether the database has the value before the response
  // leaves the server. Temporary aid; remove once avatar rendering is
  // verified end-to-end.
  log.debug('livekit.join.profile_resolved', {
    did: user.did,
    avatarUrl: profile?.avatarUrl ?? null,
  });

  try {
    const { token, wsUrl } = await generateToken({
      room: roomName,
      identity: user.did,
      role,
      name: user.handle,
    });
    log.info('livekit.join.token_minted', {
      spaceId: space.id,
      did: user.did,
      role,
    });
    return NextResponse.json(
      {
        token,
        wsUrl,
        role,
        roomName,
        identity: user.did,
        handle: user.handle,
        displayName: profile?.displayName ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
      } satisfies JoinResponseBody,
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof LiveKitConfigError) {
      log.error('livekit.join.config_error', { err, spaceId: space.id });
      return NextResponse.json(
        { error: 'livekit_misconfigured', message: err.message, correlationId },
        { status: 500 }
      );
    }
    log.error('livekit.join.token_failed', { err, spaceId: space.id });
    return NextResponse.json(
      {
        error: 'token_failed',
        message:
          err instanceof Error ? err.message : 'Failed to mint LiveKit token.',
        correlationId,
      },
      { status: 500 }
    );
  }
}
