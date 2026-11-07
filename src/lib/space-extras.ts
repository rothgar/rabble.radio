// src/lib/space-extras.ts
//
// Attach the per-viewer and per-recording fields to PublicSpace rows:
//   - `replay`: the newest playable recording for off-air shows, so the
//     clients can offer "Replay" instead of a join button.
//   - `reminded`: whether the viewer set "Notify me" on the show.
// Kept out of `toPublicSpace` so that stays a pure mapper.

import type { PublicReplay, PublicSpace } from '@/types';
import { getLatestAvailableRecordings, recordingDurationSeconds, type RecordingRow } from '@/lib/recording';
import { getRemindedSpaceIds } from '@/lib/reminders';

export function toPublicReplay(row: RecordingRow): PublicReplay {
  return {
    recordingId: row.id,
    audioUrl: `/api/recordings/${encodeURIComponent(row.id)}/audio`,
    contentType: row.contentType,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    durationSeconds: recordingDurationSeconds(row),
    sizeBytes: row.sizeBytes,
  };
}

export async function decoratePublicSpaces(
  spaces: PublicSpace[],
  viewerDid: string | null
): Promise<PublicSpace[]> {
  if (spaces.length === 0) return spaces;
  const ids = spaces.map((s) => s.id);
  const offAirIds = spaces.filter((s) => !s.isLive).map((s) => s.id);
  // Both lookups are decorations: if either fails the listing still renders.
  const [replays, reminded] = await Promise.all([
    Promise.resolve()
      .then(() => getLatestAvailableRecordings(offAirIds))
      .catch(() => new Map<string, RecordingRow>()),
    Promise.resolve()
      .then(() => getRemindedSpaceIds(viewerDid, ids))
      .catch(() => new Set<string>()),
  ]);
  return spaces.map((s) => {
    const rec = replays.get(s.id);
    return {
      ...s,
      replay: rec ? toPublicReplay(rec) : null,
      reminded: reminded.has(s.id),
    };
  });
}
