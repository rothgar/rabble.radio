// src/lib/music.ts
//
// Pre-show music. A host picks a mood for their show; every client in the
// room plays that mood's tracks locally while the show is off air (and in
// the demo shows, which have no live audio at all). Tracks are served from
// the recordings bucket under `music/<file>` by GET /music/<file>.
//
// All tracks are by Kevin MacLeod (incompetech.com), licensed under
// Creative Commons: By Attribution 4.0 — https://creativecommons.org/licenses/by/4.0/
// Attribution is shown wherever a track plays.
//
// Two entry points share serveMusic(): custom-worker.ts answers /music/*
// before Next.js (since Next 16.4.6 every route-handler Response loses its
// content-length, same root cause as src/lib/downloads.ts), and
// src/app/music/[file]/route.ts keeps `next dev` working.

import { withR2Timeout, R2TimeoutError } from '@/lib/r2-timeout';

export interface MusicTrack {
  /** File name under music/ in the bucket, also the URL path segment. */
  file: string;
  title: string;
  /** Short form for display next to a title, e.g. "Kevin MacLeod". */
  artistName: string;
  /** Full attribution form, e.g. "Kevin MacLeod (incompetech.com)". */
  artist: string;
  license: string;
  licenseUrl: string;
  durationSeconds: number;
}

export interface MusicMood {
  id: string;
  label: string;
  description: string;
  tracks: MusicTrack[];
}

const KM = {
  artistName: 'Kevin MacLeod',
  artist: 'Kevin MacLeod (incompetech.com)',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
};

export const MOODS: MusicMood[] = [
  {
    id: 'lounge',
    label: 'Lounge',
    description: 'Easy-going jazz and bossa for a relaxed room.',
    tracks: [
      { file: 'airport-lounge.mp3', title: 'Airport Lounge', durationSeconds: 308, ...KM },
      { file: 'backbay-lounge.mp3', title: 'Backbay Lounge', durationSeconds: 267, ...KM },
      { file: 'lobby-time.mp3', title: 'Lobby Time', durationSeconds: 193, ...KM },
    ],
  },
  {
    id: 'upbeat',
    label: 'Upbeat',
    description: 'Bright and bouncy, for shows that start with energy.',
    tracks: [
      { file: 'carefree.mp3', title: 'Carefree', durationSeconds: 205, ...KM },
      { file: 'george-street-shuffle.mp3', title: 'George Street Shuffle', durationSeconds: 268, ...KM },
      { file: 'pamgaea.mp3', title: 'Pamgaea', durationSeconds: 169, ...KM },
    ],
  },
  {
    id: 'focus',
    label: 'Focus',
    description: 'Calm, ambient piano and pads for talks and deep dives.',
    tracks: [
      { file: 'deliberate-thought.mp3', title: 'Deliberate Thought', durationSeconds: 177, ...KM },
      { file: 'meditation-impromptu-01.mp3', title: 'Meditation Impromptu 01', durationSeconds: 213, ...KM },
      { file: 'dreamy-flashback.mp3', title: 'Dreamy Flashback', durationSeconds: 127, ...KM },
    ],
  },
  {
    id: 'groove',
    label: 'Groove',
    description: 'Latin and funk grooves with a bit of swagger.',
    tracks: [
      { file: 'bossa-antigua.mp3', title: 'Bossa Antigua', durationSeconds: 283, ...KM },
      { file: 'fretless.mp3', title: 'Fretless', durationSeconds: 336, ...KM },
      { file: 'wallpaper.mp3', title: 'Wallpaper', durationSeconds: 220, ...KM },
    ],
  },
];

export const MOOD_IDS: string[] = MOODS.map((m) => m.id);

export function getMood(id: string | null | undefined): MusicMood | null {
  if (!id) return null;
  return MOODS.find((m) => m.id === id) ?? null;
}

/** True for a known mood id; null clears the mood. */
export function isValidMood(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && MOOD_IDS.includes(value));
}

export function musicUrl(track: MusicTrack): string {
  return `/music/${encodeURIComponent(track.file)}`;
}

const ALL_FILES: Record<string, MusicTrack> = Object.fromEntries(
  MOODS.flatMap((m) => m.tracks.map((t) => [t.file, t]))
);

