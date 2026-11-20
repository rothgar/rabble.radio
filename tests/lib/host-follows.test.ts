// tests/lib/host-follows.test.ts

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
    hostFollow: m,
    space: { findMany: m.spaceFindMany },
  },
}));

import {
  getFollowedHostDids,
  hasHostFollow,
  resetHostFollowNotifications,
  setHostFollow,
  takeDueHostFollows,
} from '@/lib/host-follows';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('setHostFollow / hasHostFollow', () => {
  it('upserts when turning on and deletes when turning off', async () => {
    expect(await setHostFollow('did:h', 'did:a', true)).toBe(true);
    expect(m.upsert).toHaveBeenCalledWith({
      where: { hostDid_did: { hostDid: 'did:h', did: 'did:a' } },
      create: { hostDid: 'did:h', did: 'did:a' },
      update: {},
    });
    expect(await setHostFollow('did:h', 'did:a', false)).toBe(false);
    expect(m.deleteMany).toHaveBeenCalledWith({ where: { hostDid: 'did:h', did: 'did:a' } });
  });

  it('reports whether a follow exists', async () => {
    m.findUnique.mockResolvedValueOnce({ hostDid: 'did:h', did: 'did:a' });
    expect(await hasHostFollow('did:h', 'did:a')).toBe(true);
    m.findUnique.mockResolvedValueOnce(null);
    expect(await hasHostFollow('did:h', 'did:a')).toBe(false);
  });
});

describe('getFollowedHostDids', () => {
  it('returns an empty set for anonymous viewers without querying', async () => {
    expect(await getFollowedHostDids(null, ['did:h'])).toEqual(new Set());
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it('returns the subset of hosts followed', async () => {
    m.findMany.mockResolvedValueOnce([{ hostDid: 'did:h2' }]);
    expect(await getFollowedHostDids('did:a', ['did:h1', 'did:h2'])).toEqual(new Set(['did:h2']));
  });
});

describe('resetHostFollowNotifications', () => {
  it('clears notifiedAt for the host so the next live session fires fresh', async () => {
    await resetHostFollowNotifications('did:h');
    expect(m.updateMany).toHaveBeenCalledWith({
      where: { hostDid: 'did:h', notifiedAt: { not: null } },
      data: { notifiedAt: null },
    });
  });
});

describe('takeDueHostFollows', () => {
  it('returns one due item per live followed host and marks them notified', async () => {
    const NOW = new Date('2026-11-07T00:00:00Z');
    m.findMany.mockResolvedValueOnce([{ hostDid: 'did:h' }]);
    m.spaceFindMany.mockResolvedValueOnce([
      {
        id: 'sp1',
        title: 'Live now',
        hostId: 'did:h',
        host: { did: 'did:h', handle: 'h.test', displayName: null, avatarUrl: null },
      },
    ]);
    const due = await takeDueHostFollows('did:a', NOW);
    expect(m.findMany).toHaveBeenCalledWith({ where: { did: 'did:a', notifiedAt: null }, select: { hostDid: true } });
    expect(m.spaceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isLive: true, hostId: { in: ['did:h'] } } })
    );
    expect(due).toEqual([
      { spaceId: 'sp1', title: 'Live now', host: { did: 'did:h', handle: 'h.test', displayName: null, avatarUrl: null } },
    ]);
    expect(m.updateMany).toHaveBeenCalledWith({
      where: { did: 'did:a', hostDid: { in: ['did:h'] } },
      data: { notifiedAt: NOW },
    });
  });

  it('does not query spaces or write when nothing is followed', async () => {
    m.findMany.mockResolvedValueOnce([]);
    expect(await takeDueHostFollows('did:a')).toEqual([]);
    expect(m.spaceFindMany).not.toHaveBeenCalled();
    expect(m.updateMany).not.toHaveBeenCalled();
  });

  it('does not write when none of the followed hosts are live', async () => {
    m.findMany.mockResolvedValueOnce([{ hostDid: 'did:h' }]);
    m.spaceFindMany.mockResolvedValueOnce([]);
    expect(await takeDueHostFollows('did:a')).toEqual([]);
    expect(m.updateMany).not.toHaveBeenCalled();
  });
});
