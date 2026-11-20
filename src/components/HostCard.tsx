// src/components/HostCard.tsx
//
// Renders a single ranked host on the /hosts page: profile, Bluesky link,
// popularity, and any upcoming scheduled spaces with calendar options.

import type { ReactElement } from 'react';
import Link from 'next/link';
import { defaultPublicOrigin } from '@/lib/spaces';
import type { TopHost } from '@/lib/hosts';
import { AddToCalendar } from '@/components/AddToCalendar';
import { FollowHostButton } from '@/components/FollowHostButton';

interface HostCardProps {
  host: TopHost;
  rank: number;
  isAuthenticated: boolean;
  following: boolean;
}

function initialsFor(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '??';
  return trimmed.slice(0, 2).toUpperCase();
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function HostCard({ host, rank, isAuthenticated, following }: HostCardProps): ReactElement {
  const profileUrl = `https://bsky.app/profile/${encodeURIComponent(host.host.handle)}`;
  const origin = defaultPublicOrigin();
  const name = host.host.displayName?.trim() || host.host.handle;

  return (
    <article
      className="flex flex-col gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
      data-testid="host-card"
      data-rank={rank}
    >
      <div className="flex items-center gap-3">
        <span
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-raised)] text-sm font-bold text-[var(--color-text-tertiary)]"
          data-testid="host-rank"
        >
          {rank}
        </span>
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-[var(--color-surface-raised)] ring-1 ring-[var(--color-border)]">
          {host.host.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={host.host.avatarUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-sm font-medium text-[var(--color-text-secondary)]">
              {initialsFor(name)}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--color-text)]">
            {name}
          </p>
          <p className="truncate text-xs text-[var(--color-text-secondary)]">@{host.host.handle}</p>
        </div>
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-ink-muted)]"
          data-testid="host-profile-link"
        >
          View on Bluesky
        </a>
      </div>

      <div className="flex items-center gap-3 text-xs text-[var(--color-text-secondary)]" data-testid="host-popularity">
        <span title="On-air audience">👂 {host.popularity}</span>
      </div>

      <FollowHostButton
        hostDid={host.host.did}
        hostName={name}
        isAuthenticated={isAuthenticated}
        following={following}
        size="sm"
        loginNext="/hosts"
      />

      {host.upcoming.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
            Upcoming · {host.upcoming.length}
          </p>
          {host.upcoming.map((space) => {
            const scheduledAt = space.scheduledAt
              ? space.scheduledAt.toISOString()
              : '';
            return (
              <div
                key={space.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
                data-testid="upcoming-space"
              >
                <div className="min-w-0">
                  <Link
                    href={`/show/${space.id}`}
                    className="block truncate text-sm font-medium text-[var(--color-text)] hover:text-[var(--color-accent)]"
                    data-testid="upcoming-space-link"
                  >
                    {space.title}
                  </Link>
                  <span className="text-xs text-[var(--color-accent)]" data-testid="upcoming-space-time">
                    {formatWhen(scheduledAt)}
                  </span>
                </div>
                <AddToCalendar
                  spaceId={space.id}
                  title={space.title}
                  description={space.description}
                  scheduledAt={scheduledAt}
                  url={`${origin}/show/${space.id}`}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-[var(--color-text-tertiary)]" data-testid="host-no-upcoming">
          No upcoming scheduled spaces.
        </p>
      )}
    </article>
  );
}

export default HostCard;
