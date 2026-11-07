'use client';

// src/components/PreShowMusic.tsx
//
// Plays the show's pre-show music mood locally while `active` is true
// (the show is off air, or nobody is publishing audio). Each client runs
// its own player, so the music never enters the LiveKit mix or the
// recording. The host picks the mood from here; the choice is saved on
// the show and broadcast to everyone in the room.
//
// Browsers block audio that starts without a user gesture. Joining is a
// click, so this normally just plays; when it is blocked (auto-join from
// a link, say) a Play button is offered instead.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { getMood, MOODS, musicUrl, playlistFor } from '@/lib/music';

export const MUSIC_VOLUME = 0.35;
const MUTED_KEY = 'rabble.musicMuted';

export interface PreShowMusicProps {
  spaceId: string;
  moodId: string | null;
  /** Whether music should be playing right now. */
  active: boolean;
  isHost: boolean;
  /** Host only: save a new mood (null for silence). */
  onMoodChange?: (mood: string | null) => Promise<void> | void;
}

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function PreShowMusic({ spaceId, moodId, active, isHost, onMoodChange }: PreShowMusicProps): ReactElement | null {
  const mood = getMood(moodId);
  const playlist = useMemo(() => (mood ? playlistFor(mood, spaceId) : []), [mood, spaceId]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // The position is tied to the mood it was reached in, so a new mood
  // starts again from the room's first track without an effect.
  const [cursor, setCursor] = useState<{ mood: string | null; index: number }>({ mood: moodId, index: 0 });
  const index = cursor.mood === moodId ? cursor.index : 0;
  const [muted, setMuted] = useState(() => typeof window !== 'undefined' && readMuted());
  const [blocked, setBlocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const track = playlist.length > 0 ? playlist[index % playlist.length] : null;
  const playing = active && !muted && track !== null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!playing || !track) {
      audio.pause();
      return;
    }
    const src = musicUrl(track);
    if (!audio.src.endsWith(src)) {
      audio.src = src;
    }
    audio.volume = MUSIC_VOLUME;
    audio
      .play()
      .then(() => setBlocked(false))
      .catch(() => setBlocked(true));
  }, [playing, track]);

  useEffect(() => () => audioRef.current?.pause(), []);

  const next = useCallback(() => {
    if (playlist.length > 0) setCursor({ mood: moodId, index: (index + 1) % playlist.length });
  }, [index, moodId, playlist.length]);

  const toggleMuted = useCallback(() => {
    setMuted((m) => {
      const v = !m;
      try {
        window.localStorage.setItem(MUTED_KEY, v ? '1' : '0');
      } catch {
        // Fine: the choice just will not stick between visits.
      }
      return v;
    });
  }, []);

  const resume = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio
      .play()
      .then(() => setBlocked(false))
      .catch(() => setBlocked(true));
  }, []);

  const pick = useCallback(
    async (id: string | null) => {
      if (!onMoodChange || saving) return;
      setSaving(true);
      setError(null);
      try {
        await onMoodChange(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save the music mood.');
      } finally {
        setSaving(false);
      }
    },
    [onMoodChange, saving]
  );

  const canPick = isHost && Boolean(onMoodChange);
  if (!mood && !canPick) return null;

  return (
    <section
      className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
      data-testid="pre-show-music"
      data-playing={playing ? 'true' : 'false'}
      data-mood={mood?.id ?? ''}
    >
      <audio ref={audioRef} preload="none" onEnded={next} data-testid="pre-show-audio" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-label font-semibold text-[var(--color-text)]">
          ♪ Pre-show music{mood ? ` · ${mood.label}` : ''}
        </p>
        {mood ? (
          <div className="flex items-center gap-2">
            {blocked && active && !muted ? (
              <button
                type="button"
                onClick={resume}
                className="inline-flex min-h-touch items-center rounded-full bg-[var(--color-accent)] px-3 text-label font-medium text-white hover:bg-[var(--color-accent-hover)]"
                data-testid="pre-show-music-play"
              >
                Play music
              </button>
            ) : null}
            <button
              type="button"
              onClick={toggleMuted}
              aria-pressed={muted}
              className="inline-flex min-h-touch items-center rounded-full border border-[var(--color-border-strong)] px-3 text-label text-[var(--color-text)] hover:bg-[var(--color-surface-raised)]"
              data-testid="pre-show-music-mute"
            >
              {muted ? 'Unmute music' : 'Mute music'}
            </button>
          </div>
        ) : null}
      </div>
      {track && mood ? (
        <p className="text-caption text-[var(--color-text-secondary)]" data-testid="pre-show-music-track">
          {active ? 'Now playing' : 'Next up'}: {track.title} by {track.artist},{' '}
          <a href={track.licenseUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
            {track.license}
          </a>
        </p>
      ) : null}
      {canPick ? (
        <div className="flex flex-col gap-2">
          <p className="text-caption text-[var(--color-text-tertiary)]">
            Plays for everyone waiting in the room until you go on air. It is not recorded.
          </p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Music mood" data-testid="pre-show-music-moods">
            {MOODS.map((m) => {
              const selected = m.id === mood?.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={saving}
                  title={m.description}
                  onClick={() => void pick(selected ? null : m.id)}
                  className={
                    'inline-flex min-h-touch items-center rounded-full border px-3 text-label disabled:opacity-50 ' +
                    (selected
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-text)]'
                      : 'border-[var(--color-border-strong)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)]')
                  }
                  data-testid={`pre-show-music-mood-${m.id}`}
                >
                  {m.label}
                </button>
              );
            })}
            <button
              type="button"
              role="radio"
              aria-checked={!mood}
              disabled={saving || !mood}
              onClick={() => void pick(null)}
              className="inline-flex min-h-touch items-center rounded-full border border-[var(--color-border-strong)] px-3 text-label text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)] disabled:opacity-50"
              data-testid="pre-show-music-mood-off"
            >
              Off
            </button>
          </div>
          {error ? (
            <p role="alert" className="text-caption text-[var(--color-live)]" data-testid="pre-show-music-error">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default PreShowMusic;
