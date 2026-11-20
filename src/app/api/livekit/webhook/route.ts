// src/app/api/livekit/webhook/route.ts
//
// POST /api/livekit/webhook
//
// Receives LiveKit server webhooks (configured under `webhook:` in the
// LiveKit server config) and turns participant_joined / participant_left
// events into presence records for show metrics. Events are authenticated
// with the LiveKit API key/secret via the SDK's WebhookReceiver; anything
// that fails verification gets a 401.
//
// A show otherwise starts and ends through POST /api/spaces/[id]/live, not
// when the LiveKit room is created or torn down. The one exception: when a
// participant_left leaves a live show with nobody left on stage (no
// publish-rights participants), this route ends the show itself — the host
// who would normally call that route is the one who just left.
//
// Other event types are acknowledged and ignored.

import { NextResponse, type NextRequest } from 'next/server';
import { WebhookReceiver } from 'livekit-server-sdk';
import {
  getLiveKitConfig,
  getRoomParticipantSummary,
  LiveKitConfigError,
  roomNameForSpace,
  spaceIdFromRoomName,
} from '@/lib/livekit';
import { recordJoin, recordLeave, type ParticipantRole } from '@/lib/metrics';
import { getSpaceById } from '@/lib/spaces';
import { endLiveShow } from '@/lib/live';
import { createLogger, correlationIdFromRequest } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// A participant reconnecting (not actually leaving) can briefly read as a
// zero-speaker room: LiveKit syncs their new session's `canPublish` a moment
// after it appears in `listParticipants`, and `getRoomParticipantSummary`
// defaults that unsynced window to listener (see REVIEW.md,
// src/lib/livekit.ts). A second reading after this delay confirms the room
// is actually empty of speakers before taking an irreversible action.
const SPEAKER_RECHECK_DELAY_MS = 1500;

let receiver: WebhookReceiver | null = null;

function getReceiver(): WebhookReceiver {
  if (!receiver) {
    const { apiKey, apiSecret } = getLiveKitConfig();
    receiver = new WebhookReceiver(apiKey, apiSecret);
  }
  return receiver;
}

interface ParticipantLike {
  identity?: string;
  permission?: { canPublish?: boolean } | null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const log = createLogger({ correlationId: correlationIdFromRequest(request) });
  const body = await request.text();
  const authorization = request.headers.get('authorization') ?? '';

  let event: Awaited<ReturnType<WebhookReceiver['receive']>>;
  try {
    event = await getReceiver().receive(body, authorization);
  } catch (err) {
    if (err instanceof LiveKitConfigError) {
      log.error('livekit.webhook.misconfigured', { err });
      return NextResponse.json({ error: 'livekit_misconfigured' }, { status: 500 });
    }
    log.warn('livekit.webhook.rejected', { err });
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  const name = event.event;
  if (name !== 'participant_joined' && name !== 'participant_left') {
    return NextResponse.json({ ok: true, ignored: name }, { status: 200 });
  }

  const roomName = event.room?.name ?? '';
  const spaceId = spaceIdFromRoomName(roomName);
  const participant = (event.participant ?? null) as ParticipantLike | null;
  const identity = participant?.identity ?? '';
  if (!spaceId || !identity) {
    return NextResponse.json({ ok: true, ignored: name }, { status: 200 });
  }

  const space = await getSpaceById(spaceId);
  if (!space) {
    return NextResponse.json({ ok: true, ignored: 'unknown_space' }, { status: 200 });
  }

  if (name === 'participant_joined') {
    const role: ParticipantRole =
      identity === space.hostId
        ? 'host'
        : participant?.permission?.canPublish
          ? 'speaker'
          : 'listener';
    await recordJoin({ spaceId: space.id, identity, role });
  } else {
    await recordLeave({ spaceId: space.id, identity });

    if (space.isLive) {
      const summary = await getRoomParticipantSummary(roomNameForSpace(space.id));
      if (summary && summary.speakers === 0) {
        await new Promise((resolve) => setTimeout(resolve, SPEAKER_RECHECK_DELAY_MS));
        const recheck = await getRoomParticipantSummary(roomNameForSpace(space.id));
        if (recheck && recheck.speakers === 0) {
          await endLiveShow(space.id, { did: space.hostId });
          log.debug('livekit.webhook.auto_ended', { spaceId: space.id, identity });
        }
      }
    }
  }

  log.debug('livekit.webhook.recorded', { event: name, spaceId: space.id, identity });
  return NextResponse.json({ ok: true, event: name }, { status: 200 });
}
