// tests/lib/metrics.test.ts
//
// Show metrics: sessions, presence, reactions, likes and the roll-up into
// host/topic leaderboard rows. Prisma is mocked; every mocked write returns a
// marker so transactions can be inspected.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
  const marker = (op: string) => vi.fn((args: unknown) => ({ op, args }));
  return {
    sessionFindFirst: vi.fn(),
    sessionCreate: marker('showSession.create'),
    sessionUpdate: marker('showSession.update'),
    sessionFindMany: vi.fn(),
    partFindUnique: vi.fn(),
    partCreate: marker('showParticipation.create'),
    partUpdate: marker('showParticipation.update'),
    partFindMany: vi.fn(),
    partCount: vi.fn(),
    reactionCreate: marker('showReaction.create'),
    likeCreate: vi.fn(),
    likeDeleteMany: vi.fn(),
    likeFindUnique: vi.fn(),
    spaceUpdate: marker('space.update'),
    spaceFindUnique: vi.fn(),
    hostUpsert: marker('hostTopicStats.upsert'),
    hostUpdateMany: marker('hostTopicStats.updateMany'),
    hostFindMany: vi.fn(),
    topicUpsert: marker('topicStats.upsert'),
    topicUpdateMany: marker('topicStats.updateMany'),
    topicFindMany: vi.fn(),
    userFindMany: vi.fn(),
    transaction: vi.fn(async (ops: unknown[]) => ops),
    warn: vi.fn(),
  };
});

vi.mock('@/lib/db', () => ({
  prisma: {
    showSession: {
      findFirst: m.sessionFindFirst,
      create: m.sessionCreate,
      update: m.sessionUpdate,
      findMany: m.sessionFindMany,
    },
    showParticipation: {
      findUnique: m.partFindUnique,
      create: m.partCreate,
      update: m.partUpdate,
      findMany: m.partFindMany,
      count: m.partCount,
    },
    showReaction: { create: m.reactionCreate },
    showLike: {
      create: m.likeCreate,
      deleteMany: m.likeDeleteMany,
      findUnique: m.likeFindUnique,
    },
    space: { update: m.spaceUpdate, findUnique: m.spaceFindUnique },
    hostTopicStats: {
      upsert: m.hostUpsert,
      updateMany: m.hostUpdateMany,
      findMany: m.hostFindMany,
    },
    topicStats: {
      upsert: m.topicUpsert,
      updateMany: m.topicUpdateMany,
      findMany: m.topicFindMany,
    },
    user: { findMany: m.userFindMany },
    $transaction: m.transaction,
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: m.warn, error: vi.fn() },
}));

import {
  ALL_TOPICS,
  endShowSession,
  getHostLeaderboard,
  likeShow,
  recordJoin,
  recordLeave,
  recordReaction,
  recordStageChange,
  startShowSession,
  unlikeShow,
} from '@/lib/metrics';

const T0 = new Date('2026-11-01T10:00:00Z');
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sess1',
    spaceId: 'sp1',
    hostDid: 'did:plc:host',
    tags: ['Music', 'Comedy'],
    startedAt: T0,
    endedAt: null,
    durationSeconds: 0,
    peakListeners: 0,
    uniqueListeners: 0,
    guestCount: 0,
    reactionCount: 0,
    likeCount: 0,
    ...overrides,
  };
}

function participation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    sessionId: 'sess1',
    spaceId: 'sp1',
    identity: 'did:plc:bob',
    anonymous: false,
    role: 'listener',
    joinedAt: T0,
    leftAt: null,
    stageSeconds: 0,
    stageSince: null,
    ...overrides,
  };
}

const ops = (calls: { mock: { results: { value: unknown }[] } }) =>
  calls.mock.results.map((r) => r.value);

beforeEach(() => {
  vi.clearAllMocks();
  m.partCount.mockResolvedValue(0);
});

