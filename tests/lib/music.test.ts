// tests/lib/music.test.ts

import { describe, expect, it } from 'vitest';
import { attribution, getMood, isValidMood, MOODS, musicUrl, playlistFor, trackByFile } from '@/lib/music';

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
});
