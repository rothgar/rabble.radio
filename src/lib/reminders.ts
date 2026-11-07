// src/lib/reminders.ts
//
// "Notify me" for scheduled shows. A reminder is one row per (show, viewer).
// Delivery is pull-based: the web and mobile clients ask for *due*
// reminders (the show is now on air and the viewer has not been told yet),
// and we stamp `notifiedAt` as we hand them out so each fires once.

import { prisma } from '@/lib/db';

export interface DueReminder {
  spaceId: string;
  title: string;
  host: { did: string; handle: string; displayName: string | null; avatarUrl: string | null };
}

export interface ReminderSummary {
  spaceId: string;
  title: string;
  status: string;
  scheduledAt: string | null;
  isLive: boolean;
  notifiedAt: string | null;
}

/** Turn a reminder on or off. Returns the resulting state. */
export async function setReminder(spaceId: string, did: string, on: boolean): Promise<boolean> {
  if (on) {
    await prisma.showReminder.upsert({
      where: { spaceId_did: { spaceId, did } },
      create: { spaceId, did },
      update: {},
    });
    return true;
  }
  await prisma.showReminder.deleteMany({ where: { spaceId, did } });
  return false;
}

export async function hasReminder(spaceId: string, did: string): Promise<boolean> {
  const row = await prisma.showReminder.findUnique({ where: { spaceId_did: { spaceId, did } } });
  return Boolean(row);
}

/** Which of these shows the viewer has a reminder on. */
export async function getRemindedSpaceIds(did: string | null, spaceIds: string[]): Promise<Set<string>> {
  if (!did || spaceIds.length === 0) return new Set();
  const rows = await prisma.showReminder.findMany({
    where: { did, spaceId: { in: spaceIds } },
    select: { spaceId: true },
  });
  return new Set(rows.map((r) => r.spaceId));
}

function iso(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

/** Every reminder the viewer has set, newest first. */
export async function listReminders(did: string): Promise<ReminderSummary[]> {
  const rows = await prisma.showReminder.findMany({
    where: { did },
    orderBy: { createdAt: 'desc' },
    include: { space: { select: { id: true, title: true, status: true, scheduledAt: true, isLive: true } } },
  });
  return rows.map((r) => ({
    spaceId: r.space.id,
    title: r.space.title,
    status: r.space.status,
    scheduledAt: iso(r.space.scheduledAt),
    isLive: Boolean(r.space.isLive),
    notifiedAt: iso(r.notifiedAt),
  }));
}

/**
 * Reminders whose show is on air and that have not fired yet. Marks them
 * notified so the next poll does not repeat them.
 */
export async function takeDueReminders(did: string, now: Date = new Date()): Promise<DueReminder[]> {
  const rows = await prisma.showReminder.findMany({
    where: { did, notifiedAt: null, space: { isLive: true } },
    include: { space: { select: { id: true, title: true, host: true } } },
  });
  if (rows.length === 0) return [];
  await prisma.showReminder.updateMany({
    where: { did, spaceId: { in: rows.map((r) => r.spaceId) } },
    data: { notifiedAt: now },
  });
  return rows.map((r) => ({
    spaceId: r.space.id,
    title: r.space.title,
    host: {
      did: r.space.host.did,
      handle: r.space.host.handle,
      displayName: r.space.host.displayName ?? null,
      avatarUrl: r.space.host.avatarUrl ?? null,
    },
  }));
}
