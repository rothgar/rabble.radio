'use client';

import type { ReactElement } from 'react';
import { ShareButtons } from '@/components/ShareButtons';

export interface RoomHeaderHost {
  handle: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export interface RoomHeaderProps {
  title: string;
  host: RoomHeaderHost;
  listenerCount: number;
  shareableUrl: string;
}

function initialsFor(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '??';
  return trimmed.slice(0, 2).toUpperCase();
}

export function RoomHeader({
  title,
  host,
  listenerCount,
  shareableUrl,
}: RoomHeaderProps): ReactElement {
  return (
    <header
      className="flex flex-col gap-4"
      data-testid="room-header"
    >
      <div className="flex items-center gap-3">
        <span
          data-testid="live-tag"
          className="inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-red-300"
        >
          <span
            aria-hidden
            className="h-2 w-2 rounded-full bg-red-400"
            style={{ animation: 'pulse-live 1.6s ease-in-out infinite' }}
          />
          Live
        </span>
      </div>

      <h1
        className="text-[42px] font-medium leading-tight tracking-tight text-[var(--color-text)]"
        style={{ fontFamily: 'var(--font-heading)' }}
        data-testid="room-title"
      >
        {title}
      </h1>

      <div className="flex items-center gap-2 text-sm text-[var(--color-neutral-400)]">
        {host.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={host.avatarUrl}
            alt=""
            className="h-[26px] w-[26px] rounded-full object-cover"
          />
        ) : (
          <span
            className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[var(--color-accent-700)] text-[10px] font-medium text-[var(--color-accent-100)]"
            aria-hidden
          >
            {initialsFor(host.displayName || host.handle)}
          </span>
        )}
        <span className="text-[var(--color-text)]">
          Hosted by{' '}
          <a
            href={`https://bsky.app/profile/${encodeURIComponent(host.handle)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-accent-300)] hover:underline"
          >
            @{host.handle}
          </a>
        </span>
        <span aria-hidden className="text-[var(--color-neutral-600)]">·</span>
        <span data-testid="room-listener-count">
          {listenerCount} listening
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2" data-testid="room-share-row">
        <ShareButtons shareableUrl={shareableUrl} title={title} />
      </div>
    </header>
  );
}

export default RoomHeader;
