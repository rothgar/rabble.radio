import type { ReactElement } from 'react';
import { MONOGRAM_LETTER_PATH, MONOGRAM_VIEW_BOX, MONOGRAM_WAVE_ARCS, MONOGRAM_WAVE_DOT } from '@/lib/brand-mark';

interface MonogramProps {
  className?: string;
  /** Wave colour defaults to Rebel Red; pass `currentColor` for single-tone. */
  wave?: string;
}

/**
 * The "R" monogram: a heavy slab-serif R whose bowl becomes a dot and whose
 * right side becomes two radio waves. Path data is shared with
 * src/app/show/[id]/opengraph-image.tsx via src/lib/brand-mark.ts.
 */
export function Monogram({ className = 'h-8 w-8', wave = 'var(--color-accent)' }: MonogramProps): ReactElement {
  return (
    <svg viewBox={MONOGRAM_VIEW_BOX} className={className} aria-hidden="true" focusable="false">
      <path fill="currentColor" d={MONOGRAM_LETTER_PATH} />
      <circle cx={MONOGRAM_WAVE_DOT.cx} cy={MONOGRAM_WAVE_DOT.cy} r={MONOGRAM_WAVE_DOT.r} fill={wave} />
      {MONOGRAM_WAVE_ARCS.map((d) => (
        <path key={d} d={d} fill="none" stroke={wave} strokeWidth="58.5" strokeLinecap="round" />
      ))}
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
