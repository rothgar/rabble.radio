import type { ReactElement } from 'react';
import type { PublicHost, PublicSpace } from '@/types';
import { Card } from '@/components/ui';

interface StationCardProps {
  tag: string;
  shows: PublicSpace[];
}

const MAX_AVATARS = 3;

function HostAvatar({ host }: { host: PublicHost }): ReactElement {
  return (
    <span
      className="relative inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-[var(--color-surface-raised)] text-[10px] font-medium text-[var(--color-text-secondary)] ring-2 ring-[var(--color-bg)]"
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
  const listening = shows.reduce((sum, s) => sum + s.listenerCount, 0);

  return (
    <Card
      href={`/station/${encodeURIComponent(tag)}`}
      interactive
      data-testid="station-card"
      data-station={tag}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-title font-semibold text-[var(--color-text)]">
            {tag}
          </h2>
          <span
            className="shrink-0 rounded-full bg-[var(--color-surface-raised)] px-2 py-0.5 text-label text-[var(--color-text-secondary)]"
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
            <span className="text-label text-[var(--color-text-tertiary)]" data-testid="station-host-more">
              +{hosts.length - MAX_AVATARS}
            </span>
          ) : null}
          {hosts.length > 0 ? (
            <span className="ml-auto text-label text-[var(--color-text-tertiary)]">
              {listening > 0 ? (
                <span data-testid="station-card-listeners">{listening} listening · </span>
              ) : null}
              {hosts.length} {hosts.length === 1 ? 'host' : 'hosts'}
            </span>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

export default StationCard;
