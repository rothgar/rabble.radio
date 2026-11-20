// tests/lib/show-follows.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  upsert: vi.fn(),
  deleteMany: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  spaceFindMany: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    showFollow: m,
    space: { findMany: m.spaceFindMany },
  },
}));

import {
  getFollowedSpaceIds,
  hasShowFollow,
  resetShowFollowNotifications,
  setShowFollow,
  takeDueShowFollows,
} from '@/lib/show-follows';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('setShowFollow / hasShowFollow', () => {
  it('upserts when turning on and deletes when turning off', async () => {
    expect(await setShowFollow('sp1', 'did:a', true)).toBe(true);
    expect(m.upsert).toHaveBeenCalledWith({
      where: { spaceId_did: { spaceId: 'sp1', did: 'did:a' } },
      create: { spaceId: 'sp1', did: 'did:a' },
      update: {},
    });
    expect(await setShowFollow('sp1', 'did:a', false)).toBe(false);
    expect(m.deleteMany).toHaveBeenCalledWith({ where: { spaceId: 'sp1', did: 'did:a' } });
  });

  it('reports whether a follow exists', async () => {
    m.findUnique.mockResolvedValueOnce({ spaceId: 'sp1', did: 'did:a' });
    expect(await hasShowFollow('sp1', 'did:a')).toBe(true);
    m.findUnique.mockResolvedValueOnce(null);
    expect(await hasShowFollow('sp1', 'did:a')).toBe(false);
  });
});

describe('getFollowedSpaceIds', () => {
  it('returns an empty set for anonymous viewers without querying', async () => {
    expect(await getFollowedSpaceIds(null, ['sp1'])).toEqual(new Set());
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it('returns the subset of shows followed', async () => {
    m.findMany.mockResolvedValueOnce([{ spaceId: 'sp2' }]);
    expect(await getFollowedSpaceIds('did:a', ['sp1', 'sp2'])).toEqual(new Set(['sp2']));
  });
});

describe('resetShowFollowNotifications', () => {
  it('clears notifiedAt for the show so the next live session fires fresh', async () => {
    await resetShowFollowNotifications('sp1');
    expect(m.updateMany).toHaveBeenCalledWith({
      where: { spaceId: 'sp1', notifiedAt: { not: null } },
      data: { notifiedAt: null },
    });
  });
});

describe('takeDueShowFollows', () => {
  it('returns one due item per live followed show and marks them notified', async () => {
    const NOW = new Date('2026-11-07T00:00:00Z');
    m.findMany.mockResolvedValueOnce([{ spaceId: 'sp1' }]);
    m.spaceFindMany.mockResolvedValueOnce([
      {
        id: 'sp1',
        title: 'The Weekly Show',
        host: { did: 'did:h', handle: 'h.test', displayName: null, avatarUrl: null },
      },
    ]);
    const due = await takeDueShowFollows('did:a', NOW);
    expect(m.findMany).toHaveBeenCalledWith({ where: { did: 'did:a', notifiedAt: null }, select: { spaceId: true } });
    expect(m.spaceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isLive: true, id: { in: ['sp1'] } } })
    );
    expect(due).toEqual([
      {
        spaceId: 'sp1',
        title: 'The Weekly Show',
        host: { did: 'did:h', handle: 'h.test', displayName: null, avatarUrl: null },
      },
    ]);
    expect(m.updateMany).toHaveBeenCalledWith({
      where: { did: 'did:a', spaceId: { in: ['sp1'] } },
      data: { notifiedAt: NOW },
    });
  });

  it('does not query spaces or write when nothing is followed', async () => {
    m.findMany.mockResolvedValueOnce([]);
    expect(await takeDueShowFollows('did:a')).toEqual([]);
    expect(m.spaceFindMany).not.toHaveBeenCalled();
    expect(m.updateMany).not.toHaveBeenCalled();
  });

  it('does not write when none of the followed shows are live', async () => {
    m.findMany.mockResolvedValueOnce([{ spaceId: 'sp1' }]);
    m.spaceFindMany.mockResolvedValueOnce([]);
    expect(await takeDueShowFollows('did:a')).toEqual([]);
    expect(m.updateMany).not.toHaveBeenCalled();
  });
});
