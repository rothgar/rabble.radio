// src/app/station/[tag]/page.tsx
//
// A single station: lists every show carrying the given category tag
// (including shows where it is a secondary tag). Shows all host profile
// pictures for the station and, for each show, the host's picture, a stacked
// listener cluster, and posts/reaction metrics. Each show's other tags link
// to their own stations.

import Link from 'next/link';
import type { ReactElement } from 'react';
import {
  getSpacesForUser,
  toPublicSpace,
} from '@/lib/spaces';
import { getCurrentUser } from '@/lib/session';
import { decoratePublicSpaces } from '@/lib/space-extras';
import { countPostsBySpace } from '@/lib/posts';
import { isValidTag, YOUTUBE_CATEGORIES } from '@/lib/tags';
import { StationShowCard } from '@/components/StationShowCard';
import { SiteHeader } from '@/components/SiteHeader';
import { PageLayout } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function StationPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}): Promise<ReactElement> {
  const { tag } = await params;
  const decoded = decodeURIComponent(tag);

  if (!isValidTag(decoded)) {
    return (
      <>
        <SiteHeader />
        <PageLayout>
          <Link
            href="/stations"
            className="inline-flex min-h-touch items-center self-start text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
          >
            &larr; Stations
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Station not found</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            &ldquo;{decoded}&rdquo; isn&apos;t a valid category.
          </p>
        </PageLayout>
      </>
    );
  }

  const user = await getCurrentUser();
  const spaces = await getSpacesForUser(user?.did ?? null);
  const shows = (
    await decoratePublicSpaces(
      spaces.map((s) => toPublicSpace(s)),
      user?.did ?? null
    )
  ).filter((s) => s.tags.includes(decoded));

  const postCounts = await countPostsBySpace(shows.map((s) => s.id));

  const hosts = Array.from(
    new Map(shows.map((s) => [s.host.did, s.host])).values()
  );
  // Live occupancy from the LiveKit sweep; includes anonymous listeners.
  const listening = shows.reduce((sum, s) => sum + s.listenerCount, 0);

  return (
    <>
      <SiteHeader />
      <PageLayout>
      <Link
        href="/stations"
        className="inline-flex min-h-touch items-center self-start text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
      >
        &larr; Stations
      </Link>
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{decoded}</h1>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className="rounded-full bg-[var(--color-surface-raised)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-secondary)]"
              data-testid="station-count"
            >
              {shows.length} shows
            </span>
            <span
              className="rounded-full bg-[var(--color-live-muted)] px-2 py-0.5 text-xs font-medium text-[var(--color-live)]"
              data-testid="station-listeners"
              title="Everyone listening right now, including people without an account"
            >
              {listening} listening
            </span>
          </div>
        </div>
        {hosts.length > 0 ? (
          <div
            className="flex items-center gap-2"
            data-testid="station-hosts"
          >
            <div className="flex -space-x-2">
              {hosts.map((h) => (
                <span
                  key={h.did}
                  className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-[var(--color-surface-raised)] text-[10px] font-medium text-[var(--color-text)] ring-2 ring-[var(--color-bg)]"
                  data-testid="station-host-avatar"
                  title={`@${h.handle}`}
                >
                  {h.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={h.avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span>{h.handle.slice(0, 2).toUpperCase()}</span>
                  )}
                </span>
              ))}
            </div>
            <span className="text-xs text-[var(--color-text-tertiary)]">
              {hosts.length} {hosts.length === 1 ? 'host' : 'hosts'}
            </span>
          </div>
        ) : null}
      </header>

      {shows.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--color-border-strong)] p-12 text-center"
          data-testid="station-empty"
        >
          <p className="text-lg text-[var(--color-text)]">No shows in this station yet.</p>
          <p className="max-w-md text-sm text-[var(--color-text-tertiary)]">
            When a host tags a show with {decoded}, it will appear here.
          </p>
          <Link
            href="/stations/new"
            className="inline-flex min-h-touch items-center rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--color-accent-900)] hover:bg-[var(--color-accent-400)]"
          >
            Create a show
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="station-shows">
          {shows.map((show) => (
            <StationShowCard
              key={show.id}
              show={show}
              postCount={postCounts[show.id] ?? 0}
              activeTag={decoded}
            />
          ))}
        </ul>
      )}

      <p className="text-xs text-[var(--color-text-tertiary)]">
        Other stations:{' '}
        {YOUTUBE_CATEGORIES.filter((c) => c !== decoded)
          .slice(0, 8)
          .map((c) => (
            <span key={c}>
              <Link
                href={`/station/${encodeURIComponent(c)}`}
                className="text-[var(--color-accent-300)] hover:underline"
              >
                {c}
              </Link>
              {', '}
            </span>
          ))}
      </p>
      </PageLayout>
    </>
  );
}
