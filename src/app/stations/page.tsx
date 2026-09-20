import Link from 'next/link';
import type { ReactElement } from 'react';
import {
  getSpacesForUser,
  toPublicSpace,
  tryExpireStaleSpaces,
} from '@/lib/spaces';
import { getCurrentUser } from '@/lib/session';
import {
  CATEGORY_PROMPTS,
  primaryTagOf,
  YOUTUBE_CATEGORIES,
} from '@/lib/tags';
import { StationCard } from '@/components/StationCard';
import { StationSuggestionCard } from '@/components/StationSuggestionCard';
import { SiteHeader } from '@/components/SiteHeader';

export const dynamic = 'force-dynamic';

/** Number of empty-station suggestion cards to show. */
const SUGGESTION_COUNT = 2;

export default async function HomePage(): Promise<ReactElement> {
  const user = await getCurrentUser();
  await tryExpireStaleSpaces();
  const spaces = await getSpacesForUser(user?.did ?? null);
  const shows = spaces.map((s) => toPublicSpace(s));

  // Deduplicate: each show belongs to exactly one station (its primary tag)
  // so it is not shown twice on the home page.
  const byStation = new Map<string, typeof shows>();
  for (const show of shows) {
    const primary = primaryTagOf(show.tags);
    if (!primary) continue;
    const list = byStation.get(primary) ?? [];
    list.push(show);
    byStation.set(primary, list);
  }
  const stations = YOUTUBE_CATEGORIES.filter((tag) => byStation.has(tag));

  // Suggest a couple of empty categories to encourage people to start shows.
  const suggestions = YOUTUBE_CATEGORIES.filter(
    (tag) => !byStation.has(tag) && CATEGORY_PROMPTS[tag]
  ).slice(0, SUGGESTION_COUNT);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:gap-8 sm:p-6">

        <header>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Stations</h1>
          <p className="mt-1 text-sm text-slate-400">Live and upcoming shows by category.</p>
        </header>

      {stations.length === 0 && suggestions.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-700 p-8 text-center sm:p-12"
          data-testid="home-empty"
        >
          <p className="text-lg text-slate-300">No stations yet.</p>
          <p className="max-w-md text-sm text-slate-500">
            Stations fill up as hosts tag their shows with categories. Create a
            show and pick up to 3 tags to get it listed here.
          </p>
          <Link
            href="/stations/new"
            className="rounded-lg bg-sky-600 px-5 py-3 text-sm font-semibold text-white hover:bg-sky-500"
            data-testid="create-show-link"
          >
            Create a show
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-6" data-testid="station-list">
          <div className="flex flex-col gap-3" data-testid="station-grid">
            {stations.map((tag) => (
              <StationCard key={tag} tag={tag} shows={byStation.get(tag)!} />
            ))}
          </div>
          {suggestions.length > 0 ? (
            <div className="flex flex-col gap-3" data-testid="station-suggestions">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Start a new station
              </p>
              <div className="flex flex-col gap-3">
                {suggestions.map((tag) => (
                  <StationSuggestionCard
                    key={tag}
                    tag={tag}
                    prompt={CATEGORY_PROMPTS[tag]}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
      </main>
    </>
  );
}
