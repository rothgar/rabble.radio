// src/app/space/[id]/page.tsx
//
// Detail page for a single space. Shows space metadata + shareable URL and
// provides a "Join Space" button. Once the user joins, mounts the LiveKit
// room client with the returned token.
//
// IMPORTANT: This page is a client component on purpose. The previous
// implementation was a server component that fetched internal API routes,
// but Next.js 15 was bundling the generated Prisma client into the page's
// shared server chunk, which crashed at runtime with:
//   TypeError: Cannot read properties of undefined (reading '_createPrismaPromise')
// By moving the data fetching into a `useEffect`, the page never imports
// any module that touches Prisma. API routes remain Prisma users; the page
// is Prisma-free and renders purely in the browser.
//
// NOTE: this page is mounted at the singular `/space/[id]` route (not
// `/spaces/[id]`) so its server chunk does not get grouped with the
// Prisma-using API routes under `/api/spaces/[id]/...`. See the PR
// description for details.

'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { SpacePageClient } from '@/components/SpacePageClient';
import { ShareButtons } from '@/components/ShareButtons';
import { SiteHeader } from '@/components/SiteHeader';
import { Footer } from '@/components/Footer';
import { PageLayout } from '@/components/ui';
import type { PublicSpace, PublicUser } from '@/types';

/**
 * Mirror of `PublicRecording` returned by
 * `GET /api/spaces/[id]/recording`. Defined locally so this page module
 * has no dependency on `@/lib/recording` (which transitively imports
 * Prisma). Field shape is intentionally identical to the API response.
 */
interface PublicRecording {
  id: string;
  spaceId: string;
  status: 'starting' | 'available' | 'failed' | 'expired';
  startedAt: string;
  endedAt: string | null;
  expiresAt: string;
  sizeBytes: number | null;
  downloadUrl: string | null;
  contentType: string;
}

interface StatusBadgeSpec {
  label: string;
  className: string;
}

function statusBadge(view: {
  status: string;
  isLive: boolean;
}): StatusBadgeSpec {
  switch (view.status) {
    case 'live':
      return {
        label: 'On air',
        className: 'bg-[var(--color-live-muted)] text-[var(--color-live)]',
      };
    case 'scheduled':
      return {
        label: 'Scheduled',
        className: 'bg-[var(--color-accent-muted)] text-[var(--color-accent-2-700)]',
      };
    case 'active':
      return {
        label: 'Off air',
        className: 'bg-[var(--color-success-muted)] text-[var(--color-success)]',
      };
    case 'ended':
      return {
        label: 'Ended',
        className: 'bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)]',
      };
    case 'expired':
      return {
        label: 'Expired',
        className: 'bg-[var(--color-surface)] text-[var(--color-text-tertiary)]',
      };
    default:
      return view.isLive
        ? {
            label: 'On air',
            className: 'bg-[var(--color-live-muted)] text-[var(--color-live)]',
          }
        : {
            label: 'Upcoming',
            className: 'bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)]',
          };
  }
}

interface SpaceResponse {
  space?: PublicSpace;
  error?: string;
}

interface UserResponse extends PublicUser {
  error?: string;
}

interface RecordingResponse {
  recording?: PublicRecording | null;
  error?: string;
}

interface LoadState {
  status: 'loading' | 'ready' | 'not-found' | 'error';
  error?: string;
  space: PublicSpace | null;
  user: PublicUser | null;
  recording: PublicRecording | null;
}

const INITIAL_STATE: LoadState = {
  status: 'loading',
  space: null,
  user: null,
  recording: null,
};

/**
 * Classes matching the PageLayout primitive's gutters and max width,
 * including its `flex-1` (fills a `flex min-h-screen flex-col` ancestor so
 * Footer pins to the bottom of a short page — see REVIEW.md,
 * "sticky-footer composition").
 */
const PAGE_MAIN_CLASSES =
  'mx-auto flex w-full max-w-content flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8';

const BACK_LINK_CLASSES =
  'inline-flex min-h-touch items-center self-start text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)]';

