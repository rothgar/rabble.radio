// tests/lib/follows.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  participationFindMany: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    followCache: { findUnique: m.findUnique, upsert: m.upsert },
    showParticipation: { findMany: m.participationFindMany },
  },
}));

import { fetchFollowsFromBluesky, FOLLOWS_TTL_MS, getFollowedDids, getPresentIdentities } from '@/lib/follows';

const NOW = new Date('2026-11-07T12:00:00Z');

function page(dids: string[], cursor?: string): Response {
  return new Response(JSON.stringify({ follows: dids.map((did) => ({ did })), cursor }), { status: 200 });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.upsert.mockResolvedValue({});
});

describe('fetchFollowsFromBluesky', () => {
  it('pages through the public AppView with the cursor', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(page(['did:a', 'did:b'], 'c1'))
      .mockResolvedValueOnce(page(['did:c'])) as unknown as typeof fetch;
    const out = await fetchFollowsFromBluesky('did:me', fetchImpl);
    expect(out).toEqual(['did:a', 'did:b', 'did:c']);
    const first = new URL((fetchImpl as unknown as { mock: { calls: [string][] } }).mock.calls[0][0]);
    expect(first.origin).toBe('https://public.api.bsky.app');
    expect(first.searchParams.get('actor')).toBe('did:me');
    const second = new URL((fetchImpl as unknown as { mock: { calls: [string][] } }).mock.calls[1][0]);
    expect(second.searchParams.get('cursor')).toBe('c1');
  });

  it('stops at the cap', async () => {
    const fetchImpl = vi.fn(async () => page(Array.from({ length: 100 }, (_, i) => `did:${i}`), 'more')) as unknown as typeof fetch;
    const out = await fetchFollowsFromBluesky('did:me', fetchImpl, 250);
    expect(out).toHaveLength(250);
  });

  it('throws on HTTP errors', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch;
    await expect(fetchFollowsFromBluesky('did:me', fetchImpl)).rejects.toThrow(/500/);
  });
});

describe('getFollowedDids', () => {
  it('returns an empty set for anonymous viewers', async () => {
    expect(await getFollowedDids(null)).toEqual(new Set());
  });

  it('serves a fresh cache without calling Bluesky', async () => {
    m.findUnique.mockResolvedValue({ did: 'did:me', follows: '["did:a"]', fetchedAt: new Date(NOW.getTime() - 1000) });
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    expect(await getFollowedDids('did:me', NOW, fetchImpl)).toEqual(new Set(['did:a']));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refreshes a stale cache and stores the result', async () => {
    m.findUnique.mockResolvedValue({ did: 'did:me', follows: '["did:old"]', fetchedAt: new Date(NOW.getTime() - FOLLOWS_TTL_MS - 1) });
    const fetchImpl = vi.fn(async () => page(['did:new'])) as unknown as typeof fetch;
    expect(await getFollowedDids('did:me', NOW, fetchImpl)).toEqual(new Set(['did:new']));
    expect(m.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { did: 'did:me' }, create: expect.objectContaining({ follows: '["did:new"]', count: 1 }) })
    );
  });

  it('falls back to the stale cache when Bluesky is down', async () => {
    m.findUnique.mockResolvedValue({ did: 'did:me', follows: '["did:old"]', fetchedAt: new Date(0) });
    const fetchImpl = vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    expect(await getFollowedDids('did:me', NOW, fetchImpl)).toEqual(new Set(['did:old']));
  });
});

describe('getPresentIdentities', () => {
  it('groups signed-in participants still in the room by show', async () => {
    m.participationFindMany.mockResolvedValue([
      { spaceId: 'sp1', identity: 'did:a' },
      { spaceId: 'sp1', identity: 'did:a' },
      { spaceId: 'sp2', identity: 'did:b' },
    ]);
    const out = await getPresentIdentities(['sp1', 'sp2']);
    expect(m.participationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { spaceId: { in: ['sp1', 'sp2'] }, leftAt: null, anonymous: false } })
    );
    expect(out.get('sp1')).toEqual(['did:a']);
    expect(out.get('sp2')).toEqual(['did:b']);
  });
});
