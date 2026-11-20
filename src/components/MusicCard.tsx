'use client';

// src/components/MusicCard.tsx
//
// Pre-show music, rendered as a tile in the on-stage grid the same way a
// speaker shows up there (issue #69). It is not a LiveKit participant: each
// client plays the room's mood locally, so music never enters the mix or
// the recording. The host taps the tile to open the same action-menu
// pattern as a speaker card, pick a different mood (standing in for
// "invite a different guest"), or remove music from the stage entirely
// (sets the mood to null).
//
// Browsers block audio that starts without a user gesture. Joining is a
// click, so this normally just plays; when it is blocked (auto-join from a
// link, say) a Play control is offered on the tile instead.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { MusicNotes, Play, SpeakerSimpleSlash } from '@phosphor-icons/react';
import { getMood, MOODS, musicUrl, playlistFor } from '@/lib/music';

export const MUSIC_VOLUME = 0.35;

export interface MusicCardProps {
  spaceId: string;
  /** Pre-show music mood id (null for no music on stage). */
  moodId: string | null;
  /** Whether music should be audible right now. */
  active: boolean;
  isHost: boolean;
  /** Host only: persist a new mood (null removes music from the stage). */
  onMoodChange?: (mood: string | null) => Promise<void> | void;
}

export function MusicCard({ spaceId, moodId, active, isHost, onMoodChange }: MusicCardProps): ReactElement {
  const mood = getMood(moodId);
  const playlist = useMemo(() => (mood ? playlistFor(mood, spaceId) : []), [mood, spaceId]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // The position is tied to the mood it was reached in, so a new mood
  // starts again from the room's first track without an effect.
  const [cursor, setCursor] = useState<{ mood: string | null; index: number }>({ mood: moodId, index: 0 });
  const index = cursor.mood === moodId ? cursor.index : 0;
  const [blocked, setBlocked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const track = playlist.length > 0 ? playlist[index % playlist.length] : null;
  const playing = active && track !== null;

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

  const resume = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio
      .play()
      .then(() => setBlocked(false))
      .catch(() => setBlocked(true));
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  const canPick = isHost && Boolean(onMoodChange);

  const pick = useCallback(
    async (id: string | null) => {
      if (!onMoodChange || saving) return;
      setSaving(true);
      setError(null);
      try {
        await onMoodChange(id);
        setMenuOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save the music mood.');
      } finally {
        setSaving(false);
      }
    },
    [onMoodChange, saving]
  );

  const toggleMenu = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (blocked) resume();
      setMenuOpen((v) => !v);
    },
    [blocked, resume]
  );

  const avatarInner = (
    <div
      className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-[var(--color-ink)] sm:h-20 sm:w-20"
      style={{ boxShadow: '0 0 0 2px var(--color-neutral-800)' }}
      data-testid="music-avatar"
    >
      <MusicNotes size={28} weight="fill" className="text-[var(--color-text-on-ink)]" />
    </div>
  );

  const avatar = (
    <div className="relative inline-flex p-1" data-testid="music-avatar-wrap">
      {canPick ? (
        <button
          type="button"
          onClick={toggleMenu}
          className="cursor-pointer appearance-none rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          aria-label="Music actions"
          aria-expanded={menuOpen}
          data-testid="music-menu-trigger"
        >
          {avatarInner}
        </button>
      ) : blocked ? (
        <button
          type="button"
          onClick={resume}
          className="cursor-pointer appearance-none rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          aria-label="Play music"
          data-testid="music-card-play"
        >
          {avatarInner}
        </button>
      ) : (
        avatarInner
      )}
      {!playing ? (
        <span
          aria-hidden
          data-testid="music-muted-badge"
          className="pointer-events-none absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[var(--color-bg)] bg-[var(--color-error)] text-white"
        >
          <SpeakerSimpleSlash size={14} weight="fill" />
        </span>
      ) : blocked ? (
        <span
          aria-hidden
          data-testid="music-blocked-badge"
          className="pointer-events-none absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[var(--color-bg)] bg-[var(--color-accent)] text-white"
        >
          <Play size={12} weight="fill" />
        </span>
      ) : null}
    </div>
  );

  return (
    <div
      className="relative flex min-w-0 flex-col items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] p-3 sm:p-4"
      data-testid="music-card"
      data-playing={playing ? 'true' : 'false'}
      data-mood={mood?.id ?? ''}
    >
      <audio ref={audioRef} preload="none" onEnded={next} data-testid="music-audio" />
      <div className="flex flex-col items-center gap-2" data-testid="music-card-body">
        {avatar}
        <div className="flex min-w-0 max-w-full flex-col items-center text-center">
          <span className="truncate text-sm font-medium text-[var(--color-text)]" data-testid="music-name">
            Music
          </span>
          <span className="truncate text-xs text-[var(--color-text-secondary)]" data-testid="music-mood-label">
            {mood ? mood.label : 'No music'}
          </span>
        </div>
      </div>
      {track && mood ? (
        <p className="text-center text-caption text-[var(--color-text-tertiary)]" data-testid="music-track">
          {playing ? 'Now playing' : 'Next up'}: {track.title} by {track.artist},{' '}
          <a
            href={track.licenseUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="underline-offset-2 hover:underline"
          >
            {track.license}
          </a>
        </p>
      ) : null}

      {menuOpen && canPick ? (
        <div
          className="absolute left-1/2 top-full z-20 mt-2 w-48 max-w-[calc(100vw-1rem)] -translate-x-1/2 rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] p-2 text-sm shadow-lg"
          ref={menuRef}
          data-testid="music-menu-panel"
        >
          <p className="px-2 pb-1 text-xs text-[var(--color-text-tertiary)]">
            Plays for everyone waiting in the room until you go on air. It is not recorded.
          </p>
          {MOODS.map((m) => {
            const selected = m.id === mood?.id;
            return (
              <button
                key={m.id}
                type="button"
                disabled={saving}
                onClick={() => void pick(m.id)}
                className={
                  'block w-full rounded-md px-2 py-1.5 text-left disabled:opacity-50 ' +
                  (selected
                    ? 'bg-[var(--color-accent-muted)] text-[var(--color-text)]'
                    : 'text-[var(--color-text)] hover:bg-[var(--color-ink-muted)]')
                }
                data-testid={`music-mood-${m.id}`}
              >
                {m.label}
              </button>
            );
          })}
          {mood ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void pick(null)}
              className="w-full rounded-md px-2 py-1.5 text-left text-[var(--color-warning-text)] hover:bg-[var(--color-ink-muted)] disabled:opacity-50"
              data-testid="music-mood-remove"
            >
              Remove from stage
            </button>
          ) : null}
          {error ? (
            <p role="alert" className="px-2 pt-1 text-xs text-[var(--color-live)]" data-testid="music-error">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default MusicCard;
