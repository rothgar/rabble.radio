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
import { Button, PageLayout } from '@/components/ui';

export const dynamic = 'force-dynamic';

const SUGGESTION_COUNT = 2;

export default async function StationsPage(): Promise<ReactElement> {
  const user = await getCurrentUser();
  await tryExpireStaleSpaces();
  const spaces = await getSpacesForUser(user?.did ?? null);
  const shows = spaces.map((s) => toPublicSpace(s));

  const byStation = new Map<string, typeof shows>();
  for (const show of shows) {
    const primary = primaryTagOf(show.tags);
    if (!primary) continue;
    const list = byStation.get(primary) ?? [];
    list.push(show);
    byStation.set(primary, list);
  }
  const stations = YOUTUBE_CATEGORIES.filter((tag) => byStation.has(tag));

  const suggestions = YOUTUBE_CATEGORIES.filter(
    (tag) => !byStation.has(tag) && CATEGORY_PROMPTS[tag]
  ).slice(0, SUGGESTION_COUNT);

  return (
    <>
      <SiteHeader />
      <PageLayout>
        <header>
          <h1 className="text-display font-bold tracking-tight">Stations</h1>
          <p className="mt-1 text-label text-[var(--color-text-secondary)]">
            Live and upcoming shows by category.
          </p>
        </header>

        {stations.length === 0 && suggestions.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-[var(--color-border-strong)] p-8 text-center"
            data-testid="home-empty"
          >
            <p className="text-title text-[var(--color-text)]">No stations yet.</p>
            <p className="max-w-sm text-body text-[var(--color-text-secondary)]">
              Stations fill up as hosts tag their shows. Create a show and pick
              up to 3 tags to get listed here.
            </p>
            <Button href="/stations/new" size="lg" data-testid="create-show-link">
              Create a show
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-8" data-testid="station-list">
            <div className="flex flex-col gap-3" data-testid="station-grid">
              {stations.map((tag) => (
                <StationCard key={tag} tag={tag} shows={byStation.get(tag)!} />
              ))}
            </div>

            {suggestions.length > 0 && (
              <div className="flex flex-col gap-3" data-testid="station-suggestions">
                <p className="text-label font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
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
            )}
          </div>
        )}
      </PageLayout>
    </>
  );
}