export function trackByFile(file: string): MusicTrack | null {
  return ALL_FILES[file] ?? null;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/**
 * The mood's tracks in the order a given room plays them. Deterministic
 * per show so everyone in the room starts on the same song, different
 * across shows so two lobbies don't sound identical.
 */
export function playlistFor(mood: MusicMood, spaceId: string): MusicTrack[] {
  const n = mood.tracks.length;
  if (n === 0) return [];
  const start = hashString(spaceId) % n;
  return mood.tracks.map((_, i) => mood.tracks[(start + i) % n]);
}

export function attribution(track: MusicTrack): string {
  return `${track.title} by ${track.artist}, ${track.license}`;
}

/** The track's title and artist, standing in for a guest's name on the tile. */
export function guestName(track: MusicTrack): string {
  return `${track.title} by ${track.artistName}`;
}

/** Minimal shape of the R2 binding, kept local to avoid the Workers globals. */
export interface R2ObjectLike {
  body: ReadableStream;
  size: number;
  httpEtag: string;
}
export interface R2BucketLike {
  get(key: string, options?: { range?: { offset: number; length: number } }): Promise<R2ObjectLike | null>;
  head(key: string): Promise<{ size: number } | null>;
}

/** The file name for a /music/<file> path, or null when it is not one. */
export function musicFileFromPath(pathname: string): string | null {
  const m = /^\/music\/([^/]+)$/.exec(pathname);
  if (!m) return null;
  // decodeURIComponent throws on a malformed percent sequence (REVIEW.md:
  // src/app/station/[tag]/page.tsx) rather than letting trackByFile reject it.
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

/** Parse a single `bytes=a-b` range against a known size; null when absent or unusable. */
export function parseRange(header: string | null, size: number): { offset: number; length: number } | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, a, b] = m;
  if (a === '' && b === '') return null;
  let start: number;
  let end: number;
  if (a === '') {
    const suffix = Number(b);
    if (suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(a);
    end = b === '' ? size - 1 : Math.min(Number(b), size - 1);
  }
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) return null;
  return { offset: start, length: end - start + 1 };
}

/**
 * Build the response for one track. 404 for an uncatalogued file or a
 * missing object, 503 without the bucket. HEAD and a ranged GET both get an
 * accurate content-length; HEAD gets no body, so the size is visible without
 * a transfer.
 */
export async function serveMusic(
  file: string,
  method: string,
  rangeHeader: string | null,
  bucket: R2BucketLike | undefined
): Promise<Response> {
  const track = trackByFile(file);
  if (!track) return Response.json({ error: 'not_found' }, { status: 404 });
  if (!bucket) return Response.json({ error: 'storage_unavailable' }, { status: 503 });
  const key = `music/${file}`;
  // head() and get() share one timeout budget: two independent timeouts
  // would let a request that stalls on both take 2x R2_TIMEOUT_MS.
  let head: { size: number } | null;
  let object: R2ObjectLike | null;
  let range: { offset: number; length: number } | null;
  try {
    ({ head, object, range } = await withR2Timeout(
      (async () => {
        const h = await bucket.head(key);
        if (!h) return { head: null, object: null, range: null };
        const r = parseRange(rangeHeader, h.size);
        const o = await bucket.get(key, r ? { range: r } : undefined);
        return { head: h, object: o, range: r };
      })(),
      'music.r2_timeout',
      { file }
    ));
  } catch (err) {
    if (err instanceof R2TimeoutError) {
      return Response.json({ error: 'storage_timeout' }, { status: 504 });
    }
    throw err;
  }
  if (!head || !object) return Response.json({ error: 'not_found' }, { status: 404 });
  const headers: Record<string, string> = {
    'content-type': 'audio/mpeg',
    'accept-ranges': 'bytes',
    'cache-control': 'public, max-age=31536000, immutable',
    etag: object.httpEtag,
    'x-music-title': track.title,
  };
  const status = range ? 206 : 200;
  if (range) {
    headers['content-length'] = String(range.length);
    headers['content-range'] = `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`;
  } else {
    headers['content-length'] = String(head.size);
  }
  if (method === 'HEAD') {
    // Drop the stream so it is not left open.
    void object.body.cancel().catch(() => undefined);
    return new Response(null, { status, headers });
  }
  return new Response(object.body, { status, headers });
}
