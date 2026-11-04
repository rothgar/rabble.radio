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
  /** True while the host is broadcasting; false in the pre-show green room. */
  onAir?: boolean;
}

export function RoomHeader({
  title,
  listenerCount,
  onAir = true,
}: RoomHeaderProps): ReactElement {
  return (
    <header
      className="flex flex-col gap-4"
      data-testid="room-header"
      data-on-air={onAir ? 'true' : 'false'}
    >
      <div className="flex items-center gap-3">
        {onAir ? (
          <span
            data-testid="live-tag"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-live-border)] bg-[var(--color-live-muted)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-live)]"
          >
            <span
              aria-hidden
              className="h-2 w-2 rounded-full bg-[var(--color-live)]"
              style={{ animation: 'pulse-live 1.6s ease-in-out infinite' }}
            />
            On air
          </span>
        ) : (
          <span
            data-testid="live-tag"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]"
          >
            <span aria-hidden className="h-2 w-2 rounded-full bg-[var(--color-text-tertiary)]" />
            Off air
          </span>
        )}
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
