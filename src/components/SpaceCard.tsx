// src/components/SpaceCard.tsx
//
// Renders a single space tile in the listing grid.

import type { ReactElement } from 'react';
import Link from 'next/link';
import type { PublicSpace } from '@/types';

interface SpaceCardProps {
  space: PublicSpace;
}

function formatRelative(dateIso: string): string {
  const then = new Date(dateIso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateIso).toLocaleDateString();
}

interface BadgeSpec {
  label: string;
  className: string;
  title?: string;
}

function statusBadge(space: PublicSpace): BadgeSpec {
  switch (space.status) {
    case 'live':
      return {
        label: 'Live',
        className: 'bg-red-600/20 text-red-300',
      };
    case 'scheduled':
      return {
        label: 'Scheduled',
        className: 'bg-sky-700/40 text-sky-200',
        title: space.scheduledAt
          ? `Scheduled for ${new Date(space.scheduledAt).toLocaleString()}`
          : undefined,
      };
    case 'active':
      return {
        label: 'Active',
        className: 'bg-emerald-700/30 text-emerald-200',
      };
    case 'ended':
      return {
        label: 'Ended',
        className: 'bg-slate-700 text-slate-300',
      };
    case 'expired':
      return {
        label: 'Expired',
        className: 'bg-slate-800 text-slate-500',
      };
    default:
      // Backwards-compat fallback when status is missing on legacy rows.
      return space.isLive
        ? { label: 'Live', className: 'bg-red-600/20 text-red-300' }
        : { label: 'Upcoming', className: 'bg-slate-700 text-slate-300' };
  }
}

export function SpaceCard({ space }: SpaceCardProps): ReactElement {
  const badge = statusBadge(space);
  return (
    <Link
      href={`/space/${space.id}`}
      className="group flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4 transition hover:border-sky-600 hover:bg-slate-800/80"
      data-testid="space-card"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-base font-semibold text-slate-100 group-hover:text-sky-300">
          {space.title}
        </h3>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
          data-testid="status-badge"
          title={badge.title}
        >
          {badge.label}
        </span>
      </div>
      {space.description ? (
        <p className="line-clamp-2 text-sm text-slate-400">
          {space.description}
        </p>
      ) : null}
      {space.status === 'scheduled' && space.scheduledAt ? (
        <p
          className="text-xs text-sky-300"
          data-testid="scheduled-time"
        >
          Starts {new Date(space.scheduledAt).toLocaleString()}
        </p>
      ) : null}
      <div className="mt-auto flex items-center justify-between text-xs text-slate-500">
        <span>@{space.host.handle}</span>
        <span>{formatRelative(space.createdAt)}</span>
      </div>
    </Link>
  );
}

export default SpaceCard;
