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
import { resolveSpaceForUser, setSpaceLive, toPublicSpace } from '@/lib/spaces';
import { getCurrentUser } from '@/lib/session';
import {
  deleteLiveStatus,
  publishLiveStatus,
} from '@/lib/atproto';
import {
  completeRecording,
  createRecording,
  failRecording,
  findActiveRecordingForSpace,
  buildRecordingKey,
} from '@/lib/recording';
import {
  broadcastRoomData,
  roomNameForSpace,
  setAudienceSubscriptions,
  startRecording,
  stopRecording,
} from '@/lib/livekit';
import { logger } from '@/lib/logger';
import { endShowSession, startShowSession } from '@/lib/metrics';
import { pushRemindersOnAir } from '@/lib/push';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface LiveBody {
  action?: unknown;
  thumb?: unknown;
}

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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { ok: false, error: 'not_found' },
      { status: 404 }
    );
  }

  let body: LiveBody;
  try {
    body = (await request.json()) as LiveBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json', message: 'Body must be JSON.' },
      { status: 400 }
    );
  }

  const action = typeof body.action === 'string' ? body.action : '';
  if (action !== 'start' && action !== 'end') {
    return NextResponse.json(
      {
        ok: false,
        error: 'validation_error',
        message: "action must be 'start' or 'end'.",
      },
      { status: 400 }
    );
  }

  const resolved = await resolveSpaceForUser(id, user.did);
  if (!resolved) {
    return NextResponse.json(
      { ok: false, error: 'not_found' },
      { status: 404 }
    );
  }
  const { space, isHost } = resolved;
  if (!isHost) {
    return NextResponse.json(
      { ok: false, error: 'forbidden', message: 'Only the host can toggle live state.' },
      { status: 403 }
    );
  }

  const origin = originFromRequest(request);
  const spaceUrl = `${origin}/show/${space.id}`;
  const session = { did: user.did, handle: user.handle };
  const thumb =
    typeof body.thumb === 'string' && body.thumb.length > 0
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
        return NextResponse.json(
          {
            ok: false,
            error: 'atproto_failed',
            message: result.error ?? 'Failed to publish live status.',
          },
          { status: 502 }
        );
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
      // awaited: the Worker may not keep running after the response.
      await pushRemindersOnAir(
        { id: space.id, title: space.title, host: { handle: user.handle, displayName: null } },
        origin
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
        recordingError =
          err instanceof Error ? err.message : 'recording_failed';
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
    const updated = await setSpaceLive(space.id, false);
    await endShowSession({ spaceId: space.id });
    const result = await deleteLiveStatus({ session });

    // Back to the green room: only the stage hears itself.
    await setAudienceSubscriptions(roomName, false);
    await broadcastRoomData(roomName, {
      type: 'on_air_changed',
      spaceId: space.id,
      onAir: false,
    });

    // Stop any active recording for this space. Best-effort.
    try {
      const active = await findActiveRecordingForSpace(space.id);
      if (active) {
        await stopRecording(active.egressId);
        const completed = await completeRecording(active.egressId);
        if (!completed) {
          await failRecording(active.egressId).catch(() => undefined);
        }
      }
    } catch (err) {
      logger.error('recording.stop.failed', { err, spaceId: space.id });
    }

    return NextResponse.json(
      {
        ok: true,
        space: toPublicSpace(updated, origin),
        atproto: result.ok,
        atprotoError: result.ok ? undefined : result.error,
      },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: 'live_failed',
        message: err instanceof Error ? err.message : 'Live action failed.',
      },
      { status: 500 }
    );
  }
}
