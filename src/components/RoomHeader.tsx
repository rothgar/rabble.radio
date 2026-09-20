'use client';

import type { ReactElement } from 'react';

export interface RoomHeaderHost {
  handle: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export interface RoomHeaderProps {
  title: string;
  /** Kept for call-site compatibility; the host is shown on-stage instead. */
  host: RoomHeaderHost;
  listenerCount: number;
}

export function RoomHeader({
  title,
  listenerCount,
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
        className="text-2xl font-medium leading-tight tracking-tight text-[var(--color-text)] sm:text-3xl md:text-[42px]"
        style={{ fontFamily: 'var(--font-heading)' }}
        data-testid="room-title"
      >
        {title}
      </h1>

      <div
        className="flex items-center gap-2 text-sm text-[var(--color-neutral-400)]"
        data-testid="room-listener-count"
      >
        {listenerCount} listening
      </div>
    </header>
  );
}

export default RoomHeader;
