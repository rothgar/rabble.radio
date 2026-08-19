'use client';

import { useEffect } from 'react';
import type { ReactElement } from 'react';

export interface FloatingReactionProps {
  id: string;
  emoji: string;
  x: number;
  y: number;
  onDone: (id: string) => void;
}

export function FloatingReaction({
  id,
  emoji,
  x,
  y,
  onDone,
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
      {emoji}
    </div>
  );
}

export default FloatingReaction;
