// src/components/JoinedShowCard.tsx
//
// One show the signed-in user listened to or spoke on, for the account
// page. Server-renderable: no state, just a link back to the station.

import type { ReactElement } from 'react';
import { Card } from '@/components/ui';

export interface JoinedShowView {
  sessionId: string;
  role: 'listener' | 'speaker' | 'host';
  joinedAt: string;
  stageSeconds: number;
  space: {
    id: string;
    title: string;
    isLive: boolean;
    tags: string[];
    host: { handle: string; displayName: string | null; avatarUrl: string | null };
  };
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function JoinedShowCard({ show }: { show: JoinedShowView }): ReactElement {
  const hostName = show.space.host.displayName?.trim() || `@${show.space.host.handle}`;
  const roleLabel = show.role === 'listener' ? 'Listened' : 'Spoke on stage';
  return (
    <Card
      href={`/show/${encodeURIComponent(show.space.id)}`}
      interactive
      className="flex items-center gap-3"
      data-testid={`joined-show-${show.sessionId}`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-accent-800)] text-caption font-semibold text-[var(--color-accent-100)]">
        {show.space.host.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={show.space.host.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          show.space.host.handle.slice(0, 2).toUpperCase()
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-body font-semibold text-[var(--color-text)]">{show.space.title}</span>
        <span className="truncate text-caption text-[var(--color-text-secondary)]">
          {hostName} · {formatWhen(show.joinedAt)}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {show.space.isLive ? (
          <span className="rounded-full bg-[var(--color-live-muted)] px-2 py-0.5 text-caption font-medium text-[var(--color-live)]">
            On air
          </span>
        ) : null}
        <span className="text-caption text-[var(--color-text-tertiary)]" data-testid="joined-show-role">
          {roleLabel}
        </span>
      </span>
    </Card>
  );
}

export default JoinedShowCard;