describe('startShowSession', () => {
  it('returns the already-open session instead of opening another', async () => {
    m.sessionFindFirst.mockResolvedValueOnce(session());
    const s = await startShowSession({ spaceId: 'sp1', hostDid: 'did:plc:host', tags: ['Music'] });
    expect(s?.id).toBe('sess1');
    expect(m.sessionCreate).not.toHaveBeenCalled();
  });

  it('creates a session with a snapshot of the tags', async () => {
    m.sessionFindFirst.mockResolvedValueOnce(null);
    await startShowSession({ spaceId: 'sp1', hostDid: 'did:plc:host', tags: ['Music'], now: T0 });
    expect(m.sessionCreate).toHaveBeenCalledWith({
      data: {
        spaceId: 'sp1',
        hostDid: 'did:plc:host',
        tags: { create: [{ tag: 'Music' }] },
        startedAt: T0,
      },
      include: { tags: { select: { tag: true } } },
    });
  });

  it('never throws when the database is down', async () => {
    m.sessionFindFirst.mockRejectedValueOnce(new Error('db down'));
    await expect(
      startShowSession({ spaceId: 'sp1', hostDid: 'did:plc:host', tags: [] })
    ).resolves.toBeUndefined();
    expect(m.warn).toHaveBeenCalledWith('metrics.session.start_failed', expect.anything());
  });
});

describe('recordJoin', () => {
  it('does nothing when the space is not live', async () => {
    m.sessionFindFirst.mockResolvedValueOnce(null);
    await recordJoin({ spaceId: 'sp1', identity: 'did:plc:bob', role: 'listener' });
    expect(m.partCreate).not.toHaveBeenCalled();
    expect(m.partFindUnique).not.toHaveBeenCalled();
  });

  it('creates a participation and raises the peak', async () => {
    m.sessionFindFirst.mockResolvedValueOnce(session({ peakListeners: 1 }));
    m.partFindUnique.mockResolvedValueOnce(null);
    m.partCount.mockResolvedValueOnce(2);
    await recordJoin({ spaceId: 'sp1', identity: 'anon:abc', role: 'listener', now: T0 });
    expect(m.partCreate).toHaveBeenCalledWith({
      data: {
        sessionId: 'sess1',
        spaceId: 'sp1',
        identity: 'anon:abc',
        anonymous: true,
        role: 'listener',
        joinedAt: T0,
        stageSince: null,
      },
    });
    expect(m.partCount).toHaveBeenCalledWith({
      where: { sessionId: 'sess1', leftAt: null, NOT: { identity: 'did:plc:host' } },
    });
    expect(m.sessionUpdate).toHaveBeenCalledWith({
      where: { id: 'sess1' },
      data: { peakListeners: 2 },
    });
  });

  it('starts the stage clock for the host and keeps the peak when not exceeded', async () => {
    m.sessionFindFirst.mockResolvedValueOnce(session({ peakListeners: 3 }));
    m.partFindUnique.mockResolvedValueOnce(null);
    m.partCount.mockResolvedValueOnce(1);
    await recordJoin({ spaceId: 'sp1', identity: 'did:plc:host', role: 'host', now: T0 });
    expect(m.partCreate.mock.calls[0][0]).toMatchObject({
      data: { role: 'host', anonymous: false, stageSince: T0 },
    });
    expect(m.sessionUpdate).not.toHaveBeenCalled();
  });

  it('reopens a returning participant and keeps the highest role', async () => {
    m.sessionFindFirst.mockResolvedValueOnce(session());
    m.partFindUnique.mockResolvedValueOnce(
      participation({ role: 'speaker', leftAt: at(60), stageSince: null })
    );
    await recordJoin({ spaceId: 'sp1', identity: 'did:plc:bob', role: 'listener', now: at(120) });
    expect(m.partUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { leftAt: null, role: 'speaker', stageSince: null },
    });
  });
});

describe('recordLeave', () => {
  it('closes the participation and banks stage time', async () => {
    m.sessionFindFirst.mockResolvedValueOnce(session());
    m.partFindUnique.mockResolvedValueOnce(
      participation({ role: 'speaker', stageSeconds: 10, stageSince: at(100) })
    );
    await recordLeave({ spaceId: 'sp1', identity: 'did:plc:bob', now: at(160) });
    expect(m.partUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { leftAt: at(160), stageSeconds: 70, stageSince: null },
    });
  });

  it('ignores unknown or already-departed participants', async () => {
    m.sessionFindFirst.mockResolvedValue(session());
    m.partFindUnique.mockResolvedValueOnce(null);
    await recordLeave({ spaceId: 'sp1', identity: 'did:plc:nobody' });
    m.partFindUnique.mockResolvedValueOnce(participation({ leftAt: at(5) }));
    await recordLeave({ spaceId: 'sp1', identity: 'did:plc:bob' });
    expect(m.partUpdate).not.toHaveBeenCalled();
  });
});

