// tests/api/music.test.ts — GET /music/[file]

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({ get: vi.fn(), head: vi.fn() }));
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: { RECORDINGS: { get: m.get, head: m.head } } }),
}));

import { GET, parseRange } from '@/app/music/[file]/route';

const ctx = (file: string) => ({ params: Promise.resolve({ file }) });
const req = (range?: string) =>
  new NextRequest('https://rabble.rodeo/music/carefree.mp3', { headers: range ? { range } : {} });

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
});
