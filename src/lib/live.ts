// src/lib/live.ts
//
// Shared "end show" teardown, used by POST /api/spaces/[id]/live (action:
// 'end', the host ending their own show) and by src/lib/admin.ts (an admin
// kicking or banning a host who is currently live). Flips Space.isLive off,
// closes the open ShowSession, deletes the host's app.bsky.actor.status/self
// record and stops any active recording. Does not check who may call it —
// callers authorize first.

import {
  broadcastRoomData,
  roomNameForSpace,
  setAudienceSubscriptions,
  stopRecording,
} from '@/lib/livekit';
import { deleteLiveStatus, type BlueskySessionLike, type LiveStatusResult } from '@/lib/atproto';
import { completeRecording, failRecording, findActiveRecordingForSpace } from '@/lib/recording';
import { endShowSession } from '@/lib/metrics';
import { setSpaceLive, type SpaceWithHost } from '@/lib/spaces';
import { logger } from '@/lib/logger';

export interface EndLiveShowResult {
  space: SpaceWithHost;
  atproto: LiveStatusResult;
}

export async function endLiveShow(
  spaceId: string,
  session: BlueskySessionLike
): Promise<EndLiveShowResult> {
  const roomName = roomNameForSpace(spaceId);
  const updated = await setSpaceLive(spaceId, false);
  await endShowSession({ spaceId });
  const atproto = await deleteLiveStatus({ session });

  // Back to the green room: only the stage hears itself.
  await setAudienceSubscriptions(roomName, false);
  await broadcastRoomData(roomName, {
    type: 'on_air_changed',
    spaceId,
    onAir: false,
  });

  // Stop any active recording for this space. Best-effort.
  try {
    const active = await findActiveRecordingForSpace(spaceId);
    if (active) {
      await stopRecording(active.egressId);
      const completed = await completeRecording(active.egressId);
      if (!completed) {
        await failRecording(active.egressId).catch(() => undefined);
      }
    }
  } catch (err) {
    logger.error('recording.stop.failed', { err, spaceId });
  }

  return { space: updated, atproto };
}
