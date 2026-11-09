// src/app/page.tsx
//
// The home page. Signed out: a short pitch, "Sign in with Bluesky", a
// "Start a show" that routes through login, and a clear "just listen, no
// account needed" path. Everyone: shows ranked by what is happening now
// (on air, biggest rooms first), then popular shows and hosts, then the
// stations index. Signed in: a "For you" section first, built from the
// viewer's Bluesky follows (hosts they follow, and rooms their follows
// are in right now).

import { Suspense, type ReactElement } from 'react';
import Link from 'next/link';
import { getSpacesForUser, toPublicSpace } from '@/lib/spaces';
import { getCurrentUser } from '@/lib/session';
import { decoratePublicSpaces } from '@/lib/space-extras';
import { buildHomeSections } from '@/lib/home';
import { getTopHosts, type TopHost } from '@/lib/hosts';
import { primaryTagOf, YOUTUBE_CATEGORIES } from '@/lib/tags';
import { SiteHeader } from '@/components/SiteHeader';
import { StartShowButton } from '@/components/StartShowButton';
import { ShowListCard } from '@/components/ShowListCard';
import { Button, PageLayout } from '@/components/ui';

export const dynamic = 'force-dynamic';

function SectionHeading({ title, hint, href, hrefLabel }: { title: string; hint?: string; href?: string; hrefLabel?: string }): ReactElement {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h2 className="text-title font-semibold tracking-tight">{title}</h2>
        {hint ? <p className="text-caption text-[var(--color-text-secondary)]">{hint}</p> : null}
      </div>
      {href ? (
        <Link href={href} className="text-label text-[var(--color-accent)] hover:underline">
          {hrefLabel ?? 'See all'}
        </Link>
      ) : null}
    </div>
  );
}

