'use client';

// src/components/FloatingReaction.tsx
//
// One reaction rising from someone's avatar. It pops in at full strength,
// holds solid for most of its life so the room can read who sent what,
// then fades as it drifts off the top. The chip carries the sender's
// avatar and name next to the emoji.

import { useEffect, useMemo } from 'react';
import type { ReactElement } from 'react';

/** How long a reaction stays on screen. Matches the `float-up` keyframes. */
export const FLOAT_MS = 3200;

export interface FloatingReactionProps {
  id: string;
  emoji: string;
  x: number;
  y: number;
  /** Who reacted; shown beside the emoji. */
  name?: string;
  avatarUrl?: string | null;
  onDone: (id: string) => void;
}

function hashDrift(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 61) - 30;
}

export function FloatingReaction({
  id,
  emoji,
  x,
  y,
  name,
  avatarUrl,
  onDone,
}: FloatingReactionProps): ReactElement {
  useEffect(() => {
    const timer = window.setTimeout(() => onDone(id), FLOAT_MS);
    return () => window.clearTimeout(timer);
  }, [id, onDone]);

  const drift = useMemo(() => hashDrift(id), [id]);
  const initials = (name ?? '').replace(/^@/, '').slice(0, 2).toUpperCase();

  return (
    <div
      aria-hidden
      data-testid={`floating-reaction-${id}`}
      className="pointer-events-none fixed z-50 select-none"
      style={{
        left: x,
        top: y,
        ['--drift' as string]: `${drift}px`,
        transform: 'translate(-50%, -100%)',
        animation: `float-up ${FLOAT_MS}ms linear forwards`,
      }}
    >
      <div
        className="flex items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface)]/95 py-1 pl-1 pr-3 shadow-lg backdrop-blur"
        data-testid="floating-reaction-chip"
      >
        {name ? (
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-accent-900)] text-[10px] font-semibold text-[var(--color-accent-100)]">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" data-testid="floating-reaction-avatar" />
            ) : (
              initials
            )}
          </span>
        ) : null}
        {name ? (
          <span className="max-w-[9rem] truncate text-label font-semibold text-[var(--color-text)]" data-testid="floating-reaction-name">
            {name}
          </span>
        ) : null}
        <span className="text-4xl leading-none" data-testid="floating-reaction-emoji">
          {emoji}
        </span>
      </div>
    </div>
  );
}

export default FloatingReaction;