describe('recordStageChange', () => {
  it('promotes a listener and starts the clock', async () => {
    m.sessionFindFirst.mockResolvedValueOnce(session());
    m.partFindUnique.mockResolvedValueOnce(participation());
    await recordStageChange({ spaceId: 'sp1', identity: 'did:plc:bob', onStage: true, now: at(30) });
    expect(m.partUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { role: 'speaker', stageSince: at(30) },
    });
  });

  it('banks stage time when stepping down but keeps the speaker role', async () => {
    m.sessionFindFirst.mockResolvedValueOnce(session());
    m.partFindUnique.mockResolvedValueOnce(
      participation({ role: 'speaker', stageSeconds: 5, stageSince: at(30) })
    );
    await recordStageChange({ spaceId: 'sp1', identity: 'did:plc:bob', onStage: false, now: at(90) });
    expect(m.partUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { stageSeconds: 65, stageSince: null },
    });
  });

  it('creates a speaker row for someone the join path never saw', async () => {
    m.sessionFindFirst.mockResolvedValueOnce(session());
    m.partFindUnique.mockResolvedValueOnce(null);
    await recordStageChange({ spaceId: 'sp1', identity: 'did:plc:guest', onStage: true, now: at(30) });
    expect(m.partCreate.mock.calls[0][0]).toMatchObject({
      data: { identity: 'did:plc:guest', role: 'speaker', stageSince: at(30) },
    });
  });
});

describe('recordReaction', () => {
  it('stores the reaction and bumps the live session in one transaction', async () => {
    m.sessionFindFirst.mockResolvedValueOnce(session());
    await recordReaction({ spaceId: 'sp1', did: 'did:plc:bob', now: T0 });
    const sent = m.transaction.mock.calls[0][0] as { op: string; args: unknown }[];
    expect(sent.map((o) => o.op)).toEqual(['showReaction.create', 'showSession.update']);
    expect(sent[0].args).toEqual({
      data: { spaceId: 'sp1', sessionId: 'sess1', did: 'did:plc:bob', kind: 'reaction', createdAt: T0 },
    });
  });

  it('still stores the reaction when the show is not live', async () => {
    m.sessionFindFirst.mockResolvedValueOnce(null);
    await recordReaction({ spaceId: 'sp1', did: 'did:plc:bob' });
    const sent = m.transaction.mock.calls[0][0] as { op: string; args: { data: { sessionId: unknown } } }[];
    expect(sent).toHaveLength(1);
    expect(sent[0].args.data.sessionId).toBeNull();
  });
});

