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

export interface MusicTrack {
  /** File name under music/ in the bucket, also the URL path segment. */
  file: string;
  title: string;
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
