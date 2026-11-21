// src/lib/space-extras.ts
//
// Attach the per-viewer and per-recording fields to PublicSpace rows:
//   - `replay`: the newest playable recording for off-air shows, so the
//     clients can offer "Replay" instead of a join button.
//   - `reminded`: whether the viewer set "Notify me" on the show.
//   - `hostSubscribed`: whether the viewer follows the host (any show).
//   - `showFollowed`: whether the viewer follows this exact named show.
//   - `onStageHosts`: the host plus up to 3 current on-stage speakers, for
//     live shows; just the host otherwise.
// Kept out of `toPublicSpace` so that stays a pure mapper.

import type { PublicHost, PublicReplay, PublicSpace } from '@/types';
import { getLatestAvailableRecordings, recordingDurationSeconds, type RecordingRow } from '@/lib/recording';
import { getRemindedSpaceIds } from '@/lib/reminders';
import { getFollowedHostDids } from '@/lib/host-follows';
import { getFollowedSpaceIds } from '@/lib/show-follows';
import { getFollowedDids, getPresentIdentities } from '@/lib/follows';
import { getTunedInCounts } from '@/lib/metrics';
import { getUsersByDid } from '@/lib/users';
import { listActiveSpeakersForSpaces } from '@/lib/stage';

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
  const liveIds = spaces.filter((s) => s.isLive).map((s) => s.id);
  // Every lookup is a decoration: if one fails the listing still renders.
  const [replays, reminded, subscribed, showFollowed, followed, present, tunedIn, speakers] = await Promise.all([
    Promise.resolve()
      .then(() => getLatestAvailableRecordings(offAirIds))
      .catch(() => new Map<string, RecordingRow>()),
    Promise.resolve()
      .then(() => getRemindedSpaceIds(viewerDid, ids))
      .catch(() => new Set<string>()),
    Promise.resolve()
      .then(() => getFollowedHostDids(viewerDid, spaces.map((s) => s.host.did)))
      .catch(() => new Set<string>()),
    Promise.resolve()
      .then(() => getFollowedSpaceIds(viewerDid, ids))
      .catch(() => new Set<string>()),
    Promise.resolve()
      .then(() => (viewerDid ? getFollowedDids(viewerDid) : new Set<string>()))
      .catch(() => new Set<string>()),
    Promise.resolve()
      .then(() => (viewerDid && liveIds.length > 0 ? getPresentIdentities(liveIds) : new Map<string, string[]>()))
      .catch(() => new Map<string, string[]>()),
    Promise.resolve()
      .then(() => (liveIds.length > 0 ? getTunedInCounts(liveIds) : new Map<string, number>()))
      .catch(() => new Map<string, number>()),
    Promise.resolve()
      .then(() => (liveIds.length > 0 ? listActiveSpeakersForSpaces(liveIds) : new Map<string, string[]>()))
      .catch(() => new Map<string, string[]>()),
  ]);

  // Profiles for followed people in rooms and on-stage speakers, one lookup
  // for all shows.
  const followedPresent = new Map<string, string[]>();
  const needProfiles = new Set<string>();
  for (const [spaceId, identities] of present) {
    const hits = identities.filter((d) => followed.has(d) && d !== viewerDid);
    if (hits.length > 0) {
      followedPresent.set(spaceId, hits);
      hits.forEach((d) => needProfiles.add(d));
    }
  }
  for (const s of spaces) {
    for (const d of speakers.get(s.id) ?? []) {
      if (d !== s.host.did) needProfiles.add(d);
    }
  }
  const profiles = new Map<string, PublicHost>();
  if (needProfiles.size > 0) {
    const rows = await Promise.resolve()
      .then(() => getUsersByDid([...needProfiles]))
      .catch(() => []);
    for (const u of rows) {
      profiles.set(u.did, { did: u.did, handle: u.handle, displayName: u.displayName ?? null, avatarUrl: u.avatarUrl ?? null });
    }
  }

  return spaces.map((s) => {
    const rec = replays.get(s.id);
    const inRoom = (followedPresent.get(s.id) ?? [])
      .map((d) => profiles.get(d))
      .filter((p): p is PublicHost => Boolean(p));
    const extraHosts = [...new Set(speakers.get(s.id) ?? [])]
      .filter((d) => d !== s.host.did)
      .map((d) => profiles.get(d))
      .filter((p): p is PublicHost => Boolean(p));
    return {
      ...s,
      replay: rec ? toPublicReplay(rec) : null,
      reminded: reminded.has(s.id),
      onStageHosts: [s.host, ...extraHosts].slice(0, 4),
      hostSubscribed: subscribed.has(s.host.did),
      showFollowed: showFollowed.has(s.id),
      tunedInCount: tunedIn.get(s.id) ?? s.tunedInCount,
      ...(viewerDid
        ? { hostFollowed: followed.has(s.host.did), followedInRoom: inRoom }
        : {}),
    };
  });
}
