// src/lib/admin.ts
//
// Platform admin dashboard: overview counts, build version and per-user
// ban/kick actions. Reading /admin and acting through POST /api/admin/users
// is limited to the DIDs or handles listed in the ADMIN_DIDS environment
// variable (comma separated) — the same allowlist shape as FEEDBACK_ADMIN_DIDS
// and REPORT_ADMIN_DIDS (src/lib/feedback.ts, src/lib/reports.ts).
//
// A ban is account-level: getCurrentUser (src/lib/session.ts) treats a
// banned DID as signed out everywhere, and the OAuth callback refuses to
// start a new session for one. Banning also disconnects the user from any
// room they are currently in; kicking alone does the disconnect without the
// persistent ban.

import { prisma } from '@/lib/db';
import { removeParticipant, roomNameForSpace } from '@/lib/livekit';
import { recordLeave } from '@/lib/metrics';
import { endLiveShow } from '@/lib/live';
import { logger } from '@/lib/logger';
import { didAllowlist, isAllowlisted } from '@/lib/did-allowlist';

/** Parse ADMIN_DIDS (DIDs, comma separated). */
export function adminDids(env: Record<string, string | undefined> = process.env): Set<string> {
  return didAllowlist(env.ADMIN_DIDS);
}

export function isAdmin(
  user: { did: string; handle: string } | null | undefined,
  env: Record<string, string | undefined> = process.env
): boolean {
  return isAllowlisted(user, adminDids(env));
}

export interface PlatformOverview {
  totalUsers: number;
  bannedUsers: number;
  totalShows: number;
  liveNow: number;
  totalSessions: number;
  /** Short git SHA baked into this build (next.config.js), or null. */
  buildId: string | null;
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const [totalUsers, bannedUsers, totalShows, liveNow, totalSessions] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { bannedAt: { not: null } } }),
    prisma.space.count(),
    prisma.space.count({ where: { isLive: true } }),
    prisma.showSession.count(),
  ]);
  return {
    totalUsers,
    bannedUsers,
    totalShows,
    liveNow,
    totalSessions,
    buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? null,
  };
}

export interface AdminUserRow {
  did: string;
  handle: string;
  displayName: string | null;
  createdAt: Date;
  bannedAt: Date | null;
  banReason: string | null;
}

const userSelect = {
  did: true,
  handle: true,
  displayName: true,
  createdAt: true,
  bannedAt: true,
  banReason: true,
} as const;

export async function listUsersForAdmin(limit = 50): Promise<AdminUserRow[]> {
  return prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.max(1, Math.min(limit, 500)),
    select: userSelect,
  });
}

export class AdminActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminActionError';
  }
}

/**
 * Disconnects `did` from every room they currently hold an open presence in,
 * and ends any show they currently host live (src/lib/live.ts) — otherwise a
 * kicked or banned host's Space would stay isLive forever, since the normal
 * "end show" route requires the host's own, no-longer-usable session.
 */
export async function kickFromPlatform(did: string): Promise<number> {
  const active = await prisma.showParticipation.findMany({
    where: { identity: did, leftAt: null },
    select: { spaceId: true },
  });
  let kicked = 0;
  for (const { spaceId } of active) {
    const removed = await removeParticipant(roomNameForSpace(spaceId), did);
    if (removed) kicked += 1;
    await recordLeave({ spaceId, identity: did });
  }

  const hosted = await prisma.space.findMany({
    where: { hostId: did, isLive: true },
    select: { id: true },
  });
  for (const { id: spaceId } of hosted) {
    try {
      await endLiveShow(spaceId, { did });
    } catch (err) {
      logger.error('admin.end_live_show_failed', { err, spaceId, did });
    }
  }

  return kicked;
}

export async function banUser(did: string, reason: string | null): Promise<AdminUserRow> {
  if (!did) throw new AdminActionError('did is required.');
  const existing = await prisma.user.findUnique({ where: { did }, select: { did: true } });
  if (!existing) throw new AdminActionError('user_not_found');
  const row = await prisma.user.update({
    where: { did },
    data: { bannedAt: new Date(), banReason: reason?.trim() || null },
    select: userSelect,
  });
  await kickFromPlatform(did);
  return row;
}

export async function unbanUser(did: string): Promise<AdminUserRow> {
  if (!did) throw new AdminActionError('did is required.');
  const existing = await prisma.user.findUnique({ where: { did }, select: { did: true } });
  if (!existing) throw new AdminActionError('user_not_found');
  return prisma.user.update({
    where: { did },
    data: { bannedAt: null, banReason: null },
    select: userSelect,
  });
}
