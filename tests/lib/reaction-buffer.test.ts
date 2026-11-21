// tests/lib/reaction-buffer.test.ts
//
// src/lib/reaction-buffer.ts buffers reaction taps per space in memory and
// only flushes them to D1 in a batch, so a burst of concurrent taps doesn't
// queue one round trip each behind the single D1 connection (issue #73).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockSpaceFindUnique,
  mockSpaceUpdate,
  mockSessionFindFirst,
  mockReactionCreateMany,
  mockSessionUpdate,
  mockTransaction,
  mockRunInBackground,
  mockWarn,
} = vi.hoisted(() => ({
  mockSpaceFindUnique: vi.fn(),
  mockSpaceUpdate: vi.fn(),
  mockSessionFindFirst: vi.fn(),
  mockReactionCreateMany: vi.fn(),
  mockSessionUpdate: vi.fn(),
  mockTransaction: vi.fn(),
  mockRunInBackground: vi.fn(),
  mockWarn: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    space: { findUnique: mockSpaceFindUnique, update: mockSpaceUpdate },
    showSession: { findFirst: mockSessionFindFirst, update: mockSessionUpdate },
    showReaction: { createMany: mockReactionCreateMany },
    $transaction: mockTransaction,
  },
}));

vi.mock('@/lib/background', () => ({
  runInBackground: mockRunInBackground,
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: mockWarn, error: vi.fn() },
}));

import {
  bufferReaction,
  flushSpaceReactions,
  __resetReactionBufferForTests,
} from '@/lib/reaction-buffer';

const T0 = new Date('2026-11-01T10:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  __resetReactionBufferForTests();
  mockSpaceFindUnique.mockResolvedValue({ reactionCount: 0 });
  mockSessionFindFirst.mockResolvedValue(null);
  mockTransaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops));
  mockSpaceUpdate.mockResolvedValue({ reactionCount: 0 });
  mockReactionCreateMany.mockResolvedValue({ count: 0 });
  mockSessionUpdate.mockResolvedValue({});
});

