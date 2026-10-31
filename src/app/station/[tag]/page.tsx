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
  tryExpireStaleSpaces,
} from '@/lib/spaces';
import { getCurrentUser } from '@/lib/session';
import { countPostsBySpace } from '@/lib/posts';
import { isValidTag, YOUTUBE_CATEGORIES } from '@/lib/tags';
import { StationShowCard } from '@/components/StationShowCard';
import { SiteHeader } from '@/components/SiteHeader';

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
        <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 p-6">
          <Link href="/stations" className="text-sm text-slate-400 hover:text-slate-200">
            &larr; Stations
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Station not found</h1>
          <p className="text-sm text-slate-400">
            &ldquo;{decoded}&rdquo; isn&apos;t a valid category.
          </p>
        </main>
      </>
    );
  }

  const user = await getCurrentUser();
  await tryExpireStaleSpaces();
  const spaces = await getSpacesForUser(user?.did ?? null);
  const shows = spaces
    .map((s) => toPublicSpace(s))
    .filter((s) => s.tags.includes(decoded));

  const postCounts = await countPostsBySpace(shows.map((s) => s.id));

  const hosts = Array.from(
    new Map(shows.map((s) => [s.host.did, s.host])).values()
  );

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 p-6">
      <Link href="/stations" className="text-sm text-slate-400 hover:text-slate-200">
        &larr; Stations
      </Link>
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{decoded}</h1>
          <span
            className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300"
            data-testid="station-count"
          >
            {shows.length} shows
          </span>
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
                  className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-slate-700 text-[10px] font-medium text-slate-200 ring-2 ring-slate-900"
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
            <span className="text-xs text-slate-500">
              {hosts.length} {hosts.length === 1 ? 'host' : 'hosts'}
            </span>
          </div>
        ) : null}
      </header>

      {shows.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-700 p-12 text-center"
          data-testid="station-empty"
        >
          <p className="text-lg text-slate-300">No shows in this station yet.</p>
          <p className="max-w-md text-sm text-slate-500">
            When a host tags a show with {decoded}, it will appear here.
          </p>
          <Link
            href="/stations/new"
            className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500"
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

      <p className="text-xs text-slate-500">
        Other stations:{' '}
        {YOUTUBE_CATEGORIES.filter((c) => c !== decoded)
          .slice(0, 8)
          .map((c) => (
            <span key={c}>
              <Link href={`/station/${encodeURIComponent(c)}`} className="text-sky-300 hover:underline">
                {c}
              </Link>
              {', '}
            </span>
          ))}
      </p>
      </main>
    </>
  );
}
