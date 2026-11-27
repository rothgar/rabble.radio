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

export interface ActivityWindow {
  /** The last 7 days. */
  current: number;
  /** The 7 days before that. */
  previous: number;
}

export interface WeeklyActivityPoint {
  /** ISO date (yyyy-mm-dd) the 7-day bucket starts on. */
  weekStart: string;
  signUps: number;
  showsHosted: number;
  listenerJoins: number;
}

export interface PlatformActivity {
  signUps: ActivityWindow;
  showsHosted: ActivityWindow;
  hoursHosted: ActivityWindow;
  listenerJoins: ActivityWindow;
  distinctListeners: ActivityWindow;
  peakConcurrentListeners: ActivityWindow;
  reactions: ActivityWindow;
  likes: ActivityWindow;
  /** Last 12 weeks, most recent (last 7 days) first. */
  weeklySeries: WeeklyActivityPoint[];
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WEEKS_OF_SERIES = 12;

/** Prisma/D1 stores DateTime as text in this exact format; match it so a
 * raw-SQL range comparison on the column can use a plain index on it
 * instead of falling back to a full scan. */
function toSqliteIso(d: Date): string {
  return d.toISOString().replace('Z', '+00:00');
}

function toNumber(value: unknown): number {
  return value === null || value === undefined ? 0 : Number(value);
}

/** Turns `{ week, count }` rows (week 0 = last 7 days, 11 = 12 weeks ago)
 * into a dense 12-length array in the same order, zero-filling gaps. */
function seriesFromBuckets(rows: { week: bigint | number; count: bigint | number }[]): number[] {
  const byWeek = new Map(rows.map((r) => [Number(r.week), toNumber(r.count)]));
  return Array.from({ length: WEEKS_OF_SERIES }, (_, i) => byWeek.get(i) ?? 0);
}

/**
 * Sign-ups, shows, listening and engagement for the last 7 days next to the
 * 7 days before that, plus a 12-week weekly series — the "is the platform
 * active right now" section above the user list (issue #178). Every query
 * is a single aggregate (conditional SUM/MAX/COUNT DISTINCT) over a range
 * scan on an indexed date column (`prisma/d1/0015_activity_indexes.sql`),
 * never a row scan reduced in JS.
 */
export async function getPlatformActivity(now: Date = new Date()): Promise<PlatformActivity> {
  const nowIso = toSqliteIso(now);
  const last7Iso = toSqliteIso(new Date(now.getTime() - WEEK_MS));
  const prev7Iso = toSqliteIso(new Date(now.getTime() - 2 * WEEK_MS));
  const seriesStartIso = toSqliteIso(new Date(now.getTime() - WEEKS_OF_SERIES * WEEK_MS));

  const [
    [signUpsRow],
    [sessionsRow],
    [participationRow],
    [reactionsRow],
    [likesRow],
    signUpWeeks,
    showWeeks,
    joinWeeks,
  ] = await Promise.all([
    prisma.$queryRaw<{ current: number; previous: number }[]>`
      SELECT
        COALESCE(SUM(CASE WHEN "createdAt" >= ${last7Iso} THEN 1 ELSE 0 END), 0) AS current,
        COALESCE(SUM(CASE WHEN "createdAt" < ${last7Iso} THEN 1 ELSE 0 END), 0) AS previous
      FROM "User"
      WHERE "createdAt" >= ${prev7Iso} AND "createdAt" < ${nowIso}
    `,
    prisma.$queryRaw<
      {
        showsCurrent: number;
        showsPrevious: number;
        secondsCurrent: number;
        secondsPrevious: number;
        peakCurrent: number | null;
        peakPrevious: number | null;
      }[]
    >`
      SELECT
        COALESCE(SUM(CASE WHEN "startedAt" >= ${last7Iso} THEN 1 ELSE 0 END), 0) AS showsCurrent,
        COALESCE(SUM(CASE WHEN "startedAt" < ${last7Iso} THEN 1 ELSE 0 END), 0) AS showsPrevious,
        COALESCE(SUM(CASE WHEN "startedAt" >= ${last7Iso} THEN "durationSeconds" ELSE 0 END), 0) AS secondsCurrent,
        COALESCE(SUM(CASE WHEN "startedAt" < ${last7Iso} THEN "durationSeconds" ELSE 0 END), 0) AS secondsPrevious,
        MAX(CASE WHEN "startedAt" >= ${last7Iso} THEN "peakListeners" END) AS peakCurrent,
        MAX(CASE WHEN "startedAt" < ${last7Iso} THEN "peakListeners" END) AS peakPrevious
      FROM "ShowSession"
      WHERE "startedAt" >= ${prev7Iso} AND "startedAt" < ${nowIso}
    `,
    prisma.$queryRaw<
      { joinsCurrent: number; joinsPrevious: number; distinctCurrent: number; distinctPrevious: number }[]
    >`
      SELECT
        COALESCE(SUM(CASE WHEN "joinedAt" >= ${last7Iso} THEN 1 ELSE 0 END), 0) AS joinsCurrent,
        COALESCE(SUM(CASE WHEN "joinedAt" < ${last7Iso} THEN 1 ELSE 0 END), 0) AS joinsPrevious,
        COUNT(DISTINCT CASE WHEN "joinedAt" >= ${last7Iso} AND "anonymous" = 0 THEN "identity" END) AS distinctCurrent,
        COUNT(DISTINCT CASE WHEN "joinedAt" < ${last7Iso} AND "anonymous" = 0 THEN "identity" END) AS distinctPrevious
      FROM "ShowParticipation"
      WHERE "role" = 'listener' AND "joinedAt" >= ${prev7Iso} AND "joinedAt" < ${nowIso}
    `,
    prisma.$queryRaw<{ current: number; previous: number }[]>`
      SELECT
        COALESCE(SUM(CASE WHEN "createdAt" >= ${last7Iso} THEN 1 ELSE 0 END), 0) AS current,
        COALESCE(SUM(CASE WHEN "createdAt" < ${last7Iso} THEN 1 ELSE 0 END), 0) AS previous
      FROM "ShowReaction"
      WHERE "createdAt" >= ${prev7Iso} AND "createdAt" < ${nowIso}
    `,
    prisma.$queryRaw<{ current: number; previous: number }[]>`
      SELECT
        COALESCE(SUM(CASE WHEN "createdAt" >= ${last7Iso} THEN 1 ELSE 0 END), 0) AS current,
        COALESCE(SUM(CASE WHEN "createdAt" < ${last7Iso} THEN 1 ELSE 0 END), 0) AS previous
      FROM "ShowLike"
      WHERE "createdAt" >= ${prev7Iso} AND "createdAt" < ${nowIso}
    `,
    prisma.$queryRaw<{ week: number; count: number }[]>`
      SELECT CAST((julianday(${nowIso}) - julianday("createdAt")) / 7 AS INTEGER) AS week, COUNT(*) AS count
      FROM "User"
      WHERE "createdAt" > ${seriesStartIso} AND "createdAt" < ${nowIso}
      GROUP BY week
    `,
    prisma.$queryRaw<{ week: number; count: number }[]>`
      SELECT CAST((julianday(${nowIso}) - julianday("startedAt")) / 7 AS INTEGER) AS week, COUNT(*) AS count
      FROM "ShowSession"
      WHERE "startedAt" > ${seriesStartIso} AND "startedAt" < ${nowIso}
      GROUP BY week
    `,
    prisma.$queryRaw<{ week: number; count: number }[]>`
      SELECT CAST((julianday(${nowIso}) - julianday("joinedAt")) / 7 AS INTEGER) AS week, COUNT(*) AS count
      FROM "ShowParticipation"
      WHERE "role" = 'listener' AND "joinedAt" > ${seriesStartIso} AND "joinedAt" < ${nowIso}
      GROUP BY week
    `,
  ]);

  const signUpSeries = seriesFromBuckets(signUpWeeks);
  const showSeries = seriesFromBuckets(showWeeks);
  const joinSeries = seriesFromBuckets(joinWeeks);
  const weeklySeries: WeeklyActivityPoint[] = Array.from({ length: WEEKS_OF_SERIES }, (_, i) => ({
    weekStart: new Date(now.getTime() - (i + 1) * WEEK_MS).toISOString().slice(0, 10),
    signUps: signUpSeries[i],
    showsHosted: showSeries[i],
    listenerJoins: joinSeries[i],
  }));

  return {
    signUps: { current: toNumber(signUpsRow?.current), previous: toNumber(signUpsRow?.previous) },
    showsHosted: { current: toNumber(sessionsRow?.showsCurrent), previous: toNumber(sessionsRow?.showsPrevious) },
    hoursHosted: {
      current: Math.round((toNumber(sessionsRow?.secondsCurrent) / 3600) * 10) / 10,
      previous: Math.round((toNumber(sessionsRow?.secondsPrevious) / 3600) * 10) / 10,
    },
    listenerJoins: {
      current: toNumber(participationRow?.joinsCurrent),
      previous: toNumber(participationRow?.joinsPrevious),
    },
    distinctListeners: {
      current: toNumber(participationRow?.distinctCurrent),
      previous: toNumber(participationRow?.distinctPrevious),
    },
    peakConcurrentListeners: {
      current: toNumber(sessionsRow?.peakCurrent),
      previous: toNumber(sessionsRow?.peakPrevious),
    },
    reactions: { current: toNumber(reactionsRow?.current), previous: toNumber(reactionsRow?.previous) },
    likes: { current: toNumber(likesRow?.current), previous: toNumber(likesRow?.previous) },
    weeklySeries,
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
