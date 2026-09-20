// src/components/StationCard.tsx
//
// A compact station tile on the /stations home page. Half-page width (stacked
// on mobile). Shows the category name, a show count, and the profile images of
// the hosts whose shows are in this station. The whole tile links to the
// station's detail page.

import Link from 'next/link';
import type { ReactElement } from 'react';
import type { PublicHost, PublicSpace } from '@/types';

interface StationCardProps {
  tag: string;
  shows: PublicSpace[];
}

/** Maximum host avatars to render before collapsing into "+N". */
const MAX_AVATARS = 3;

function HostAvatar({ host }: { host: PublicHost }): ReactElement {
  return (
    <span
      className="relative inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-slate-700 text-[10px] font-medium text-slate-200 ring-2 ring-slate-900"
      data-testid="station-host-avatar"
      title={`@${host.handle}`}
    >
      {host.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={host.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span>{host.handle.slice(0, 2).toUpperCase()}</span>
      )}
    </span>
  );
}

export function StationCard({ tag, shows }: StationCardProps): ReactElement {
  const count = shows.length;
  const hosts = Array.from(
    new Map(shows.map((s) => [s.host.did, s.host])).values()
  );

  return (
    <Link
      href={`/station/${encodeURIComponent(tag)}`}
      className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 p-5 transition hover:border-sky-600 hover:bg-slate-800/80 active:bg-slate-800"
      data-testid="station-card"
      data-station={tag}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="truncate text-base font-semibold text-slate-100">
          {tag}
        </h2>
        <span
          className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300"
          data-testid="station-count"
        >
          {count} {count === 1 ? 'show' : 'shows'}
        </span>
      </div>
      <div className="flex items-center gap-2" data-testid="station-hosts">
        <div className="flex -space-x-2">
          {hosts.slice(0, MAX_AVATARS).map((host) => (
            <HostAvatar key={host.did} host={host} />
          ))}
        </div>
        {hosts.length > MAX_AVATARS ? (
          <span
            className="text-xs text-slate-400"
            data-testid="station-host-more"
          >
            +{hosts.length - MAX_AVATARS}
          </span>
        ) : null}
        {hosts.length > 0 ? (
          <span className="ml-auto text-xs text-slate-500">
            {hosts.length} {hosts.length === 1 ? 'host' : 'hosts'}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export default StationCard;
