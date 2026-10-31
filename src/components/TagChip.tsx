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
          ? 'border-sky-500 bg-sky-600 text-white'
          : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700')
      }
      data-testid={`tag-chip-${tag}`}
      data-active={active ? 'true' : 'false'}
    >
      {tag}
    </Link>
  );
}

export default TagChip;