function HostStrip({ hosts }: { hosts: TopHost[] }): ReactElement {
  return (
    <ul className="flex gap-3 overflow-x-auto pb-1" data-testid="home-hosts">
      {hosts.map((h) => {
        const name = h.host.displayName?.trim() || `@${h.host.handle}`;
        return (
          <li key={h.host.did} className="shrink-0">
            <Link
              href={`/podcast/${encodeURIComponent(h.host.handle)}`}
              className="flex w-28 flex-col items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-center hover:border-[var(--color-accent)]"
              data-testid={`home-host-${h.host.handle}`}
            >
              <span className="inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-[var(--color-highlight-muted)] text-sm font-semibold ring-1 ring-[var(--color-border-strong)]">
                {h.host.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={h.host.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  name.replace(/^@/, '').slice(0, 2).toUpperCase()
                )}
              </span>
              <span className="w-full truncate text-caption font-semibold text-[var(--color-text)]">{name}</span>
              <span className="w-full truncate text-[10px] text-[var(--color-text-tertiary)]">@{h.host.handle}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Placeholder streamed first: the header and pitch are real, the show rows
 * are grey bars. Replaced in place once `HomeBody` resolves.
 */
export function HomeSkeleton(): ReactElement {
  const bar = 'animate-pulse rounded-lg bg-[var(--color-surface)]';
  return (
    <div className="flex flex-col gap-8" data-testid="home-skeleton" aria-busy="true" aria-live="polite">
      <header className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6">
        <h1 className="text-display font-bold tracking-tight">Live audio shows for Bluesky</h1>
        <p className="max-w-prose text-body text-[var(--color-text-secondary)]">
          Listen to anyone on air right now, no account needed. Finding what&apos;s on…
        </p>
        <div className="flex gap-3">
          <span className={`${bar} h-11 w-36`} />
          <span className={`${bar} h-11 w-44`} />
        </div>
      </header>
      <section className="flex flex-col gap-3">
        <h2 className="text-title font-semibold tracking-tight">On air now</h2>
        <span className={`${bar} h-20 w-full`} />
        <span className={`${bar} h-20 w-full`} />
        <span className={`${bar} h-20 w-full`} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-title font-semibold tracking-tight">Popular shows</h2>
        <span className={`${bar} h-20 w-full`} />
        <span className={`${bar} h-20 w-full`} />
      </section>
    </div>
  );
}

/**
 * The page shell streams immediately; the data-dependent body renders
 * inside Suspense so a slow lookup (a cold Bluesky follows fetch, say)
 * never leaves the visitor on a blank page.
 */
export default function HomePage(): ReactElement {
  return (
    <>
      <SiteHeader />
      <PageLayout>
        <Suspense fallback={<HomeSkeleton />}>
          <HomeBody />
        </Suspense>
      </PageLayout>
    </>
  );
}

export async function HomeBody(): Promise<ReactElement> {
  const user = await getCurrentUser();
  const [rows, hosts] = await Promise.all([
    getSpacesForUser(user?.did ?? null),
    getTopHosts(8).catch(() => [] as TopHost[]),
  ]);
  const shows = await decoratePublicSpaces(rows.map((s) => toPublicSpace(s)), user?.did ?? null);
  const { forYou, onAir, popular } = buildHomeSections(shows);
  const stations = YOUTUBE_CATEGORIES.filter((tag) => shows.some((s) => primaryTagOf(s.tags) === tag));
  const firstLive = onAir[0] ?? null;

  return (
    <>
        {user ? (
          <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between" data-testid="home-signed-in">
            <div>
              <h1 className="text-display font-bold tracking-tight">Shows</h1>
              <p className="mt-1 text-label text-[var(--color-text-secondary)]">
                Live audio from people on Bluesky. Tap Listen to join a room.
              </p>
            </div>
            <StartShowButton size="lg" />
          </header>
        ) : (
          <header
            className="flex flex-col gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6"
            data-testid="home-signed-out"
          >
            <div>
              <h1 className="text-display font-bold tracking-tight">Live audio shows for Bluesky</h1>
              <p className="mt-2 max-w-prose text-body text-[var(--color-text-secondary)]">
                Listen to anyone on air right now, no account needed. Sign in with Bluesky to react, take the stage,
                get notified about shows, or host your own.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {firstLive ? (
                <Button href={`/show/${encodeURIComponent(firstLive.id)}?listen=1`} size="lg" data-testid="home-listen-now">
                  Listen now · {firstLive.title}
                </Button>
              ) : null}
              <Button href="/login?next=%2F" size="lg" variant={firstLive ? 'secondary' : 'primary'} data-testid="home-signin">
                Sign in with Bluesky
              </Button>
              <Button href="/login?next=%2Fme" size="lg" variant="ghost" data-testid="home-start-show">
                Start a show
              </Button>
              <Button href="/downloads" size="lg" variant="ghost" data-testid="home-get-app">
                Get the app
              </Button>
            </div>
            <p className="text-caption text-[var(--color-text-tertiary)]">
              Starting a show needs a Bluesky account. Listening never does.
            </p>
          </header>
        )}

        {user && forYou.length > 0 ? (
          <section className="flex flex-col gap-3" data-testid="home-for-you">
            <SectionHeading title="For you" hint="Hosts you follow on Bluesky, and rooms your follows are in right now." />
            <div className="flex flex-col gap-2">
              {forYou.map((s) => (
                <ShowListCard key={s.id} space={s} />
              ))}
            </div>
          </section>
        ) : null}

        <section className="flex flex-col gap-3" data-testid="home-on-air">
          <SectionHeading title="On air now" hint="Biggest rooms first. One tap to listen." />
          {onAir.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--color-border-strong)] p-5 text-body text-[var(--color-text-secondary)]" data-testid="home-on-air-empty">
              Nobody is on air at the moment. {user ? 'Start a show and be the first.' : 'Sign in to start one.'}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {onAir.map((s, i) => (
                <ShowListCard key={s.id} space={s} rank={i + 1} />
              ))}
            </div>
          )}
        </section>

        {popular.length > 0 ? (
          <section className="flex flex-col gap-3" data-testid="home-popular">
            <SectionHeading title="Popular shows" hint="Replays, upcoming shows and studios, by all-time engagement." />
            <div className="flex flex-col gap-2">
              {popular.map((s) => (
                <ShowListCard key={s.id} space={s} />
              ))}
            </div>
          </section>
        ) : null}

        {hosts.length > 0 ? (
          <section className="flex flex-col gap-3">
            <SectionHeading title="Popular hosts" href="/hosts" hrefLabel="All hosts" />
            <HostStrip hosts={hosts} />
          </section>
        ) : null}

        {stations.length > 0 ? (
          <section className="flex flex-col gap-3" data-testid="home-stations">
            <SectionHeading title="Stations" hint="Browse shows by topic." href="/stations" hrefLabel="All stations" />
            <ul className="flex flex-wrap gap-2">
              {stations.map((tag) => (
                <li key={tag}>
                  <Link
                    href={`/station/${encodeURIComponent(tag)}`}
                    className="inline-flex min-h-touch items-center rounded-full border border-[var(--color-border-strong)] px-3 text-label text-[var(--color-text)] hover:bg-[var(--color-surface-raised)]"
                  >
                    {tag}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
    </>
  );
}
