// src/lib/metrics.ts
//
// Show metrics. A Space ("station") can go live many times; each run is a
// ShowSession ("show"). While a session is open we track who is in the room
// (ShowParticipation), reactions and likes. When it ends we roll the totals
// up into the Space, the host's per-topic leaderboard rows (HostTopicStats)
// and the per-topic totals (TopicStats).
//
// Everything here is best-effort from the caller's point of view: a metrics
// failure must never stop someone joining, reacting or going live, so the
// public entry points swallow and log Prisma errors.
//
// Sources of truth for presence:
//   - POST /api/spaces/[id]/join records the intent to join (so metrics work
//     even without webhooks).
//   - The LiveKit webhook (/api/livekit/webhook) records actual joins and
//     leaves, which is what makes peak and stage-time numbers accurate.
//   - Stage changes come from src/lib/stage.ts.

import { prisma } from '@/lib/db';
import { isAnonymousIdentity } from '@/lib/anonymous';
import { logger } from '@/lib/logger';
import type { Prisma, ShowSession } from '@prisma/client';

/** An open session with its tag rows flattened to strings. */
export type OpenSession = ShowSession & { tags: string[] };

const sessionInclude = { tags: { select: { tag: true } } } as const;

function flattenSession<T extends { tags?: Array<{ tag: string } | string> }>(
  row: T
): Omit<T, 'tags'> & { tags: string[] } {
  const { tags, ...rest } = row;
  return { ...rest, tags: (tags ?? []).map((t) => (typeof t === 'string' ? t : t.tag)) };
}

export type ParticipantRole = 'listener' | 'speaker' | 'host';

/** Tag used for a host's all-topics HostTopicStats row. */
export const ALL_TOPICS = '*';

const ROLE_RANK: Record<ParticipantRole, number> = {
  listener: 0,
  speaker: 1,
  host: 2,
};

function asRole(value: string): ParticipantRole {
  return value === 'host' || value === 'speaker' ? value : 'listener';
}

function higherRole(a: string, b: ParticipantRole): ParticipantRole {
  const current = asRole(a);
  return ROLE_RANK[b] > ROLE_RANK[current] ? b : current;
}

function onStage(role: ParticipantRole): boolean {
  return role !== 'listener';
}

function secondsBetween(from: Date | null | undefined, to: Date): number {
  if (!from) return 0;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
}

