// tests/lib/music.test.ts

import { describe, expect, it, vi } from 'vitest';
import {
  attribution,
  getMood,
  guestName,
  isValidMood,
  MOODS,
  musicFileFromPath,
  musicUrl,
  playlistFor,
  serveMusic,
  trackByFile,
} from '@/lib/music';

function object(size = 1000) {
  return { body: new ReadableStream(), size, httpEtag: '"abc"' };
}

describe('music catalog', () => {
  it('has distinct moods, each with attributed tracks and unique files', () => {
    expect(MOODS.length).toBeGreaterThanOrEqual(3);
    const ids = new Set(MOODS.map((m) => m.id));
    expect(ids.size).toBe(MOODS.length);
    const files = MOODS.flatMap((m) => m.tracks.map((t) => t.file));
    expect(new Set(files).size).toBe(files.length);
    for (const m of MOODS) {
      expect(m.tracks.length).toBeGreaterThan(0);
      for (const t of m.tracks) {
        expect(t.file).toMatch(/^[a-z0-9-]+\.mp3$/);
        expect(t.artist).toContain('Kevin MacLeod');
        expect(t.artistName).toBe('Kevin MacLeod');
        expect(t.licenseUrl).toMatch(/^https:\/\/creativecommons\.org\//);
        expect(t.durationSeconds).toBeGreaterThan(60);
      }
    }
  });

  it('looks up moods and tracks, and validates ids', () => {
    expect(getMood('lounge')?.label).toBe('Lounge');
    expect(getMood('nope')).toBeNull();
    expect(getMood(null)).toBeNull();
    expect(isValidMood('upbeat')).toBe(true);
    expect(isValidMood(null)).toBe(true);
    expect(isValidMood('')).toBe(false);
    expect(isValidMood(42)).toBe(false);
    expect(trackByFile('carefree.mp3')?.title).toBe('Carefree');
    expect(trackByFile('../etc/passwd')).toBeNull();
    expect(musicUrl(trackByFile('carefree.mp3')!)).toBe('/music/carefree.mp3');
  });

  it('orders a playlist deterministically per room, covering every track', () => {
    const mood = getMood('groove')!;
    const a = playlistFor(mood, 'space-a');
    const again = playlistFor(mood, 'space-a');
    expect(a).toEqual(again);
    expect(new Set(a.map((t) => t.file)).size).toBe(mood.tracks.length);
    const starts = new Set(['sp1', 'sp2', 'sp3', 'sp4', 'sp5', 'sp6', 'sp7'].map((id) => playlistFor(mood, id)[0].file));
    expect(starts.size).toBeGreaterThan(1);
  });

  it('formats attribution', () => {
    expect(attribution(trackByFile('wallpaper.mp3')!)).toBe('Wallpaper by Kevin MacLeod (incompetech.com), CC BY 4.0');
  });

  it('formats a guest name standing in for the track', () => {
    expect(guestName(trackByFile('wallpaper.mp3')!)).toBe('Wallpaper by Kevin MacLeod');
  });
});

describe('musicFileFromPath', () => {
  it('matches only one-segment /music paths', () => {
    expect(musicFileFromPath('/music/carefree.mp3')).toBe('carefree.mp3');
    expect(musicFileFromPath('/music/a/b')).toBeNull();
    expect(musicFileFromPath('/music')).toBeNull();
    expect(musicFileFromPath('/api/health')).toBeNull();
  });

  it('rejects a malformed percent sequence instead of throwing', () => {
    expect(musicFileFromPath('/music/%')).toBeNull();
  });
});

describe('serveMusic', () => {
  it('reports content-length on a whole-track GET', async () => {
    const head = vi.fn(async () => ({ size: 1000 }));
    const get = vi.fn(async () => object());
    const res = await serveMusic('carefree.mp3', 'GET', null, { head, get });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-length')).toBe('1000');
    expect(get).toHaveBeenCalledWith('music/carefree.mp3', undefined);
  });

  it('reports content-length on a ranged GET', async () => {
    const head = vi.fn(async () => ({ size: 1000 }));
    const get = vi.fn(async () => object(100));
    const res = await serveMusic('carefree.mp3', 'GET', 'bytes=200-299', { head, get });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-length')).toBe('100');
    expect(res.headers.get('content-range')).toBe('bytes 200-299/1000');
    expect(get).toHaveBeenCalledWith('music/carefree.mp3', { range: { offset: 200, length: 100 } });
  });

  it('reports content-length on a HEAD request, with no body', async () => {
    const head = vi.fn(async () => ({ size: 1000 }));
    const get = vi.fn(async () => object());
    const res = await serveMusic('carefree.mp3', 'HEAD', null, { head, get });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-length')).toBe('1000');
    expect(res.body).toBeNull();
  });

  it('reports content-length on a ranged HEAD request, with no body', async () => {
    const head = vi.fn(async () => ({ size: 1000 }));
    const get = vi.fn(async () => object(100));
    const res = await serveMusic('carefree.mp3', 'HEAD', 'bytes=200-299', { head, get });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-length')).toBe('100');
    expect(res.headers.get('content-range')).toBe('bytes 200-299/1000');
    expect(res.body).toBeNull();
  });

  it('404s for uncatalogued files and missing objects, 503 without a bucket', async () => {
    const head = vi.fn(async () => ({ size: 1000 }));
    expect((await serveMusic('../secret.mp3', 'GET', null, { head, get: vi.fn() })).status).toBe(404);
    expect((await serveMusic('carefree.mp3', 'GET', null, { head: vi.fn(async () => null), get: vi.fn() })).status).toBe(
      404
    );
    expect((await serveMusic('carefree.mp3', 'GET', null, undefined)).status).toBe(503);
  });
});
