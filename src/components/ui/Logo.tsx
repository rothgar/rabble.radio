import type { ReactElement } from 'react';

interface MonogramProps {
  className?: string;
  /** Wave colour defaults to Rebel Red; pass `currentColor` for single-tone. */
  wave?: string;
}

/**
 * The "R" monogram: a heavy slab-serif R whose bowl becomes a dot and whose
 * right side becomes two radio waves. Source of truth is
 * assets/brand/monogram.svg; keep the paths in sync.
 */
export function Monogram({ className = 'h-8 w-8', wave = 'var(--color-accent)' }: MonogramProps): ReactElement {
  return (
    <svg viewBox="0 0 1024 1024" className={className} aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M 268 246 L 436 246 L 436 505 L 522 505 L 693 697 L 756 716 L 756 779 L 612 779 L 452 582 L 436 582 L 436 705 L 478 717 L 478 779 L 268 779 L 268 717 L 313 705 L 313 318 L 268 306 Z"
      />
      <circle cx="462.5" cy="450.5" r="79.5" fill={wave} />
      <path d="M 477.07 283.94 A 167.20 167.20 0 0 1 617.53 513.13" fill="none" stroke={wave} strokeWidth="58.5" strokeLinecap="round" />
      <path d="M 472.09 175.77 A 274.90 274.90 0 0 1 684.90 612.08" fill="none" stroke={wave} strokeWidth="58.5" strokeLinecap="round" />
    </svg>
  );
}

interface WordmarkProps {
  className?: string;
  /** Hide the text on narrow screens, keep the monogram. */
  compact?: boolean;
}

/** Monogram plus the lower-case "rabble radio" wordmark in the display face. */
export function Wordmark({ className = '', compact = false }: WordmarkProps): ReactElement {
  return (
    <span className={`inline-flex items-center gap-2 text-[var(--color-text)] ${className}`}>
      <Monogram className="h-8 w-8 shrink-0" />
      <span className={`font-display text-heading leading-none ${compact ? 'hidden sm:inline' : ''}`}>
        rabble radio
      </span>
    </span>
  );
}

export default Wordmark;