describe('likeShow / unlikeShow', () => {
  const spaceRow = { id: 'sp1', hostId: 'did:plc:host', tags: [{ tag: 'Music' }], likeCount: 4 };

  it('creates the like and increments the space and live session', async () => {
    m.spaceFindUnique.mockResolvedValueOnce(spaceRow);
    m.likeCreate.mockResolvedValueOnce({});
    m.sessionFindFirst.mockResolvedValueOnce(session());
    m.transaction.mockImplementationOnce(async (sent: unknown[]) => [{ likeCount: 5 }, ...sent.slice(1)]);
    const result = await likeShow({ spaceId: 'sp1', did: 'did:plc:bob' });
    expect(result).toEqual({ liked: true, likeCount: 5 });
    const sent = m.transaction.mock.calls[0][0] as { op: string }[];
    expect(sent.map((o) => o.op)).toEqual(['space.update', 'showSession.update']);
  });

  it('credits the host and topic directly when no show is live', async () => {
    m.spaceFindUnique.mockResolvedValueOnce(spaceRow);
    m.likeCreate.mockResolvedValueOnce({});
    m.sessionFindFirst.mockResolvedValueOnce(null);
    m.transaction.mockImplementationOnce(async (sent: unknown[]) => [{ likeCount: 5 }, ...sent.slice(1)]);
    await likeShow({ spaceId: 'sp1', did: 'did:plc:bob' });
    const sent = m.transaction.mock.calls[0][0] as { op: string; args: { where: unknown } }[];
    expect(sent.map((o) => o.op)).toEqual([
      'space.update',
      'hostTopicStats.upsert',
      'hostTopicStats.upsert',
      'topicStats.upsert',
    ]);
    expect(sent[1].args.where).toEqual({ hostDid_tag: { hostDid: 'did:plc:host', tag: ALL_TOPICS } });
    expect(sent[2].args.where).toEqual({ hostDid_tag: { hostDid: 'did:plc:host', tag: 'Music' } });
  });

  it('is idempotent on a duplicate like', async () => {
    m.spaceFindUnique.mockResolvedValueOnce(spaceRow);
    m.likeCreate.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));
    const result = await likeShow({ spaceId: 'sp1', did: 'did:plc:bob' });
    expect(result).toEqual({ liked: true, likeCount: 4 });
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it('rethrows other database errors', async () => {
    m.spaceFindUnique.mockResolvedValueOnce(spaceRow);
    m.likeCreate.mockRejectedValueOnce(new Error('boom'));
    await expect(likeShow({ spaceId: 'sp1', did: 'did:plc:bob' })).rejects.toThrow('boom');
  });

  it('unlike is a no-op when there was no like', async () => {
    m.spaceFindUnique.mockResolvedValueOnce(spaceRow);
    m.likeDeleteMany.mockResolvedValueOnce({ count: 0 });
    const result = await unlikeShow({ spaceId: 'sp1', did: 'did:plc:bob' });
    expect(result).toEqual({ liked: false, likeCount: 4 });
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it('unlike decrements the space and the host/topic rows outside a live show', async () => {
    m.spaceFindUnique.mockResolvedValueOnce(spaceRow);
    m.likeDeleteMany.mockResolvedValueOnce({ count: 1 });
    m.sessionFindFirst.mockResolvedValueOnce(null);
    m.transaction.mockImplementationOnce(async (sent: unknown[]) => [{ likeCount: 3 }, ...sent.slice(1)]);
    const result = await unlikeShow({ spaceId: 'sp1', did: 'did:plc:bob' });
    expect(result).toEqual({ liked: false, likeCount: 3 });
    const sent = m.transaction.mock.calls[0][0] as { op: string }[];
    expect(sent.map((o) => o.op)).toEqual([
      'space.update',
      'hostTopicStats.updateMany',
      'hostTopicStats.updateMany',
      'topicStats.updateMany',
    ]);
  });
});

describe('endShowSession', () => {
  it('is a no-op without an open session', async () => {
    m.sessionFindFirst.mockResolvedValueOnce(null);
    await expect(endShowSession({ spaceId: 'sp1' })).resolves.toBeUndefined();
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it('closes stragglers, totals the show and rolls it up per topic', async () => {
    const now = at(3600);
    m.sessionFindFirst.mockResolvedValueOnce(session({ reactionCount: 7, likeCount: 2 }));
    const host = participation({ id: 'ph', identity: 'did:plc:host', role: 'host', stageSince: T0 });
    const guest = participation({
      id: 'pg',
      identity: 'did:plc:guest',
      role: 'speaker',
      stageSeconds: 100,
      stageSince: at(3000),
    });
    const anon = participation({ id: 'pa', identity: 'anon:1', anonymous: true, leftAt: at(500) });
    const listener = participation({ id: 'pl', identity: 'did:plc:bob' });
    m.partFindMany.mockResolvedValueOnce([host, guest, listener]); // still present
    m.partFindMany.mockResolvedValueOnce([host, guest, anon, listener]); // everyone

    const result = await endShowSession({ spaceId: 'sp1', now });

    // Stragglers closed with stage time banked.
    expect(m.partUpdate).toHaveBeenCalledWith({
      where: { id: 'pg' },
      data: { leftAt: now, stageSeconds: 700, stageSince: null },
    });
    expect(m.partUpdate).toHaveBeenCalledWith({
      where: { id: 'pl' },
      data: { leftAt: now, stageSeconds: 0, stageSince: null },
    });

    const sent = m.transaction.mock.calls[0][0] as { op: string; args: Record<string, unknown> }[];
    expect(sent[0]).toEqual({
      op: 'showSession.update',
      args: {
        where: { id: 'sess1' },
        data: { endedAt: now, durationSeconds: 3600, uniqueListeners: 3, guestCount: 1 },
      },
    });
    expect(sent[1]).toEqual({
      op: 'space.update',
      args: {
        where: { id: 'sp1' },
        data: {
          sessionCount: { increment: 1 },
          hostedSeconds: { increment: 3600 },
          totalListeners: { increment: 3 },
          lastLiveAt: now,
        },
      },
    });

    // Host rows for "*", Music, Comedy; one guest row per tag; topic rows for both tags.
    const hostRows = sent.filter(
      (o) => o.op === 'hostTopicStats.upsert' && (o.args.create as { hostDid: string }).hostDid === 'did:plc:host'
    );
    expect(hostRows.map((o) => (o.args.create as { tag: string }).tag)).toEqual([ALL_TOPICS, 'Music', 'Comedy']);
    expect(hostRows[0].args.update).toEqual({
      showsHosted: { increment: 1 },
      listeners: { increment: 3 },
      reactions: { increment: 7 },
      likes: { increment: 2 },
      hostedSeconds: { increment: 3600 },
      lastLiveAt: now,
    });
    const guestRows = sent.filter(
      (o) => o.op === 'hostTopicStats.upsert' && (o.args.create as { hostDid: string }).hostDid === 'did:plc:guest'
    );
    expect(guestRows).toHaveLength(3);
    expect(guestRows[0].args.create).toMatchObject({ guestAppearances: 1, guestSeconds: 700 });
    const topicRows = sent.filter((o) => o.op === 'topicStats.upsert');
    expect(topicRows.map((o) => (o.args.where as { tag: string }).tag)).toEqual(['Music', 'Comedy']);
    expect(topicRows[0].args.update).toMatchObject({ shows: { increment: 1 }, listeners: { increment: 3 } });

    expect(result).toEqual({ ...sent[0], tags: ['Music', 'Comedy'] });
  });

  it('never throws when the roll-up fails', async () => {
    m.sessionFindFirst.mockResolvedValueOnce(session());
    m.partFindMany.mockRejectedValueOnce(new Error('db down'));
    await expect(endShowSession({ spaceId: 'sp1' })).resolves.toBeUndefined();
    expect(m.warn).toHaveBeenCalledWith('metrics.session.end_failed', expect.anything());
  });
});

describe('getHostLeaderboard', () => {
  it('reads the all-topics rows by default and joins user profiles', async () => {
    m.hostFindMany.mockResolvedValueOnce([
      {
        hostDid: 'did:plc:host',
        tag: ALL_TOPICS,
        showsHosted: 3,
        guestAppearances: 1,
        likes: 2,
        reactions: 7,
        listeners: 40,
        hostedSeconds: 7200,
        guestSeconds: 300,
        lastLiveAt: T0,
      },
    ]);
    m.userFindMany.mockResolvedValueOnce([
      { did: 'did:plc:host', handle: 'alice.bsky.social', displayName: 'Alice', avatarUrl: null },
    ]);
    const board = await getHostLeaderboard();
    expect(m.hostFindMany).toHaveBeenCalledWith({
      where: { tag: ALL_TOPICS },
      orderBy: [{ listeners: 'desc' }, { showsHosted: 'desc' }, { hostDid: 'asc' }],
      take: 20,
    });
    expect(board).toHaveLength(1);
    expect(board[0].host).toEqual({
      did: 'did:plc:host',
      handle: 'alice.bsky.social',
      displayName: 'Alice',
      avatarUrl: null,
    });
    expect(board[0].listeners).toBe(40);
  });

  it('filters by topic, sorts by the requested column and clamps the limit', async () => {
    m.hostFindMany.mockResolvedValueOnce([]);
    await getHostLeaderboard({ tag: 'Music', sort: 'hostedSeconds', limit: 500 });
    expect(m.hostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tag: 'Music' },
        orderBy: [{ hostedSeconds: 'desc' }, { showsHosted: 'desc' }, { hostDid: 'asc' }],
        take: 100,
      })
    );
    expect(m.userFindMany).not.toHaveBeenCalled();
  });
});
