// tests/api/music.test.ts — GET /music/[file]

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({ get: vi.fn(), head: vi.fn() }));
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: { RECORDINGS: { get: m.get, head: m.head } } }),
}));

import { GET, HEAD, parseRange } from '@/app/music/[file]/route';

const ctx = (file: string) => ({ params: Promise.resolve({ file }) });
const req = (range?: string, method = 'GET') =>
  new NextRequest('https://rabble.rodeo/music/carefree.mp3', { method, headers: range ? { range } : {} });

beforeEach(() => {
  vi.clearAllMocks();
  m.head.mockResolvedValue({ size: 1000 });
  m.get.mockResolvedValue({ body: new ReadableStream(), size: 1000, httpEtag: '"abc"' });
});

describe('parseRange', () => {
  it('handles open, closed and suffix ranges and rejects nonsense', () => {
    expect(parseRange(null, 1000)).toBeNull();
    expect(parseRange('bytes=0-', 1000)).toEqual({ offset: 0, length: 1000 });
    expect(parseRange('bytes=100-199', 1000)).toEqual({ offset: 100, length: 100 });
    expect(parseRange('bytes=900-5000', 1000)).toEqual({ offset: 900, length: 100 });
    expect(parseRange('bytes=-100', 1000)).toEqual({ offset: 900, length: 100 });
    expect(parseRange('bytes=1000-', 1000)).toBeNull();
    expect(parseRange('bytes=5-2', 1000)).toBeNull();
    expect(parseRange('items=0-1', 1000)).toBeNull();
  });
});

describe('GET /music/[file]', () => {
  it('serves only catalogued files', async () => {
    const res = await GET(req(), ctx('not-a-track.mp3'));
    expect(res.status).toBe(404);
    expect(m.get).not.toHaveBeenCalled();
  });

  it('streams a whole track with long-lived caching', async () => {
    const res = await GET(req(), ctx('carefree.mp3'));
    expect(res.status).toBe(200);
    expect(m.get).toHaveBeenCalledWith('music/carefree.mp3', undefined);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(res.headers.get('content-length')).toBe('1000');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('cache-control')).toContain('immutable');
  });

  it('honours byte ranges', async () => {
    const res = await GET(req('bytes=200-299'), ctx('carefree.mp3'));
    expect(res.status).toBe(206);
    expect(m.get).toHaveBeenCalledWith('music/carefree.mp3', { range: { offset: 200, length: 100 } });
    expect(res.headers.get('content-range')).toBe('bytes 200-299/1000');
    expect(res.headers.get('content-length')).toBe('100');
  });

  it('404s when the object is missing from the bucket', async () => {
    m.head.mockResolvedValueOnce(null);
    const res = await GET(req(), ctx('carefree.mp3'));
    expect(res.status).toBe(404);
  });

  it('504s instead of hanging when the R2 head() never settles', async () => {
    vi.useFakeTimers();
    try {
      m.head.mockImplementation(() => new Promise(() => undefined));
      const pending = GET(req(), ctx('carefree.mp3'));
      await vi.advanceTimersByTimeAsync(10_000);
      expect((await pending).status).toBe(504);
    } finally {
      vi.useRealTimers();
    }
  });

  it('504s instead of hanging when the R2 get() never settles', async () => {
    vi.useFakeTimers();
    try {
      m.get.mockImplementation(() => new Promise(() => undefined));
      const pending = GET(req(), ctx('carefree.mp3'));
      await vi.advanceTimersByTimeAsync(10_000);
      expect((await pending).status).toBe(504);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('HEAD /music/[file]', () => {
  it('reports content-length with no body', async () => {
    const res = await HEAD(req(undefined, 'HEAD'), ctx('carefree.mp3'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-length')).toBe('1000');
    expect(res.body).toBeNull();
  });

  it('reports content-length for a ranged HEAD, with no body', async () => {
    const res = await HEAD(req('bytes=200-299', 'HEAD'), ctx('carefree.mp3'));
    expect(res.status).toBe(206);
    expect(res.headers.get('content-length')).toBe('100');
    expect(res.headers.get('content-range')).toBe('bytes 200-299/1000');
    expect(res.body).toBeNull();
  });
});