describe('bufferReaction', () => {
  it('warms a space\'s count from D1 once, then counts in memory', async () => {
    mockSpaceFindUnique.mockResolvedValueOnce({ reactionCount: 5 });
    const first = await bufferReaction({ spaceId: 'sp1', did: 'did:plc:bob', kind: '👍', now: T0 });
    expect(first).toBe(6);

    const second = await bufferReaction({
      spaceId: 'sp1',
      did: 'did:plc:alice',
      now: new Date(T0.getTime() + 1_000),
    });
    expect(second).toBe(7);
    expect(mockSpaceFindUnique).toHaveBeenCalledTimes(1);
  });

  it('keeps separate counts per space', async () => {
    mockSpaceFindUnique.mockResolvedValueOnce({ reactionCount: 10 }).mockResolvedValueOnce({ reactionCount: 0 });
    const a = await bufferReaction({ spaceId: 'sp1', did: 'did:plc:bob', now: T0 });
    const b = await bufferReaction({ spaceId: 'sp2', did: 'did:plc:bob', now: T0 });
    expect(a).toBe(11);
    expect(b).toBe(1);
  });

  it('does not touch D1 for the write itself', async () => {
    await bufferReaction({ spaceId: 'sp1', did: 'did:plc:bob', now: T0 });
    expect(mockSpaceUpdate).not.toHaveBeenCalled();
    expect(mockReactionCreateMany).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('triggers a background flush once the buffer is overdue', async () => {
    await bufferReaction({ spaceId: 'sp1', did: 'did:plc:bob', now: T0 });
    expect(mockRunInBackground).not.toHaveBeenCalled();

    await bufferReaction({
      spaceId: 'sp1',
      did: 'did:plc:alice',
      now: new Date(T0.getTime() + 16_000),
    });
    expect(mockRunInBackground).toHaveBeenCalledTimes(1);
    expect(mockRunInBackground).toHaveBeenCalledWith(expect.any(Promise), 'reaction_buffer.flush');
  });

  it('triggers a flush once a single burst grows past the cap, without waiting on time', async () => {
    for (let i = 0; i < 200; i++) {
      await bufferReaction({ spaceId: 'sp1', did: `did:plc:user${i}`, now: T0 });
    }
    expect(mockRunInBackground).toHaveBeenCalledTimes(1);
  });
});

describe('flushSpaceReactions', () => {
  it('is a no-op for a space with nothing buffered', async () => {
    await flushSpaceReactions('never-seen');
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('batches every buffered tap into one transaction and resyncs the count', async () => {
    await bufferReaction({ spaceId: 'sp1', did: 'did:plc:bob', kind: '🎉', now: T0 });
    await bufferReaction({ spaceId: 'sp1', did: 'did:plc:alice', kind: '👍', now: T0 });
    mockSpaceUpdate.mockResolvedValueOnce({ reactionCount: 42 });

    await flushSpaceReactions('sp1');

    expect(mockReactionCreateMany).toHaveBeenCalledWith({
      data: [
        { spaceId: 'sp1', sessionId: null, did: 'did:plc:bob', kind: '🎉', createdAt: T0 },
        { spaceId: 'sp1', sessionId: null, did: 'did:plc:alice', kind: '👍', createdAt: T0 },
      ],
    });
    expect(mockSpaceUpdate).toHaveBeenCalledWith({
      where: { id: 'sp1' },
      data: { reactionCount: { increment: 2 } },
      select: { reactionCount: true },
    });
    expect(mockSessionUpdate).not.toHaveBeenCalled();

    // The resynced count (42) carries forward, not the stale local base + 2.
    const next = await bufferReaction({ spaceId: 'sp1', did: 'did:plc:carol', now: T0 });
    expect(next).toBe(43);
  });

  it('also bumps the open session when the show is live', async () => {
    mockSessionFindFirst.mockResolvedValue({ id: 'sess1' });
    await bufferReaction({ spaceId: 'sp1', did: 'did:plc:bob', now: T0 });

    await flushSpaceReactions('sp1');

    expect(mockSessionUpdate).toHaveBeenCalledWith({
      where: { id: 'sess1' },
      data: { reactionCount: { increment: 1 } },
    });
  });

  it('is a no-op when called again with nothing newly buffered', async () => {
    await bufferReaction({ spaceId: 'sp1', did: 'did:plc:bob', now: T0 });
    await flushSpaceReactions('sp1');
    expect(mockTransaction).toHaveBeenCalledTimes(1);

    await flushSpaceReactions('sp1');
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it('drops the batch instead of retrying when the transaction fails', async () => {
    // D1 has no real transactions (prisma/schema.prisma): a failure here may
    // mean the createMany already landed, so replaying the same batch on
    // the next flush would risk duplicate rows and double increments
    // instead of just losing the batch.
    await bufferReaction({ spaceId: 'sp1', did: 'did:plc:bob', kind: '👏', now: T0 });
    mockTransaction.mockRejectedValueOnce(new Error('boom'));

    await flushSpaceReactions('sp1');
    expect(mockWarn).toHaveBeenCalledWith(
      'reaction_buffer.flush_failed',
      expect.objectContaining({ spaceId: 'sp1', count: 1 })
    );

    mockTransaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops));
    await flushSpaceReactions('sp1');
    // The first (failed) attempt already called createMany once while
    // building its ops array; the dropped batch means no second call.
    expect(mockReactionCreateMany).toHaveBeenCalledTimes(1);
  });

  it('waits for an already in-flight flush instead of starting a second one', async () => {
    await bufferReaction({ spaceId: 'sp1', did: 'did:plc:bob', now: T0 });
    mockSpaceUpdate.mockResolvedValueOnce({ reactionCount: 9 });

    // Called back-to-back with no await in between: the second call's
    // synchronous guard check runs before the first's internal await ever
    // resolves, so it must see the in-flight flush and wait on it instead
    // of starting its own.
    const first = flushSpaceReactions('sp1');
    const second = flushSpaceReactions('sp1');
    await Promise.all([first, second]);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    const next = await bufferReaction({ spaceId: 'sp1', did: 'did:plc:carol', now: T0 });
    expect(next).toBe(10);
  });
});
