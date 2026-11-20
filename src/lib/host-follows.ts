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
 * Follows whose host has a live show right now and have not fired for this
 * session yet. Marks them notified so the next poll does not repeat them.
 * Shape matches DueReminder (src/lib/reminders.ts) so clients can treat
 * both the same way.
 */
export async function takeDueHostFollows(did: string, now: Date = new Date()): Promise<DueHostFollow[]> {
  const follows = await prisma.hostFollow.findMany({
    where: { did, notifiedAt: null },
    select: { hostDid: true },
  });
  if (follows.length === 0) return [];
  const hostDids = follows.map((f) => f.hostDid);
  const liveSpaces = await prisma.space.findMany({
    where: { isLive: true, hostId: { in: hostDids } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      title: true,
      hostId: true,
      host: { select: { did: true, handle: true, displayName: true, avatarUrl: true } },
    },
  });
  if (liveSpaces.length === 0) return [];

  // One due item per live host: if a host somehow has two spaces live at
  // once, their oldest space wins (see REVIEW.md on this file for the gap
  // that leaves — the other room's HostFollow row is still marked notified).
  const byHost = new Map<string, (typeof liveSpaces)[number]>();
  for (const space of liveSpaces) {
    if (!byHost.has(space.hostId)) byHost.set(space.hostId, space);
  }
  const dueHostDids = [...byHost.keys()];

  await prisma.hostFollow.updateMany({
    where: { did, hostDid: { in: dueHostDids } },
    data: { notifiedAt: now },
  });

  return dueHostDids.map((hostDid) => {
    const space = byHost.get(hostDid) as (typeof liveSpaces)[number];
    return {
      spaceId: space.id,
      title: space.title,
      host: {
        did: space.host.did,
        handle: space.host.handle,
        displayName: space.host.displayName ?? null,
        avatarUrl: space.host.avatarUrl ?? null,
      },
    };
  });
}