function swallow(event: string, fields: Record<string, unknown>): (err: unknown) => undefined {
  return (err) => {
    logger.warn(event, { ...fields, err });
    return undefined;
  };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function getOpenSession(spaceId: string): Promise<OpenSession | null> {
  const row = await prisma.showSession.findFirst({
    where: { spaceId, endedAt: null },
    orderBy: { startedAt: 'desc' },
    include: sessionInclude,
  });
  return row ? flattenSession(row) : null;
}

export interface StartShowSessionInput {
  spaceId: string;
  hostDid: string;
  tags: readonly string[];
  now?: Date;
}

/**
 * Open a session for a Space going live. Idempotent: an already-open session
 * is returned untouched so a double "start" never splits one show in two.
 */
export async function startShowSession(
  input: StartShowSessionInput
): Promise<OpenSession | undefined> {
  const now = input.now ?? new Date();
  return (async () => {
    const existing = await getOpenSession(input.spaceId);
    if (existing) return existing;
    const created = await prisma.showSession.create({
      data: {
        spaceId: input.spaceId,
        hostDid: input.hostDid,
        tags: { create: input.tags.filter((t) => t.length > 0).map((tag) => ({ tag })) },
        startedAt: now,
      },
      include: sessionInclude,
    });
    return flattenSession(created);
  })().catch(swallow('metrics.session.start_failed', { spaceId: input.spaceId }));
}

export interface EndShowSessionInput {
  spaceId: string;
  now?: Date;
}

/**
 * Close the open session for a Space and roll its totals up. No-op when the
 * Space has no open session (e.g. the sweep expiring a never-live Space).
 */
export async function endShowSession(
  input: EndShowSessionInput
): Promise<ShowSession | undefined> {
  const now = input.now ?? new Date();
  return (async () => {
    const session = await getOpenSession(input.spaceId);
    if (!session) return undefined;

    // Everyone still in the room leaves with the show.
    const stillPresent = await prisma.showParticipation.findMany({
      where: { sessionId: session.id, leftAt: null },
    });
    for (const p of stillPresent) {
      await prisma.showParticipation.update({
        where: { id: p.id },
        data: {
          leftAt: now,
          stageSeconds: p.stageSeconds + secondsBetween(p.stageSince, now),
          stageSince: null,
        },
      });
    }

    const everyone = await prisma.showParticipation.findMany({
      where: { sessionId: session.id },
    });
    const listeners = everyone.filter((p) => p.identity !== session.hostDid);
    const guests = listeners.filter((p) => !p.anonymous && asRole(p.role) !== 'listener');
    const durationSeconds = secondsBetween(session.startedAt, now);
    const uniqueListeners = listeners.length;
    const topics = session.tags.filter((t) => t.length > 0);
    const hostRows = [ALL_TOPICS, ...topics];

    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.showSession.update({
        where: { id: session.id },
        data: {
          endedAt: now,
          durationSeconds,
          uniqueListeners,
          guestCount: guests.length,
        },
      }),
      prisma.space.update({
        where: { id: session.spaceId },
        data: {
          sessionCount: { increment: 1 },
          hostedSeconds: { increment: durationSeconds },
          totalListeners: { increment: uniqueListeners },
          lastLiveAt: now,
        },
      }),
    ];

    for (const tag of hostRows) {
      ops.push(
        prisma.hostTopicStats.upsert({
          where: { hostDid_tag: { hostDid: session.hostDid, tag } },
          create: {
            hostDid: session.hostDid,
            tag,
            showsHosted: 1,
            listeners: uniqueListeners,
            reactions: session.reactionCount,
            likes: session.likeCount,
            hostedSeconds: durationSeconds,
            lastLiveAt: now,
          },
          update: {
            showsHosted: { increment: 1 },
            listeners: { increment: uniqueListeners },
            reactions: { increment: session.reactionCount },
            likes: { increment: session.likeCount },
            hostedSeconds: { increment: durationSeconds },
            lastLiveAt: now,
          },
        })
      );
      for (const guest of guests) {
        const guestSeconds = guest.stageSeconds + secondsBetween(guest.stageSince, now);
        ops.push(
          prisma.hostTopicStats.upsert({
            where: { hostDid_tag: { hostDid: guest.identity, tag } },
            create: {
              hostDid: guest.identity,
              tag,
              guestAppearances: 1,
              guestSeconds,
              lastLiveAt: now,
            },
            update: {
              guestAppearances: { increment: 1 },
              guestSeconds: { increment: guestSeconds },
              lastLiveAt: now,
            },
          })
        );
      }
    }

    for (const tag of topics) {
      ops.push(
        prisma.topicStats.upsert({
          where: { tag },
          create: {
            tag,
            shows: 1,
            listeners: uniqueListeners,
            reactions: session.reactionCount,
            likes: session.likeCount,
            hostedSeconds: durationSeconds,
            lastLiveAt: now,
          },
          update: {
            shows: { increment: 1 },
            listeners: { increment: uniqueListeners },
            reactions: { increment: session.reactionCount },
            likes: { increment: session.likeCount },
            hostedSeconds: { increment: durationSeconds },
            lastLiveAt: now,
          },
        })
      );
    }

    const [updated] = (await prisma.$transaction(ops)) as [ShowSession, ...unknown[]];
    return { ...updated, tags: session.tags };
  })().catch(swallow('metrics.session.end_failed', { spaceId: input.spaceId }));
}

// ---------------------------------------------------------------------------
// Presence
// ---------------------------------------------------------------------------

export interface PresenceInput {
  spaceId: string;
  identity: string;
  now?: Date;
}

export interface JoinInput extends PresenceInput {
  role: ParticipantRole;
}

/** Record a participant entering the room of a live show. */
export async function recordJoin(input: JoinInput): Promise<void> {
  const now = input.now ?? new Date();
  await (async () => {
    const session = await getOpenSession(input.spaceId);
    if (!session) return;
    const stage = onStage(input.role);
    const existing = await prisma.showParticipation.findUnique({
      where: { sessionId_identity: { sessionId: session.id, identity: input.identity } },
    });
    if (existing) {
      await prisma.showParticipation.update({
        where: { id: existing.id },
        data: {
          leftAt: null,
          role: higherRole(existing.role, input.role),
          stageSince: stage ? (existing.stageSince ?? now) : existing.stageSince,
        },
      });
    } else {
      await prisma.showParticipation.create({
        data: {
          sessionId: session.id,
          spaceId: session.spaceId,
          identity: input.identity,
          anonymous: isAnonymousIdentity(input.identity),
          role: input.role,
          joinedAt: now,
          stageSince: stage ? now : null,
        },
      });
    }
    const present = await prisma.showParticipation.count({
      where: { sessionId: session.id, leftAt: null, NOT: { identity: session.hostDid } },
    });
    if (present > session.peakListeners) {
      await prisma.showSession.update({
        where: { id: session.id },
        data: { peakListeners: present },
      });
    }
  })().catch(swallow('metrics.join_failed', { spaceId: input.spaceId, identity: input.identity }));
}

