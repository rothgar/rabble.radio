// src/lib/host-follows.ts
//
// "Follow this host" — notified whenever any of their shows goes live
// (scheduled or instant-started), unlike ShowReminder which is scoped to
// one scheduled show. A HostFollow row is reused across many live
// sessions, so `notifiedAt` is cleared each time the host goes live
// (resetHostFollowNotifications) instead of firing once ever.

import { prisma } from '@/lib/db';

export interface DueHostFollow {
  spaceId: string;
  title: string;
  host: { did: string; handle: string; displayName: string | null; avatarUrl: string | null };
}

/** Turn a host follow on or off. Returns the resulting state. */
export async function setHostFollow(hostDid: string, did: string, on: boolean): Promise<boolean> {
  if (on) {
    await prisma.hostFollow.upsert({
      where: { hostDid_did: { hostDid, did } },
      create: { hostDid, did },
      update: {},
    });
    return true;
  }
  await prisma.hostFollow.deleteMany({ where: { hostDid, did } });
  return false;
}

export async function hasHostFollow(hostDid: string, did: string): Promise<boolean> {
  const row = await prisma.hostFollow.findUnique({ where: { hostDid_did: { hostDid, did } } });
  return Boolean(row);
}

/** Which of these hosts the viewer already follows. */
export async function getFollowedHostDids(did: string | null, hostDids: string[]): Promise<Set<string>> {
  if (!did || hostDids.length === 0) return new Set();
  const rows = await prisma.hostFollow.findMany({
    where: { did, hostDid: { in: hostDids } },
    select: { hostDid: true },
  });
  return new Set(rows.map((r) => r.hostDid));
}

/**
 * A host is about to go live: clear their followers' notified flag so this
 * new session is due again, even for people notified during a past one.
 */
export async function resetHostFollowNotifications(hostDid: string): Promise<void> {
  await prisma.hostFollow.updateMany({
    where: { hostDid, notifiedAt: { not: null } },
    data: { notifiedAt: null },
  });
}

/**
 * Follows whose followed person is on-air right now — hosting or guesting
 * as a speaker (StageSpeaker, added by acceptStageInvite) — and have not
 * fired for this session yet. Marks them notified so the next poll does not
 * repeat them. Shape matches DueReminder (src/lib/reminders.ts) so clients
 * can treat both the same way.
 */
export async function takeDueHostFollows(did: string, now: Date = new Date()): Promise<DueHostFollow[]> {
  const follows = await prisma.hostFollow.findMany({
    where: { did, notifiedAt: null },
    select: { hostDid: true },
  });
  if (follows.length === 0) return [];
  const hostDids = follows.map((f) => f.hostDid);
  const liveSpaces = await prisma.space.findMany({
    where: {
      isLive: true,
      OR: [{ hostId: { in: hostDids } }, { speakers: { some: { identity: { in: hostDids } } } }],
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      title: true,
      hostId: true,
      host: { select: { did: true, handle: true, displayName: true, avatarUrl: true } },
      speakers: { where: { identity: { in: hostDids } }, select: { identity: true } },
    },
  });
  if (liveSpaces.length === 0) return [];

  // One due item per followed person on air: if someone is somehow on-air
  // (as host or guest) on two spaces at once, the oldest space wins (see
  // REVIEW.md on this file for the gap that leaves — the other room's
  // HostFollow row is still marked notified).
  const byOnAirDid = new Map<string, (typeof liveSpaces)[number]>();
  const guestDids = new Set<string>();
  for (const space of liveSpaces) {
    const onAirDids = new Set(space.speakers.map((s) => s.identity));
    if (hostDids.includes(space.hostId)) onAirDids.add(space.hostId);
    for (const onAirDid of onAirDids) {
      if (byOnAirDid.has(onAirDid)) continue;
      byOnAirDid.set(onAirDid, space);
      if (onAirDid !== space.hostId) guestDids.add(onAirDid);
    }
  }
  const dueDids = [...byOnAirDid.keys()];
  if (dueDids.length === 0) return [];

  const guestProfiles =
    guestDids.size > 0
      ? await prisma.user.findMany({
          where: { did: { in: [...guestDids] } },
          select: { did: true, handle: true, displayName: true, avatarUrl: true },
        })
      : [];
  const guestProfileByDid = new Map(guestProfiles.map((u) => [u.did, u]));

  await prisma.hostFollow.updateMany({
    where: { did, hostDid: { in: dueDids } },
    data: { notifiedAt: now },
  });

  return dueDids.map((onAirDid) => {
    const space = byOnAirDid.get(onAirDid) as (typeof liveSpaces)[number];
    const profile = onAirDid === space.hostId ? space.host : guestProfileByDid.get(onAirDid);
    return {
      spaceId: space.id,
      title: space.title,
      host: {
        did: onAirDid,
        handle: profile?.handle ?? '',
        displayName: profile?.displayName ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
      },
    };
  });
}
