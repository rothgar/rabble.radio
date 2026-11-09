'use client';

// src/components/FloatingReaction.tsx
//
// One reaction rising from someone's avatar. It pops in at full strength,
// holds solid for most of its life, then fades as it drifts off the top.
// Only the emoji is shown: it starts from the sender's avatar, which is all
// the attribution the room needs.

import { useEffect, useMemo } from 'react';
import type { ReactElement } from 'react';

/** How long a reaction stays on screen. Matches the `float-up` keyframes. */
export const FLOAT_MS = 3200;

export interface FloatingReactionProps {
  id: string;
  emoji: string;
  x: number;
  y: number;
  onDone: (id: string) => void;
}

function hashDrift(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 61) - 30;
}

export function FloatingReaction({ id, emoji, x, y, onDone }: FloatingReactionProps): ReactElement {
  useEffect(() => {
    const timer = window.setTimeout(() => onDone(id), FLOAT_MS);
    return () => window.clearTimeout(timer);
  }, [id, onDone]);

  const drift = useMemo(() => hashDrift(id), [id]);

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
        className="flex items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-[var(--shadow-md)]"
        data-testid="floating-reaction-chip"
      >
        <span className="text-4xl leading-none" data-testid="floating-reaction-emoji">
          {emoji}
        </span>
      </div>
    </div>
  );
}

export default FloatingReaction;
