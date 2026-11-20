// src/components/ShowListCard.tsx
//
// A show row for the home page with a one-tap action: Listen for on-air
// shows (anonymous listening is allowed, so no sign-in gate), Replay for
// finished shows with a recording, Notify me for scheduled ones. Shows
// social context for signed-in viewers: "you follow the host" and who they
// follow is in the room.

import type { ReactElement } from 'react';
import Link from 'next/link';
import type { PublicSpace } from '@/types';
import { TagChip } from '@/components/TagChip';

export interface ShowListCardProps {
  space: PublicSpace;
  rank?: number;
}

function initials(name: string): string {
  return (name || '?').trim().replace(/^@/, '').slice(0, 2).toUpperCase();
}

function Avatar({ name, url, size = 40 }: { name: string; url: string | null; size?: number }): ReactElement {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-highlight-muted)] text-xs font-semibold text-[var(--color-text)] ring-1 ring-[var(--color-border-strong)]"
      style={{ width: size, height: size }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

export function actionFor(space: PublicSpace): { label: string; href: string; kind: 'listen' | 'replay' | 'notify' | 'open' } {
  const base = `/show/${encodeURIComponent(space.id)}`;
  if (space.isLive) return { label: 'Listen', href: `${base}?listen=1`, kind: 'listen' };
  if (space.replay) return { label: 'Replay', href: base, kind: 'replay' };
  // Scheduled or simply off air: nothing to listen to yet, so offer a reminder.
  return { label: space.reminded ? 'Notifying you' : 'Notify me', href: base, kind: 'notify' };
}

export function ShowListCard({ space, rank }: ShowListCardProps): ReactElement {
  const hostName = space.host.displayName?.trim() || `@${space.host.handle}`;
  const action = actionFor(space);
  const inRoom = space.followedInRoom ?? [];
  const actionClass =
    action.kind === 'listen'
      ? 'bg-[var(--color-live)] text-white hover:opacity-90'
      : action.kind === 'replay'
        ? 'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]'
        : 'border border-[var(--color-border-strong)] text-[var(--color-text)] hover:bg-[var(--color-surface-raised)]';

  return (
    <article
      className={`flex items-center gap-3 rounded-lg border p-3 sm:p-4 ${
        space.isLive
          ? 'border-[var(--color-live-border)] bg-[var(--color-live-muted)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface)]'
      }`}
      data-testid={`show-list-card-${space.id}`}
      data-kind={action.kind}
    >
      {typeof rank === 'number' ? (
        <span className="w-5 shrink-0 text-center text-caption text-[var(--color-text-tertiary)]" aria-hidden>
          {rank}
        </span>
      ) : null}
      <Avatar name={hostName} url={space.host.avatarUrl} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/show/${encodeURIComponent(space.id)}`}
            className="truncate text-body font-semibold text-[var(--color-text)] hover:underline"
            data-testid="show-list-title"
          >
            {space.title}
          </Link>
          {space.isLive ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-live-muted)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--color-live)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-live)]" aria-hidden /> On air
            </span>
          ) : space.replay ? (
            <span className="rounded-full bg-[var(--color-highlight-muted)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--color-accent)]">
              Replay
            </span>
          ) : space.status === 'scheduled' ? (
            <span className="rounded-full bg-[var(--color-surface-raised)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
              Scheduled
            </span>
          ) : null}
          {space.hostFollowed ? (
            <span
              className="rounded-full bg-[var(--color-surface-raised)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-text-secondary)]"
              data-testid="show-list-following"
            >
              You follow the host
            </span>
          ) : null}
        </div>
        <p className="truncate text-caption text-[var(--color-text-secondary)]">
          {hostName}
          {space.isLive
            ? ` · ${space.tunedInCount} tuned in · ${space.speakerCount} on stage`
            : space.status === 'scheduled' && space.scheduledAt
              ? ` · starts ${new Date(space.scheduledAt).toLocaleString()}`
              : space.totalListeners > 0
                ? ` · ${space.totalListeners} listeners all time`
                : ''}
        </p>
        {space.isLive && (space.tags.length > 0 || space.reactionCount > 0) ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5" data-testid="show-list-live-meta">
            {space.reactionCount > 0 ? (
              <span className="text-caption text-[var(--color-text-secondary)]" title="Reactions">
                💛 {space.reactionCount} reaction{space.reactionCount === 1 ? '' : 's'}
              </span>
            ) : null}
            {space.tags.map((t) => (
              <TagChip key={t} tag={t} />
            ))}
          </div>
        ) : null}
        {inRoom.length > 0 ? (
          <p className="mt-1 flex items-center gap-1 text-caption text-[var(--color-accent)]" data-testid="show-list-in-room">
            <span className="flex -space-x-1">
              {inRoom.slice(0, 3).map((p) => (
                <Avatar key={p.did} name={p.displayName ?? p.handle} url={p.avatarUrl} size={18} />
              ))}
            </span>
            <span className="truncate">
              {inRoom.length === 1
                ? `${inRoom[0].displayName ?? '@' + inRoom[0].handle} is in the room`
                : `${inRoom[0].displayName ?? '@' + inRoom[0].handle} and ${inRoom.length - 1} more you follow are in the room`}
            </span>
          </p>
        ) : null}
      </div>
      <Link
        href={action.href}
        className={`inline-flex min-h-touch shrink-0 items-center justify-center rounded-[var(--radius-md)] px-4 text-sm font-semibold ${actionClass}`}
        data-testid="show-list-action"
      >
        {action.label}
      </Link>
    </article>
  );
}

export default ShowListCard;
