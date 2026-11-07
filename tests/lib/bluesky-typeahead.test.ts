// tests/lib/bluesky-typeahead.test.ts

import { describe, expect, it, vi } from 'vitest';
import {
  LAST_HANDLE_KEY,
  recallHandle,
  rememberHandle,
  searchActorsTypeahead,
} from '@/lib/bluesky-typeahead';

function reply(actors: unknown[], status = 200): Response {
  return new Response(JSON.stringify({ actors }), { status });
}

describe('searchActorsTypeahead', () => {
  it('returns nothing for a blank query without calling Bluesky', async () => {
    const fetchImpl = vi.fn();
    expect(await searchActorsTypeahead('   ', { fetchImpl })).toEqual([]);
    expect(await searchActorsTypeahead('@', { fetchImpl })).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('queries the public AppView and normalises actors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      reply([
        { did: 'did:plc:a', handle: 'ada.bsky.social', displayName: 'Ada', avatar: 'https://cdn/a.jpg' },
        { did: 'did:plc:b', handle: 'bob.example.com', displayName: '   ' },
        { did: 'did:plc:c', handle: 'handle.invalid' },
        { did: 42, handle: 'broken' },
      ])
    );
    const out = await searchActorsTypeahead('@Ada', { fetchImpl, limit: 3 });
    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.origin).toBe('https://public.api.bsky.app');
    expect(url.pathname).toBe('/xrpc/app.bsky.actor.searchActorsTypeahead');
    expect(url.searchParams.get('q')).toBe('Ada');
    expect(url.searchParams.get('limit')).toBe('3');
    expect(out).toEqual([
      { did: 'did:plc:a', handle: 'ada.bsky.social', displayName: 'Ada', avatar: 'https://cdn/a.jpg' },
      { did: 'did:plc:b', handle: 'bob.example.com', displayName: null, avatar: null },
    ]);
  });

  it('passes the abort signal through and throws on HTTP errors', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn().mockResolvedValue(reply([], 502));
    await expect(
      searchActorsTypeahead('x', { fetchImpl, signal: controller.signal })
    ).rejects.toThrow(/HTTP 502/);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ signal: controller.signal });
  });
});

describe('remembered handle', () => {
  it('round-trips through storage and trims', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    expect(recallHandle(storage)).toBe('');
    rememberHandle('  ada.bsky.social ', storage);
    expect(store.get(LAST_HANDLE_KEY)).toBe('ada.bsky.social');
    expect(recallHandle(storage)).toBe('ada.bsky.social');
  });

  it('swallows storage errors', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => rememberHandle('x', throwing)).not.toThrow();
    expect(recallHandle(throwing)).toBe('');
    expect(recallHandle(null)).toBe('');
  });
});
