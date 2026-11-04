// src/app/me/page.tsx
//
// The signed-in user's page: start a show, manage the stations they host
// (publish recordings to their podcast feed), and revisit shows they joined.

import { redirect } from 'next/navigation';
import type { ReactElement } from 'react';
import { getCurrentUser } from '@/lib/session';
import { getUserByDid } from '@/lib/users';
import { defaultPublicOrigin, getHostedSpaces, toPublicSpace } from '@/lib/spaces';
import { getJoinedShows } from '@/lib/metrics';
import { getRecordingsForHost, toPublicRecording } from '@/lib/recording';
import { SiteHeader } from '@/components/SiteHeader';
import { StartShowButton } from '@/components/StartShowButton';
import { HostedShowCard, type HostedRecording } from '@/components/HostedShowCard';
import { JoinedShowCard, type JoinedShowView } from '@/components/JoinedShowCard';
import { PageLayout } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function MePage(): Promise<ReactElement> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent('/me')}`);
  }

  const [profile, hostedRows, joinedRows, recordingRows] = await Promise.all([
    getUserByDid(user.did),
    getHostedSpaces(user.did),
    getJoinedShows(user.did),
    getRecordingsForHost(user.did),
  ]);

  const origin = defaultPublicOrigin();
  const hosted = hostedRows.map((s) => toPublicSpace(s, origin));
  const recordingsBySpace = new Map<string, HostedRecording[]>();
  for (const row of recordingRows) {
    const pub = toPublicRecording(row);
    const list = recordingsBySpace.get(row.spaceId) ?? [];
    list.push({
      id: pub.id,
      status: pub.status,
      startedAt: pub.startedAt,
      endedAt: pub.endedAt,
      sizeBytes: pub.sizeBytes,
      published: pub.published,
      publishedAt: pub.publishedAt,
    });
    recordingsBySpace.set(row.spaceId, list);
  }
  const joined: JoinedShowView[] = joinedRows.map((j) => ({
    sessionId: j.sessionId,
    role: j.role,
    joinedAt: j.joinedAt.toISOString(),
    stageSeconds: j.stageSeconds,
    space: {
      id: j.space.id,
      title: j.space.title,
      isLive: j.space.isLive,
      tags: j.space.tags,
      host: j.space.host,
    },
  }));

  const handle = profile?.handle ?? user.handle;
  const name = profile?.displayName?.trim() || `@${handle}`;
  const feedUrl = `${origin}/podcast/${encodeURIComponent(handle)}/feed.xml`;
  const publishedCount = recordingRows.filter((r) => r.published).length;

  return (
    <>
      <SiteHeader />
      <PageLayout>
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" data-testid="me-header">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-accent-800)] text-label font-semibold text-[var(--color-accent-100)]">
              {profile?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                handle.slice(0, 2).toUpperCase()
              )}
            </span>
            <div className="flex min-w-0 flex-col">
              <h1 className="truncate text-heading font-bold tracking-tight">{name}</h1>
              <p className="truncate text-label text-[var(--color-text-secondary)]">@{handle}</p>
            </div>
          </div>
          <StartShowButton size="lg" />
        </header>

        <section className="flex flex-col gap-3" data-testid="me-hosted">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-title font-semibold">Shows you host</h2>
            <span className="text-caption text-[var(--color-text-tertiary)]">{hosted.length}</span>
          </div>
          <div
            className="flex flex-col gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            data-testid="me-podcast-feed"
          >
            <p className="text-label font-semibold text-[var(--color-text)]">Your podcast feed</p>
            <p className="text-caption text-[var(--color-text-secondary)]">
              Published recordings appear here as episodes. Add this URL to any podcast app.
              {publishedCount > 0 ? ` ${publishedCount} published.` : ' Nothing published yet.'}
            </p>
            <a
              href={feedUrl}
              className="break-all text-caption text-[var(--color-accent-300)] hover:underline"
              data-testid="me-podcast-feed-url"
            >
              {feedUrl}
            </a>
          </div>
          {hosted.length === 0 ? (
            <div
              className="flex flex-col items-center gap-3 rounded-md border border-dashed border-[var(--color-border-strong)] p-8 text-center"
              data-testid="me-hosted-empty"
            >
              <p className="text-body text-[var(--color-text-secondary)]">
                You haven&apos;t hosted a show yet. Start one and invite people in.
              </p>
              <StartShowButton size="md" />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {hosted.map((space) => (
                <HostedShowCard
                  key={space.id}
                  space={space}
                  recordings={recordingsBySpace.get(space.id) ?? []}
                />
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3" data-testid="me-joined">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-title font-semibold">Shows you joined</h2>
            <span className="text-caption text-[var(--color-text-tertiary)]">{joined.length}</span>
          </div>
          {joined.length === 0 ? (
            <p
              className="rounded-md border border-dashed border-[var(--color-border-strong)] p-6 text-center text-body text-[var(--color-text-secondary)]"
              data-testid="me-joined-empty"
            >
              Shows you listen to or speak on will show up here.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {joined.map((show) => (
                <JoinedShowCard key={show.sessionId} show={show} />
              ))}
            </div>
          )}
        </section>
      </PageLayout>
    </>
  );
}