/** Record a participant leaving the room (webhook, kick, or disconnect). */
export async function recordLeave(input: PresenceInput): Promise<void> {
  const now = input.now ?? new Date();
  await (async () => {
    const session = await getOpenSession(input.spaceId);
    if (!session) return;
    const existing = await prisma.showParticipation.findUnique({
      where: { sessionId_identity: { sessionId: session.id, identity: input.identity } },
    });
    if (!existing || existing.leftAt) return;
    await prisma.showParticipation.update({
      where: { id: existing.id },
      data: {
        leftAt: now,
        stageSeconds: existing.stageSeconds + secondsBetween(existing.stageSince, now),
        stageSince: null,
      },
    });
  })().catch(swallow('metrics.leave_failed', { spaceId: input.spaceId, identity: input.identity }));
}

export interface StageChangeInput extends PresenceInput {
  onStage: boolean;
}

/** Record a participant stepping onto or off the stage. */
export async function recordStageChange(input: StageChangeInput): Promise<void> {
  const now = input.now ?? new Date();
  await (async () => {
    const session = await getOpenSession(input.spaceId);
    if (!session) return;
    const existing = await prisma.showParticipation.findUnique({
      where: { sessionId_identity: { sessionId: session.id, identity: input.identity } },
    });
    if (!existing) {
      if (!input.onStage) return;
      await prisma.showParticipation.create({
        data: {
          sessionId: session.id,
          spaceId: session.spaceId,
          identity: input.identity,
          anonymous: isAnonymousIdentity(input.identity),
          role: 'speaker',
          joinedAt: now,
          stageSince: now,
        },
      });
      return;
    }
    if (input.onStage) {
      await prisma.showParticipation.update({
        where: { id: existing.id },
        data: {
          role: higherRole(existing.role, 'speaker'),
          stageSince: existing.stageSince ?? now,
        },
      });
    } else if (existing.stageSince) {
      await prisma.showParticipation.update({
        where: { id: existing.id },
        data: {
          stageSeconds: existing.stageSeconds + secondsBetween(existing.stageSince, now),
          stageSince: null,
        },
      });
    }
  })().catch(swallow('metrics.stage_failed', { spaceId: input.spaceId, identity: input.identity }));
}

// ---------------------------------------------------------------------------
// Reactions and likes
// ---------------------------------------------------------------------------

export interface ReactionInput {
  spaceId: string;
  did: string;
  kind?: string;
  now?: Date;
}

/** Store one reaction and bump the open session's counter. */
export async function recordReaction(input: ReactionInput): Promise<void> {
  const now = input.now ?? new Date();
  await (async () => {
    const session = await getOpenSession(input.spaceId);
    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.showReaction.create({
        data: {
          spaceId: input.spaceId,
          sessionId: session?.id ?? null,
          did: input.did,
          kind: input.kind ?? 'reaction',
          createdAt: now,
        },
      }),
    ];
    if (session) {
      ops.push(
        prisma.showSession.update({
          where: { id: session.id },
          data: { reactionCount: { increment: 1 } },
        })
      );
    }
    await prisma.$transaction(ops);
  })().catch(swallow('metrics.reaction_failed', { spaceId: input.spaceId }));
}

export interface LikeInput {
  spaceId: string;
  did: string;
  now?: Date;
}

