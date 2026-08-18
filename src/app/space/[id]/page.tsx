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
import { RecordingDownload } from '@/components/RecordingDownload';
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
      return { label: 'Live', className: 'bg-red-600/20 text-red-300' };
    case 'scheduled':
      return { label: 'Scheduled', className: 'bg-sky-700/40 text-sky-200' };
    case 'active':
      return { label: 'Active', className: 'bg-emerald-700/30 text-emerald-200' };
    case 'ended':
      return { label: 'Ended', className: 'bg-slate-700 text-slate-300' };
    case 'expired':
      return { label: 'Expired', className: 'bg-slate-800 text-slate-500' };
    default:
      return view.isLive
        ? { label: 'Live', className: 'bg-red-600/20 text-red-300' }
        : { label: 'Upcoming', className: 'bg-slate-700 text-slate-300' };
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

export default function SpacePage(): ReactElement {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? params.id : '';

  const [state, setState] = useState<LoadState>(INITIAL_STATE);

  const load = useCallback(async (spaceId: string) => {
    if (!spaceId) {
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
          error: `Failed to load space (HTTP ${spaceRes.status}).`,
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
          err instanceof Error ? err.message : 'Failed to load space.',
      });
    }
  }, []);

  useEffect(() => {
    void load(id);
  }, [id, load]);

  if (state.status === 'loading') {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 p-6">
        <header className="flex items-center gap-3">
          <Link
            href="/spaces"
            className="text-sm text-slate-400 hover:text-slate-200"
          >
            &larr; Spaces
          </Link>
        </header>
        <section
          className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900 p-6"
          data-testid="space-loading"
        >
          <p className="text-sm text-slate-400">Loading space&hellip;</p>
        </section>
      </main>
    );
  }

  if (state.status === 'not-found') {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 p-6">
        <header className="flex items-center gap-3">
          <Link
            href="/spaces"
            className="text-sm text-slate-400 hover:text-slate-200"
          >
            &larr; Spaces
          </Link>
        </header>
        <section
          className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900 p-6"
          data-testid="space-not-found"
        >
          <h1 className="text-2xl font-bold tracking-tight">
            Space not found
          </h1>
          <p className="text-sm text-slate-400">
            We couldn&apos;t find a space with that ID. It may have ended or
            been removed.
          </p>
        </section>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 p-6">
        <header className="flex items-center gap-3">
          <Link
            href="/spaces"
            className="text-sm text-slate-400 hover:text-slate-200"
          >
            &larr; Spaces
          </Link>
        </header>
        <section
          className="flex flex-col gap-3 rounded-lg border border-red-800 bg-red-950/40 p-6"
          role="alert"
          data-testid="space-error"
        >
          <h1 className="text-2xl font-bold tracking-tight">
            Something went wrong
          </h1>
          <p className="text-sm text-red-200">
            {state.error ?? 'Failed to load space.'}
          </p>
          <button
            type="button"
            onClick={() => {
              void load(id);
            }}
            className="self-start rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
            data-testid="space-retry-button"
          >
            Retry
          </button>
        </section>
      </main>
    );
  }

  const view = state.space;
  // The 'ready' branch always carries a space, but the type checker wants
  // the narrowing explicit so downstream usage stays safe.
  if (!view) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 p-6">
        <header className="flex items-center gap-3">
          <Link
            href="/spaces"
            className="text-sm text-slate-400 hover:text-slate-200"
          >
            &larr; Spaces
          </Link>
        </header>
        <section className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">
          Loading space&hellip;
        </section>
      </main>
    );
  }

  const user = state.user;
  const isHost = Boolean(user && user.did === view.host.did);
  const badge = statusBadge(view);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-center gap-3">
        <Link
          href="/spaces"
          className="text-sm text-slate-400 hover:text-slate-200"
        >
          &larr; Spaces
        </Link>
      </header>

      <section
        className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900 p-6"
        data-testid="space-detail"
      >
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{view.title}</h1>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
            data-testid="space-status-badge"
          >
            {badge.label}
          </span>
        </div>
        <p className="text-sm text-slate-400">
          Hosted by{' '}
          <span className="text-slate-200">@{view.host.handle}</span>
          {view.host.displayName ? ` (${view.host.displayName})` : ''}
        </p>
        {view.status === 'scheduled' && view.scheduledAt ? (
          <p
            className="rounded-md border border-sky-700 bg-sky-900/30 px-3 py-2 text-sm text-sky-100"
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
          <p className="whitespace-pre-wrap text-sm text-slate-300">
            {view.description}
          </p>
        ) : (
          <p className="text-sm italic text-slate-500">No description.</p>
        )}
        <div className="mt-2 flex flex-col gap-2 rounded-md border border-slate-800 bg-slate-950 p-3 text-xs">
          <p className="text-slate-500">Shareable URL</p>
          <code
            className="break-all text-slate-200"
            data-testid="shareable-url"
          >
            {view.shareableUrl}
          </code>
          <ShareButtons shareableUrl={view.shareableUrl} title={view.title} />
        </div>
      </section>

      <SpacePageClient
        spaceId={view.id}
        isAuthenticated={Boolean(user)}
        isHost={isHost}
        isLive={view.isLive}
        status={view.status}
        scheduledAt={view.scheduledAt}
      />

      {isHost ? (
        <RecordingDownload spaceId={view.id} initial={state.recording} />
      ) : null}
    </main>
  );
}
