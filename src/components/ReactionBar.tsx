'use client';

import type { ReactElement } from 'react';

export interface ReactionBarProps {
  onReact: (emoji: string) => void;
}

const EMOJIS: readonly string[] = ['👍', '❤️', '😂', '🎉', '👏'];

export function ReactionBar({ onReact }: ReactionBarProps): ReactElement {
  return (
    <div
      className="flex items-center gap-1"
      data-testid="reaction-bar"
      role="toolbar"
      aria-label="Send a reaction"
    >
      {EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onReact(emoji)}
          aria-label={`React with ${emoji}`}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-surface)] text-base transition-colors hover:bg-[var(--color-accent-800)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          data-testid={`reaction-${emoji}`}
        >
          <span aria-hidden>{emoji}</span>
        </button>
      ))}
    </div>
  );
}

export default ReactionBar;