export interface LikeResult {
  liked: boolean;
  likeCount: number;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

/**
 * Like a show on behalf of a signed-in user. Idempotent: liking twice keeps
 * one like. Throws on database errors (the caller returns a 500).
 */
export async function likeShow(input: LikeInput): Promise<LikeResult> {
  const now = input.now ?? new Date();
  const space = await prisma.space.findUnique({
    where: { id: input.spaceId },
    select: { id: true, hostId: true, tags: { select: { tag: true } }, likeCount: true },
  });
  if (!space) throw new Error('space_not_found');
  const spaceTags = space.tags.map((t) => (typeof t === 'string' ? t : t.tag));

  try {
    await prisma.showLike.create({
      data: { spaceId: space.id, did: input.did, createdAt: now },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { liked: true, likeCount: space.likeCount };
    throw err;
  }

  const session = await getOpenSession(space.id);
  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.space.update({
      where: { id: space.id },
      data: { likeCount: { increment: 1 } },
      select: { likeCount: true },
    }),
  ];
  if (session) {
    ops.push(
      prisma.showSession.update({
        where: { id: session.id },
        data: { likeCount: { increment: 1 } },
      })
    );
  } else {
    // Outside a live session the like still counts for the host's standing.
    for (const tag of [ALL_TOPICS, ...spaceTags]) {
      ops.push(
        prisma.hostTopicStats.upsert({
          where: { hostDid_tag: { hostDid: space.hostId, tag } },
          create: { hostDid: space.hostId, tag, likes: 1 },
          update: { likes: { increment: 1 } },
        })
      );
    }
    for (const tag of spaceTags) {
      ops.push(
        prisma.topicStats.upsert({
          where: { tag },
          create: { tag, likes: 1 },
          update: { likes: { increment: 1 } },
        })
      );
    }
  }
  const [updated] = (await prisma.$transaction(ops)) as [{ likeCount: number }, ...unknown[]];
  return { liked: true, likeCount: updated.likeCount };
}

/** Remove a user's like. Idempotent. */
export async function unlikeShow(input: LikeInput): Promise<LikeResult> {
  const space = await prisma.space.findUnique({
    where: { id: input.spaceId },
    select: { id: true, hostId: true, tags: { select: { tag: true } }, likeCount: true },
  });
  if (!space) throw new Error('space_not_found');
  const spaceTags = space.tags.map((t) => (typeof t === 'string' ? t : t.tag));

  const removed = await prisma.showLike.deleteMany({
    where: { spaceId: space.id, did: input.did },
  });
  if (removed.count === 0) return { liked: false, likeCount: space.likeCount };

  const session = await getOpenSession(space.id);
  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.space.update({
      where: { id: space.id },
      data: { likeCount: { decrement: 1 } },
      select: { likeCount: true },
    }),
  ];
  if (session) {
    ops.push(
      prisma.showSession.update({
        where: { id: session.id },
        data: { likeCount: { decrement: 1 } },
      })
    );
  } else {
    for (const tag of [ALL_TOPICS, ...spaceTags]) {
      ops.push(
        prisma.hostTopicStats.updateMany({
          where: { hostDid: space.hostId, tag, likes: { gt: 0 } },
          data: { likes: { decrement: 1 } },
        })
      );
    }
    for (const tag of spaceTags) {
      ops.push(
        prisma.topicStats.updateMany({
          where: { tag, likes: { gt: 0 } },
          data: { likes: { decrement: 1 } },
        })
      );
    }
  }
  const [updated] = (await prisma.$transaction(ops)) as [{ likeCount: number }, ...unknown[]];
  return { liked: false, likeCount: Math.max(0, updated.likeCount) };
}

export async function hasLiked(spaceId: string, did: string): Promise<boolean> {
  const like = await prisma.showLike.findUnique({
    where: { spaceId_did: { spaceId, did } },
    select: { id: true },
  });
  return like !== null;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type LeaderboardSort =
  | 'listeners'
  | 'hostedSeconds'
  | 'reactions'
  | 'likes'
  | 'showsHosted';

export interface LeaderboardQuery {
  /** A topic tag, or omit for the all-topics board. */
  tag?: string;
  sort?: LeaderboardSort;
  limit?: number;
}

export interface LeaderboardEntry {
  host: {
    did: string;
    handle: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  tag: string;
  showsHosted: number;
  guestAppearances: number;
  likes: number;
  reactions: number;
  listeners: number;
  hostedSeconds: number;
  guestSeconds: number;
  lastLiveAt: Date | null;
}

export async function getHostLeaderboard(
  query: LeaderboardQuery = {}
): Promise<LeaderboardEntry[]> {
  const tag = query.tag && query.tag.length > 0 ? query.tag : ALL_TOPICS;
  const sort: LeaderboardSort = query.sort ?? 'listeners';
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);

  const rows = await prisma.hostTopicStats.findMany({
    where: { tag },
    orderBy: [{ [sort]: 'desc' }, { showsHosted: 'desc' }, { hostDid: 'asc' }],
    take: limit,
  });
  if (rows.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { did: { in: rows.map((r) => r.hostDid) } },
    select: { did: true, handle: true, displayName: true, avatarUrl: true },
  });
  const byDid = new Map(users.map((u) => [u.did, u]));

  return rows.map((r) => {
    const u = byDid.get(r.hostDid);
    return {
      host: {
        did: r.hostDid,
        handle: u?.handle ?? '',
        displayName: u?.displayName ?? null,
        avatarUrl: u?.avatarUrl ?? null,
      },
      tag: r.tag,
      showsHosted: r.showsHosted,
      guestAppearances: r.guestAppearances,
      likes: r.likes,
      reactions: r.reactions,
      listeners: r.listeners,
      hostedSeconds: r.hostedSeconds,
      guestSeconds: r.guestSeconds,
      lastLiveAt: r.lastLiveAt,
    };
  });
}

export interface TopicSummary {
  tag: string;
  shows: number;
  listeners: number;
  reactions: number;
  likes: number;
  hostedSeconds: number;
  lastLiveAt: Date | null;
}

export async function getTopicStats(): Promise<TopicSummary[]> {
  const rows = await prisma.topicStats.findMany({
    orderBy: [{ listeners: 'desc' }, { tag: 'asc' }],
  });
  return rows.map((r) => ({
    tag: r.tag,
    shows: r.shows,
    listeners: r.listeners,
    reactions: r.reactions,
    likes: r.likes,
    hostedSeconds: r.hostedSeconds,
    lastLiveAt: r.lastLiveAt,
  }));
}

export interface JoinedShow {
  sessionId: string;
  role: ParticipantRole;
  joinedAt: Date;
  leftAt: Date | null;
  stageSeconds: number;
  session: {
    startedAt: Date;
    endedAt: Date | null;
    durationSeconds: number;
    uniqueListeners: number;
  };
  space: {
    id: string;
    title: string;
    status: string;
    isLive: boolean;
    tags: string[];
    host: { did: string; handle: string; displayName: string | null; avatarUrl: string | null };
  };
}

/**
 * Shows a signed-in user took part in as a listener or guest (their own
 * hosted shows are excluded), newest first. Backs the account page.
 */
export async function getJoinedShows(
  did: string,
  limit: number = 50
): Promise<JoinedShow[]> {
  const rows = await prisma.showParticipation.findMany({
    where: { identity: did, anonymous: false, session: { hostDid: { not: did } } },
    orderBy: { joinedAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 200),
    include: {
      session: {
        include: {
          tags: { select: { tag: true } },
          space: { include: { host: true } },
        },
      },
    },
  });
  return rows.map((p) => {
    const session = p.session;
    const space = session.space;
    return {
      sessionId: p.sessionId,
      role: asRole(p.role),
      joinedAt: p.joinedAt,
      leftAt: p.leftAt,
      stageSeconds: p.stageSeconds,
      session: {
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        durationSeconds: session.durationSeconds,
        uniqueListeners: session.uniqueListeners,
      },
      space: {
        id: space.id,
        title: space.title,
        status: space.status,
        isLive: space.isLive,
        tags: (session.tags ?? []).map((t: { tag: string } | string) =>
          typeof t === 'string' ? t : t.tag
        ),
        host: {
          did: space.host.did,
          handle: space.host.handle,
          displayName: space.host.displayName ?? null,
          avatarUrl: space.host.avatarUrl ?? null,
        },
      },
    };
  });
}

export interface RecentSessionsQuery {
  /** Only sessions whose tags include this topic. */
  tag?: string;
  since?: Date;
  limit?: number;
}

/** Finished sessions, best first, for digests and "top shows this week". */
export async function getRecentSessions(query: RecentSessionsQuery = {}) {
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
  return prisma.showSession.findMany({
    where: {
      endedAt: { not: null },
      ...(query.since ? { startedAt: { gte: query.since } } : {}),
      ...(query.tag ? { tags: { some: { tag: query.tag } } } : {}),
    },
    orderBy: [{ uniqueListeners: 'desc' }, { reactionCount: 'desc' }, { startedAt: 'desc' }],
    take: limit,
    include: { tags: { select: { tag: true } }, space: { include: { host: true } } },
  });
}
