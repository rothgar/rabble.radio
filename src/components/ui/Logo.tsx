import type { ReactElement } from 'react';

interface MonogramProps {
  className?: string;
  /** Wave colour defaults to Rebel Red; pass `currentColor` for single-tone. */
  wave?: string;
}

/**
 * The "R" monogram: a heavy slab-serif R whose right side becomes two radio
 * waves. Source of truth is assets/brand/monogram.svg; keep the paths in sync.
 */
export function Monogram({ className = 'h-8 w-8', wave = 'var(--color-accent)' }: MonogramProps): ReactElement {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <g fill="currentColor">
        <rect x="9" y="10" width="11" height="45" />
        <rect x="6" y="10" width="18" height="5" rx="1.5" />
        <rect x="6" y="50" width="20" height="5" rx="1.5" />
        <rect x="28" y="50" width="18" height="5" rx="1.5" />
      </g>
      <g fill="none" stroke="currentColor" strokeWidth="11" strokeLinejoin="round">
        <path d="M14 15.5h11.5a9 9 0 0 1 0 18h-11.5" />
        <path d="M22.5 34l11.5 16.8" />
      </g>
      <g fill="none" stroke={wave} strokeWidth="5" strokeLinecap="round">
        <path d="M37.8 8.5a20 20 0 0 1 0 32" />
        <path d="M42.1 3.2a27 27 0 0 1 0 42.6" />
      </g>
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
