// src/lib/show-follows.ts
//
// "Follow this show" — notified whenever this exact named show (Space)
// goes live as its host, not any other show the same host appears on.
// Space.hostId never changes after creation, so scoping by spaceId alone
// keeps a guest appearance on someone else's show from firing this.
// A ShowFollow row is reused across many live sessions, so `notifiedAt` is
// cleared each time the show goes live (resetShowFollowNotifications)
// instead of firing once ever, mirroring host-follows.ts.

import { prisma } from '@/lib/db';

export interface DueShowFollow {
  spaceId: string;
  title: string;
  host: { did: string; handle: string; displayName: string | null; avatarUrl: string | null };
}

/** Turn a show follow on or off. Returns the resulting state. */
export async function setShowFollow(spaceId: string, did: string, on: boolean): Promise<boolean> {
  if (on) {
    await prisma.showFollow.upsert({
      where: { spaceId_did: { spaceId, did } },
      create: { spaceId, did },
      update: {},
    });
    return true;
  }
  await prisma.showFollow.deleteMany({ where: { spaceId, did } });
  return false;
}

export async function hasShowFollow(spaceId: string, did: string): Promise<boolean> {
  const row = await prisma.showFollow.findUnique({ where: { spaceId_did: { spaceId, did } } });
  return Boolean(row);
}

/** Which of these shows the viewer already follows. */
export async function getFollowedSpaceIds(did: string | null, spaceIds: string[]): Promise<Set<string>> {
  if (!did || spaceIds.length === 0) return new Set();
  const rows = await prisma.showFollow.findMany({
    where: { did, spaceId: { in: spaceIds } },
    select: { spaceId: true },
  });
  return new Set(rows.map((r) => r.spaceId));
}

/**
 * A show is about to go live: clear its followers' notified flag so this
 * new session is due again, even for people notified during a past one.
 */
export async function resetShowFollowNotifications(spaceId: string): Promise<void> {
  await prisma.showFollow.updateMany({
    where: { spaceId, notifiedAt: { not: null } },
    data: { notifiedAt: null },
  });
}

/**
 * Follows whose show is live right now and have not fired for this session
 * yet. Marks them notified so the next poll does not repeat them. Shape
 * matches DueReminder (src/lib/reminders.ts) so clients can treat all three
 * kinds the same way.
 */
export async function takeDueShowFollows(did: string, now: Date = new Date()): Promise<DueShowFollow[]> {
  const follows = await prisma.showFollow.findMany({
    where: { did, notifiedAt: null },
    select: { spaceId: true },
  });
  if (follows.length === 0) return [];
  const spaceIds = follows.map((f) => f.spaceId);
  const liveSpaces = await prisma.space.findMany({
    where: { isLive: true, id: { in: spaceIds } },
    select: {
      id: true,
      title: true,
      host: { select: { did: true, handle: true, displayName: true, avatarUrl: true } },
    },
  });
  if (liveSpaces.length === 0) return [];

  const dueSpaceIds = liveSpaces.map((s) => s.id);
  await prisma.showFollow.updateMany({
    where: { did, spaceId: { in: dueSpaceIds } },
    data: { notifiedAt: now },
  });

  return liveSpaces.map((space) => ({
    spaceId: space.id,
    title: space.title,
    host: {
      did: space.host.did,
      handle: space.host.handle,
      displayName: space.host.displayName ?? null,
      avatarUrl: space.host.avatarUrl ?? null,
    },
  }));
}
