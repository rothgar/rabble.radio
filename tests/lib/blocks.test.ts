// tests/lib/blocks.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  runInBackground: vi.fn(),
  fetchBlockedDids: vi.fn(),
}));

vi.mock('@/lib/background', () => ({ runInBackground: m.runInBackground }));
vi.mock('@/lib/db', () => ({
  prisma: {
    blockCache: { findUnique: m.findUnique, upsert: m.upsert },
  },
}));
vi.mock('@/lib/atproto', () => ({ fetchBlockedDids: m.fetchBlockedDids }));

import { BLOCKS_TTL_MS, getBlockedDids, warmBlockCache } from '@/lib/blocks';

const NOW = new Date('2026-11-20T12:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  m.upsert.mockResolvedValue({});
});

describe('getBlockedDids', () => {
  it('returns an empty set for anonymous viewers, without touching Bluesky', async () => {
    expect(await getBlockedDids(null)).toEqual(new Set());
    expect(m.fetchBlockedDids).not.toHaveBeenCalled();
  });

  it('serves a fresh cache without calling Bluesky', async () => {
    m.findUnique.mockResolvedValue({ did: 'did:me', blocks: '["did:a"]', fetchedAt: new Date(NOW.getTime() - 1000) });
    expect(await getBlockedDids('did:me', NOW)).toEqual(new Set(['did:a']));
    expect(m.fetchBlockedDids).not.toHaveBeenCalled();
  });

  it('refreshes a stale cache and stores the result', async () => {
    m.findUnique.mockResolvedValue({ did: 'did:me', blocks: '["did:old"]', fetchedAt: new Date(NOW.getTime() - BLOCKS_TTL_MS - 1) });
    m.fetchBlockedDids.mockResolvedValue(['did:new']);
    expect(await getBlockedDids('did:me', NOW)).toEqual(new Set(['did:new']));
    expect(m.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { did: 'did:me' }, create: expect.objectContaining({ blocks: '["did:new"]', count: 1 }) })
    );
  });

  it('answers within the budget with the stale cache and finishes in the background on timeout', async () => {
    vi.useFakeTimers();
    try {
      m.findUnique.mockResolvedValue({ did: 'did:me', blocks: '["did:old"]', fetchedAt: new Date(0) });
      let release: (dids: string[]) => void = () => undefined;
      m.fetchBlockedDids.mockImplementation(() => new Promise((resolve) => (release = resolve)));
      const pending = getBlockedDids('did:me', NOW, 500);
      await vi.advanceTimersByTimeAsync(600);
      expect(await pending).toEqual(new Set(['did:old']));
      expect(m.runInBackground).toHaveBeenCalledTimes(1);
      expect(m.upsert).not.toHaveBeenCalled();
      release(['did:new']);
      await (m.runInBackground.mock.calls[0][0] as Promise<unknown>);
      expect(m.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ blocks: '["did:new"]', count: 1 }) })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to the stale cache when Bluesky is down', async () => {
    m.findUnique.mockResolvedValue({ did: 'did:me', blocks: '["did:old"]', fetchedAt: new Date(0) });
    m.fetchBlockedDids.mockRejectedValue(new Error('no session'));
    expect(await getBlockedDids('did:me', NOW)).toEqual(new Set(['did:old']));
  });

  it('falls back to an empty set with no cache and no reachable session', async () => {
    m.findUnique.mockResolvedValue(null);
    m.fetchBlockedDids.mockRejectedValue(new Error('no session'));
    expect(await getBlockedDids('did:me', NOW)).toEqual(new Set());
  });
});

describe('warmBlockCache', () => {
  it('refreshes and stores the blocks in the background', async () => {
    m.fetchBlockedDids.mockResolvedValue(['did:z']);
    warmBlockCache('did:me');
    expect(m.runInBackground).toHaveBeenCalledWith(expect.any(Promise), 'blocks.warm');
    await (m.runInBackground.mock.calls[0][0] as Promise<unknown>);
    expect(m.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { did: 'did:me' }, create: expect.objectContaining({ blocks: '["did:z"]' }) })
    );
  });
});
