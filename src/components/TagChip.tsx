// src/components/TagChip.tsx
//
// A clickable category tag that jumps to that tag's station page.

import Link from 'next/link';
import type { ReactElement } from 'react';

interface TagChipProps {
  tag: string;
  /** Highlight the current station (e.g. on the station detail page). */
  active?: boolean;
}

export function TagChip({ tag, active = false }: TagChipProps): ReactElement {
  return (
    <Link
      href={`/station/${encodeURIComponent(tag)}`}
      className={
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ' +
        (active
          ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
          : 'border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)] hover:bg-[var(--color-ink-muted)]')
      }
      data-testid={`tag-chip-${tag}`}
      data-active={active ? 'true' : 'false'}
    >
      {tag}
    </Link>
  );
}

export default TagChip;
