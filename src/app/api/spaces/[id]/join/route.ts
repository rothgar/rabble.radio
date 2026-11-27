// src/app/api/spaces/[id]/join/route.ts
//
// POST /api/spaces/[id]/join
//
// Mint a LiveKit access token scoped to the requested space. The caller is
// treated as the space host iff their session DID matches the space's
// hostId; every other signed-in user joins as audience. Visitors without a
// session join as anonymous listeners: a listen-only token under a synthetic
// `anon:<uuid>` identity that counts toward the room's listener total but is
// never rendered as an active participant and cannot be invited to stage.
// That identity is kept in the `ANON_ID_COOKIE` cookie (set below) so a
// refresh reuses the same ShowParticipation row instead of minting a new
// one on every join (issue #184); a cookie that isn't a plausible anonymous
// identity is ignored and a fresh one is minted.
//
// While the show is off air (space.isLive === false) audience tokens carry
// `canSubscribe: false`, so only the host and the co-hosts on stage can hear
// each other. The live route flips the permission for everyone in the room
// when the host goes on air.
//
// Returns:
//   { token, wsUrl, role, roomName, identity, handle, displayName, avatarUrl, anonymous }

import { NextResponse, type NextRequest } from 'next/server';
import {
  createRoom,
  generateToken,
  getLiveKitClient,
  LiveKitConfigError,
  roomNameForSpace,
  type SpaceRole,
} from '@/lib/livekit';
import { resolveSpace } from '@/lib/spaces';
import { getCurrentUser } from '@/lib/session';
import { jsonError } from '@/lib/api';
import { isBlocked } from '@/lib/stage';
import { prisma } from '@/lib/db';
import { createLogger, correlationIdFromRequest } from '@/lib/logger';
import { newAnonymousIdentity } from '@/lib/anonymous';
import { getIceServers, type IceServer } from '@/lib/turn';
import { recordJoin } from '@/lib/metrics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ANON_ID_COOKIE = 'rabble_anon_id';
const ANON_ID_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
/** `anon:` plus the uuid (or the non-crypto fallback) newAnonymousIdentity() mints. */
const ANON_ID_PATTERN = /^anon:[A-Za-z0-9-]{1,80}$/;

/** The caller's existing anonymous identity, from its cookie, or a freshly minted one. */
function anonymousIdentityFor(request: NextRequest): string {
  const cookie = request.cookies.get(ANON_ID_COOKIE)?.value;
  return cookie && ANON_ID_PATTERN.test(cookie) ? cookie : newAnonymousIdentity();
}

interface JoinResponseBody {
  token: string;
  wsUrl: string;
  role: SpaceRole;
  roomName: string;
  identity: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** True when the caller had no session and received a listen-only token. */
  anonymous: boolean;
  /** True while the show is on air. Off air, audience tokens cannot subscribe. */
  onAir: boolean;
  /**
   * STUN/TURN servers minted for this participant (Cloudflare TURN). Absent
   * when no relay is configured or the credential request failed; clients
   * then use the SFU's own ICE server list, which only works on the LAN.
   */
  iceServers?: IceServer[];
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const correlationId = correlationIdFromRequest(request);
  const log = createLogger({ correlationId });
  const sessionUser = await getCurrentUser();
  const anonymous = sessionUser === null;
  const user = sessionUser ?? { did: anonymousIdentityFor(request), handle: '' };

  const { id } = await context.params;
  if (!id) {
    return jsonError(404, 'not_found');
  }

  // Resolve by primary key first, then fall back to slug so shareable URLs
  // work either way. Match the behaviour of GET /api/spaces/[id].
  const space = await resolveSpace(id);
  if (!space) {
    return jsonError(404, 'not_found');
  }

  // A listener the host blocked from this show stays out.
  if (!anonymous && (await isBlocked(space.id, user.did))) {
    return jsonError(403, 'blocked', 'You have been removed from this show.');
  }

  const role: SpaceRole =
    !anonymous && user.did === space.hostId ? 'host' : 'audience';
  const roomName = roomNameForSpace(space.id);

  try {
    // createRoom is idempotent and skipped if the room already exists.
    await createRoom(space.id);
  } catch (err) {
    // If LiveKit is unreachable we still want the call to fail cleanly rather
    // than hang. Surface a 503 so the UI can show a retry button.
    log.error('livekit.join.create_room_failed', { err, spaceId: space.id, did: user.did });
    return jsonError(503, 'livekit_unavailable', 'Could not reach the LiveKit server.', {
      correlationId,
    });
  }

  // Ensure the client is reachable; if not, this throws LiveKitConfigError.
  getLiveKitClient();

  // Resolve the latest displayName / avatarUrl from the User row so the
  // client can render a friendly header label without a follow-up
  // /api/users round-trip. Falls back to empty strings (not the raw DID)
  // if the row is missing for any reason.
  const profile = anonymous
    ? null
    : await prisma.user.findUnique({
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

  // Relay credentials are best-effort: a Cloudflare outage must not stop LAN
  // listeners, who can reach the SFU without one.
  let iceServers: IceServer[] | undefined;
  try {
    iceServers = (await getIceServers()) ?? undefined;
  } catch (err) {
    log.warn('turn.credentials_failed', { err, spaceId: space.id, did: user.did });
  }

  try {
    const { token, wsUrl } = await generateToken({
      room: roomName,
      identity: user.did,
      role,
      name: anonymous ? 'Listener' : user.handle,
      canSubscribe: role === 'host' ? true : space.isLive,
    });
    await recordJoin({
      spaceId: space.id,
      identity: user.did,
      role: role === 'host' ? 'host' : 'listener',
    });
    log.info('livekit.join.token_minted', {
      spaceId: space.id,
      did: user.did,
      role,
      anonymous,
      relay: iceServers !== undefined,
    });
    const response = NextResponse.json(
      {
        token,
        wsUrl,
        role,
        roomName,
        identity: user.did,
        handle: user.handle,
        displayName: profile?.displayName ?? null,
        anonymous,
        avatarUrl: profile?.avatarUrl ?? null,
        onAir: space.isLive,
        ...(iceServers ? { iceServers } : {}),
      } satisfies JoinResponseBody,
      { status: 200 }
    );
    if (anonymous) {
      response.cookies.set(ANON_ID_COOKIE, user.did, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: ANON_ID_MAX_AGE_SECONDS,
      });
    }
    return response;
  } catch (err) {
    if (err instanceof LiveKitConfigError) {
      log.error('livekit.join.config_error', { err, spaceId: space.id });
      return jsonError(500, 'livekit_misconfigured', 'LiveKit is not configured correctly.', {
        correlationId,
      });
    }
    log.error('livekit.join.token_failed', { err, spaceId: space.id });
    return jsonError(500, 'token_failed', 'Failed to mint LiveKit token.', { correlationId });
  }
}
