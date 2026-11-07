'use client';

import { useEffect } from 'react';
import type { ReactElement } from 'react';

export interface FloatingReactionProps {
  id: string;
  emoji: string;
  x: number;
  y: number;
  onDone: (id: string) => void;
  /** Sender's profile picture; the emoji rides on it so the room sees who reacted. */
  avatarUrl?: string | null;
  name?: string;
}

export function FloatingReaction({
  id,
  emoji,
  x,
  y,
  onDone,
  avatarUrl,
  name,
}: FloatingReactionProps): ReactElement {
  useEffect(() => {
    const timer = window.setTimeout(() => onDone(id), 1600);
    return () => window.clearTimeout(timer);
  }, [id, onDone]);

  return (
    <div
      aria-hidden
      data-testid={`floating-reaction-${id}`}
      className="pointer-events-none fixed z-50 select-none text-3xl"
      style={{
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
        animation: 'float-up 1.6s ease-out forwards',
      }}
    >
      {avatarUrl ? (
        <span className="relative inline-flex" data-testid={`floating-reaction-avatar-${id}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatarUrl}
            alt={name ?? ''}
            className="h-10 w-10 rounded-full object-cover ring-2 ring-[var(--color-neutral-800)]"
          />
          <span className="absolute -bottom-2 -right-2 text-2xl leading-none">{emoji}</span>
        </span>
      ) : (
        emoji
      )}
    </div>
  );
}

export default FloatingReaction;
