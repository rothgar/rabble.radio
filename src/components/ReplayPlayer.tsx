'use client';

// src/components/ReplayPlayer.tsx
//
// Plays a finished show's recording straight from the show page, with no
// room, stage or LiveKit connection. The audio URL is the stable
// /api/recordings/[id]/audio route, which redirects to a short-lived
// signed object URL when the browser starts fetching.

import type { ReactElement } from 'react';
import type { PublicReplay } from '@/types';

export interface ReplayPlayerProps {
  replay: PublicReplay;
  title: string;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function formatSize(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export function ReplayPlayer({ replay, title }: ReplayPlayerProps): ReactElement {
  const recorded = new Date(replay.startedAt);
  const meta = [
    Number.isNaN(recorded.getTime()) ? '' : `Recorded ${recorded.toLocaleString()}`,
    formatDuration(replay.durationSeconds),
    formatSize(replay.sizeBytes),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <section
      className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] p-4 sm:p-6"
      data-testid="replay-player"
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-[var(--color-highlight-muted)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-accent)]">
          Replay
        </span>
        <span className="text-caption text-[var(--color-text-secondary)]">This show is off air.</span>
      </div>
      <p className="text-body text-[var(--color-text)]">Listen to the recording of {title}.</p>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        controls
        preload="none"
        src={replay.audioUrl}
        className="w-full"
        data-testid="replay-audio"
      >
        Your browser cannot play this recording.{' '}
        <a href={replay.audioUrl}>Download it instead.</a>
      </audio>
      {meta ? (
        <p className="text-caption text-[var(--color-text-tertiary)]" data-testid="replay-meta">
          {meta}
        </p>
      ) : null}
    </section>
  );
}

export default ReplayPlayer;
