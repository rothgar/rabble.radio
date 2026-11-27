// src/app/api/spaces/[id]/live/route.ts
//
// POST /api/spaces/[id]/live
//
// Toggle the host's "on air" state. Requires authentication and host role.
//   action: 'start' -> set Space.isLive=true, open the audience's subscribe
//                      permission so listeners hear the stage, publish the
//                      app.bsky.actor.status/self record with an external
//                      embed pointing at the space URL, open a ShowSession
//                      and start the recording.
//   action: 'end'   -> set Space.isLive=false, close the audience's
//                      subscribe permission again, delete the record, end
//                      the session and stop the recording.
//
// Every participant in the room gets an `on_air_changed` data message so
// their UI follows without a reload.
//
// Response:
//   { ok: true, space: PublicSpace, record?: unknown }
//   { ok: false, error: string, message?: string }

import { NextResponse, type NextRequest } from 'next/server';
import {
  defaultPublicOrigin,
  originFromRequest,
  resolveSpaceForUser,
  setSpaceLive,
  toPublicSpace,
} from '@/lib/spaces';
import { jsonError, readJson, requireUser } from '@/lib/api';
import { publishLiveStatus } from '@/lib/atproto';
import {
  createRecording,
  findActiveRecordingForSpace,
  buildRecordingKey,
} from '@/lib/recording';
import {
  broadcastRoomData,
  roomNameForSpace,
  setAudienceSubscriptions,
  startRecording,
} from '@/lib/livekit';
import { logger } from '@/lib/logger';
import { endShowSession, startShowSession } from '@/lib/metrics';
import { pushHostFollowersOnAir, pushRemindersOnAir, pushShowFollowersOnAir } from '@/lib/push';
import { endLiveShow } from '@/lib/live';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface LiveBody {
  action?: unknown;
  thumb?: unknown;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await requireUser({ ok: false });
  if (user instanceof NextResponse) return user;

  const { id } = await context.params;
  if (!id) {
    return jsonError(404, 'not_found', undefined, { ok: false });
  }

  const body = await readJson<LiveBody>(request, 'Body must be JSON.', { ok: false });
  if (body instanceof NextResponse) return body;

  const action = typeof body.action === 'string' ? body.action : '';
  if (action !== 'start' && action !== 'end') {
    return jsonError(400, 'validation_error', "action must be 'start' or 'end'.", { ok: false });
  }

  const resolved = await resolveSpaceForUser(id, user.did);
  if (!resolved) {
    return jsonError(404, 'not_found', undefined, { ok: false });
  }
  const { space, isHost } = resolved;
  if (!isHost) {
    return jsonError(403, 'forbidden', 'Only the host can toggle live state.', { ok: false });
  }

  // The response's `space` reflects the request's own origin (fine: it's
  // only shown back to this browser), but anything written to Bluesky or a
  // push payload must use the canonical public origin, never the request
  // Host.
  const origin = originFromRequest(request);
  const spaceUrl = `${defaultPublicOrigin()}/show/${space.id}`;
  const session = { did: user.did, handle: user.handle };
  const thumb =
    typeof body.thumb === 'string' &&
    body.thumb.length > 0 &&
    body.thumb.length <= 2048 &&
    body.thumb.startsWith('https://')
      ? body.thumb
      : undefined;

  const roomName = roomNameForSpace(space.id);

  try {
    if (action === 'start') {
      const updated = await setSpaceLive(space.id, true);
      await startShowSession({
        spaceId: space.id,
        hostDid: user.did,
        tags: space.tags,
      });
      const result = await publishLiveStatus({
        session,
        spaceUrl,
        title: space.title,
        thumb,
      });
      if (!result.ok) {
        // Roll back the flag if ATProto publish failed so the UI does not
        // believe it is live when the banner is missing.
        await setSpaceLive(space.id, false).catch(() => undefined);
        await endShowSession({ spaceId: space.id });
        logger.warn('live.start.atproto_failed', { spaceId: space.id, error: result.error });
        return jsonError(502, 'atproto_failed', 'Failed to publish live status.', { ok: false });
      }

      // Let the audience hear the stage. Listeners who joined during the
      // pre-show hold tokens without the subscribe grant; flipping it here
      // makes LiveKit subscribe them to the published tracks.
      const opened = await setAudienceSubscriptions(roomName, true);
      if (opened < 0) {
        logger.warn('live.start.audience_subscriptions_failed', { spaceId: space.id });
      }
      await broadcastRoomData(roomName, {
        type: 'on_air_changed',
        spaceId: space.id,
        onAir: true,
      });

      // Web Push to everyone who asked to be notified. Best-effort and
      // awaited: the Worker may not keep running after the response. The
      // notification's URL must be the canonical public origin, never the
      // request Host.
      await pushRemindersOnAir(
        { id: space.id, title: space.title, host: { handle: user.handle, displayName: null } },
        defaultPublicOrigin()
      );
      await pushHostFollowersOnAir(
        { id: space.id, title: space.title, host: { did: user.did, handle: user.handle, displayName: null } },
        defaultPublicOrigin()
      );
      await pushShowFollowersOnAir(
        { id: space.id, title: space.title, host: { handle: user.handle, displayName: null } },
        defaultPublicOrigin()
      );

      // Recording is best-effort: if the Egress service is unreachable or
      // misconfigured we still want the host to be live. We only return an
      // error in the JSON envelope when startRecording fails; the space
      // itself is already marked live.
      let recordingError: string | undefined;
      try {
        const existing = await findActiveRecordingForSpace(space.id);
        if (!existing) {
          const startedAt = new Date();
          const s3Key = buildRecordingKey(roomName, startedAt);
          const started = await startRecording(roomName, { filepath: s3Key });
          if (started) {
            await createRecording({
              spaceId: space.id,
              hostDid: user.did,
              egressId: started.egressId,
              s3Key,
              contentType: 'audio/mp4',
              now: startedAt,
            });
          } else {
            recordingError = 'recording_unavailable';
            logger.warn('recording.start.unavailable', {
              spaceId: space.id,
            });
          }
        }
      } catch (err) {
        recordingError = 'recording_failed';
        logger.error('recording.start.failed', { err, spaceId: space.id });
      }

      return NextResponse.json(
        {
          ok: true,
          space: toPublicSpace(updated, origin),
          record: result.record,
          uri: result.uri,
          ...(recordingError ? { recordingError } : {}),
        },
        { status: 200 }
      );
    }

    // action === 'end'
    const { space: updated, atproto } = await endLiveShow(space.id, session);

    return NextResponse.json(
      {
        ok: true,
        space: toPublicSpace(updated, origin),
        atproto: atproto.ok,
        atprotoError: atproto.ok ? undefined : atproto.error,
      },
      { status: 200 }
    );
  } catch (err) {
    logger.error('live.action_failed', { err, spaceId: space.id, action });
    return jsonError(500, 'live_failed', 'Live action failed.', { ok: false });
  }
}