export default function SpacePage(): ReactElement {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? params.id : '';

  const [state, setState] = useState<LoadState>(INITIAL_STATE);
  // True while the user is inside the live room; hides the page chrome so
  // the NocturneShell owns the whole viewport.
  const [inRoom, setInRoom] = useState(false);

  const load = useCallback(async (spaceId: string) => {
    if (!spaceId) {
      setInRoom(false);
      setState({
        status: 'not-found',
        space: null,
        user: null,
        recording: null,
      });
      return;
    }

    setState(INITIAL_STATE);

    try {
      const spaceRes = await fetch(
        `/api/spaces/${encodeURIComponent(spaceId)}`,
        {
          credentials: 'include',
          cache: 'no-store',
        }
      );

      if (spaceRes.status === 404) {
        setState({
          status: 'not-found',
          space: null,
          user: null,
          recording: null,
        });
        return;
      }
      if (!spaceRes.ok) {
        setState({
          status: 'error',
          space: null,
          user: null,
          recording: null,
          error: `Failed to load the show (HTTP ${spaceRes.status}).`,
        });
        return;
      }

      const spaceBody = (await spaceRes
        .json()
        .catch(() => ({}))) as SpaceResponse;
      const space = spaceBody.space ?? null;
      if (!space) {
        setState({
          status: 'not-found',
          space: null,
          user: null,
          recording: null,
        });
        return;
      }

      // Load the current user and the host-only recording metadata in
      // parallel. Both calls are best-effort: if /api/me is unauthenticated
      // (401) or the recording endpoint is forbidden (403), we fall back to
      // a sensible empty value instead of treating it as a page-level error.
      const [userResult, recordingResult] = await Promise.allSettled([
        fetch('/api/me', { credentials: 'include', cache: 'no-store' }),
        fetch(
          `/api/spaces/${encodeURIComponent(spaceId)}/recording`,
          { credentials: 'include', cache: 'no-store' }
        ),
      ]);

      let user: PublicUser | null = null;
      if (userResult.status === 'fulfilled') {
        const userRes = userResult.value;
        if (userRes.ok && userRes.status !== 401 && userRes.status !== 404) {
          const userBody = (await userRes
            .json()
            .catch(() => ({}))) as UserResponse;
          if (userBody.did) {
            user = {
              id: userBody.id,
              did: userBody.did,
              handle: userBody.handle,
              displayName: userBody.displayName ?? null,
              avatarUrl: userBody.avatarUrl ?? null,
            };
          }
        }
      }

      const isHost = Boolean(user && user.did === space.host.did);

      let recording: PublicRecording | null = null;
      if (isHost && recordingResult.status === 'fulfilled') {
        const recRes = recordingResult.value;
        if (recRes.ok) {
          const recBody = (await recRes
            .json()
            .catch(() => ({}))) as RecordingResponse;
          recording = recBody.recording ?? null;
        }
      }

      setState({
        status: 'ready',
        space,
        user,
        recording,
      });
    } catch (err) {
      setState({
        status: 'error',
        space: null,
        user: null,
        recording: null,
        error:
          err instanceof Error ? err.message : 'Failed to load the show.',
      });
    }
  }, []);

  useEffect(() => {
    void load(id);
  }, [id, load]);

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <PageLayout>
          <header className="flex items-center gap-3">
            <Link href="/stations" className={BACK_LINK_CLASSES}>
              &larr; Stations
            </Link>
          </header>
          <section
            className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
            data-testid="space-loading"
          >
            <p className="text-sm text-[var(--color-text-secondary)]">
              Loading the show&hellip;
            </p>
          </section>
        </PageLayout>
        <Footer />
      </div>
    );
  }

  if (state.status === 'not-found') {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <PageLayout>
          <header className="flex items-center gap-3">
            <Link href="/stations" className={BACK_LINK_CLASSES}>
              &larr; Stations
            </Link>
          </header>
          <section
            className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
            data-testid="space-not-found"
          >
            <h1 className="text-2xl font-bold tracking-tight">
              Show not found
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              We couldn&apos;t find a show with that ID. It may have ended or
              been removed.
            </p>
          </section>
        </PageLayout>
        <Footer />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <PageLayout>
          <header className="flex items-center gap-3">
            <Link href="/stations" className={BACK_LINK_CLASSES}>
              &larr; Stations
            </Link>
          </header>
          <section
            className="flex flex-col gap-3 rounded-lg border border-[var(--color-live-border)] bg-[var(--color-live-muted)] p-6"
            role="alert"
            data-testid="space-error"
          >
            <h1 className="text-2xl font-bold tracking-tight">
              Something went wrong
            </h1>
            <p className="text-sm text-[var(--color-live)]">
              {state.error ?? 'Failed to load the show.'}
            </p>
            <button
              type="button"
              onClick={() => {
                void load(id);
              }}
              className="inline-flex min-h-touch items-center self-start rounded-md border border-[var(--color-border-strong)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-raised)]"
              data-testid="space-retry-button"
            >
              Retry
            </button>
          </section>
        </PageLayout>
        <Footer />
      </div>
    );
  }

  const view = state.space;
  // The 'ready' branch always carries a space, but the type checker wants
  // the narrowing explicit so downstream usage stays safe.
  if (!view) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <PageLayout>
          <header className="flex items-center gap-3">
            <Link href="/stations" className={BACK_LINK_CLASSES}>
              &larr; Stations
            </Link>
          </header>
          <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-text-secondary)]">
            Loading the show&hellip;
          </section>
        </PageLayout>
        <Footer />
      </div>
    );
  }

  const user = state.user;
  const isHost = Boolean(user && user.did === view.host.did);
  const badge = statusBadge(view);

  // Once the user joins, SpacePageClient mounts SpaceRoom (the full
  // NocturneShell, with its own sticky header and bottom control bar). The
  // page chrome is swapped for a full-bleed <main> so we don't end up with
  // two stacked headers and nested page padding. The placeholders are
  // rendered as `null` siblings at the same tree positions (instead of
  // conditionally mounting SpacePageClient) so the room is never unmounted
  // by the swap.
  return (
    <div className="flex min-h-screen flex-col">
      {inRoom ? null : <SiteHeader />}
      <main
        className={inRoom ? 'flex w-full flex-col' : PAGE_MAIN_CLASSES}
      >
        {inRoom ? null : (
          <header className="flex items-center gap-3">
            <Link href="/stations" className={BACK_LINK_CLASSES}>
              &larr; Stations
            </Link>
          </header>
        )}

        <SpacePageClient
          spaceId={view.id}
          isAuthenticated={Boolean(user)}
          isHost={isHost}
          isLive={view.isLive}
          status={view.status}
          scheduledAt={view.scheduledAt}
          title={view.title}
          description={view.description}
          tags={view.tags}
          host={{
            did: view.host.did,
            handle: view.host.handle,
            displayName: view.host.displayName ?? null,
            avatarUrl: view.host.avatarUrl ?? null,
          }}
          shareableUrl={view.shareableUrl}
          recording={state.recording}
          replay={view.replay ?? null}
          reminded={view.reminded ?? false}
          hostSubscribed={view.hostSubscribed ?? false}
          isNamedShow={view.isNamedShow}
          showFollowed={view.showFollowed ?? false}
          musicMood={view.musicMood ?? null}
          onJoinedChange={setInRoom}
        />

        {inRoom ? null : (
          <>
            <section
              className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
              data-testid="space-detail"
            >
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-2xl font-bold tracking-tight">
                  {view.title}
                </h1>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                  data-testid="space-status-badge"
                >
                  {badge.label}
                </span>
              </div>
              {view.status === 'scheduled' && view.scheduledAt ? (
                <p
                  className="rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-muted)] px-3 py-2 text-sm text-[var(--color-text-on-ink)]"
                  data-testid="scheduled-info"
                >
                  Scheduled for{' '}
                  <span className="font-medium">
                    {new Date(view.scheduledAt).toLocaleString()}
                  </span>
                  .
                </p>
              ) : null}
              {view.description ? (
                <p className="whitespace-pre-wrap text-sm text-[var(--color-text)]">
                  {view.description}
                </p>
              ) : (
                <p className="text-sm italic text-[var(--color-text-tertiary)]">
                  No description.
                </p>
              )}
            </section>

            <section
              className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
              data-testid="show-share"
            >
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Share this show
              </p>
              <code
                className="break-all text-xs text-[var(--color-text)]"
                data-testid="shareable-url"
              >
                {view.shareableUrl}
              </code>
              <ShareButtons shareableUrl={view.shareableUrl} title={view.title} />
            </section>
          </>
        )}
      </main>
      {inRoom ? null : <Footer />}
    </div>
  );
}
