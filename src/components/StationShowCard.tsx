// src/components/StationShowCard.tsx
//
// A single show on a station detail page. The main area is clickable and
// navigates to the show. Shows the host's profile picture, a stacked cluster
// of listener avatars, and a reaction metric. Tag chips are rendered outside
// the clickable link to avoid nested interactive elements.

import Link from 'next/link';
import type { ReactElement } from 'react';
import type { PublicSpace } from '@/types';
import { TagChip } from '@/components/TagChip';

interface StationShowCardProps {
  show: PublicSpace;
  /** The station's tag — highlighted on this show's chips. */
  activeTag: string;
}

/** Number of listener placeholder avatars to render before collapsing. */
const LISTENER_AVATAR_CAP = 4;

function HostAvatar({ show }: { show: PublicSpace }): ReactElement {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-surface-raised)] text-xs font-medium text-[var(--color-text)]"
      data-testid="station-show-host"
      title={`@${show.host.handle}`}
    >
      {show.host.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={show.host.avatarUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        <span>{show.host.handle.slice(0, 2).toUpperCase()}</span>
      )}
    </span>
  );
}

function ListenerStack({ count }: { count: number }): ReactElement {
  const visible = Math.min(count, LISTENER_AVATAR_CAP);
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex -space-x-1.5" data-testid="station-show-listeners">
        {Array.from({ length: visible }).map((_, i) => (
          <span
            key={i}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-surface-raised)] text-[9px] font-medium text-[var(--color-text-tertiary)] ring-2 ring-[var(--color-bg)]"
            aria-hidden
          >
            {count > 0 ? '' : ''}
          </span>
        ))}
      </span>
      <span className="text-xs text-[var(--color-text-secondary)]" data-testid="station-show-listener-count">
        {count} listening
      </span>
    </span>
  );
}

export function StationShowCard({
  show,
  activeTag,
}: StationShowCardProps): ReactElement {
  return (
    <li
      className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-raised)]"
      data-testid="station-show"
    >
      <Link href={`/show/${show.id}`} className="flex flex-col gap-2.5">
        <div className="flex items-center gap-3">
          <HostAvatar show={show} />
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-[var(--color-text)] group-hover:text-[var(--color-accent)]">
              {show.title}
            </h3>
            <p className="truncate text-xs text-[var(--color-text-tertiary)]">
              @{show.host.handle}
            </p>
          </div>
        </div>
        <ListenerStack count={show.listenerCount} />
        <div
          className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-secondary)]"
          data-testid="station-show-metrics"
        >
          <span title="Reactions">💛 {show.reactionCount} reactions</span>
          <span title="Speakers">🎙️ {show.speakerCount}</span>
        </div>
      </Link>
      {show.tags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1" data-testid="station-show-tags">
          {show.tags.map((t) => (
            <TagChip key={t} tag={t} active={t === activeTag} />
          ))}
        </div>
      ) : null}
    </li>
  );
}

export default StationShowCard;
