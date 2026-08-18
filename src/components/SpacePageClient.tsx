'use client';

// src/components/SpacePageClient.tsx
//
// Client-side join flow for the space detail page. Renders a "Join Space"
// button that POSTs to /api/spaces/[id]/join and, on success, mounts the
// LiveKit room with the returned token. While the room is mounted the join
// button is replaced by the in-room UI, including stage controls, the
// live banner toggle, the host-only post sharing form, and the post
// carousel for everyone.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { SpaceRoom, type SpaceRole } from '@/components/SpaceRoom';
import { StageControls } from '@/components/StageControls';
import { LiveBannerButton } from '@/components/LiveBannerButton';
import { AddPostForm } from '@/components/AddPostForm';
import { DeleteSpaceButton } from '@/components/DeleteSpaceButton';
import { PostCarousel } from '@/components/PostCarousel';
import type { PublicSpacePost } from '@/lib/posts';

export interface SpacePageClientProps {
  spaceId: string;
  isAuthenticated: boolean;
  isHost: boolean;
  isLive: boolean;
  status?: string;
  scheduledAt?: string | null;
}

interface JoinResponse {
  token: string;
  wsUrl: string;
  role: SpaceRole;
  roomName: string;
  identity: string;
  handle: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

interface PostsListResponse {
  posts?: PublicSpacePost[];
  error?: string;
}

export function SpacePageClient({
  spaceId,
  isAuthenticated,
  isHost,
  isLive,
  status,
  scheduledAt,
}: SpacePageClientProps): ReactElement {
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<JoinResponse | null>(null);
  const [live, setLive] = useState<boolean>(isLive);
  const [posts, setPosts] = useState<PublicSpacePost[]>([]);
  const [postsError, setPostsError] = useState<string | null>(null);

  const refreshPosts = useCallback(async () => {
    try {
      const res = await fetch(`/api/spaces/${spaceId}/posts`, {
        method: 'GET',
        cache: 'no-store',
      });
      const body = (await res
        .json()
        .catch(() => ({}))) as PostsListResponse;
      if (!res.ok) {
        setPostsError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setPostsError(null);
      setPosts(body.posts ?? []);
    } catch (err) {
      setPostsError(
        err instanceof Error ? err.message : 'Failed to load posts.'
      );
    }
  }, [spaceId]);

  useEffect(() => {
    void refreshPosts();
  }, [refreshPosts]);

  // Auto-join handoff: when the user just created a space with
  // "Start now", the create form stored a join payload under
  // `rabble_join_<spaceId>` and navigated here. Consume it on mount so
  // the host lands directly in the room without clicking Join.
  useEffect(() => {
    const key = `rabble_join_${spaceId}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) {
      return;
    }
    // Always clear the slot so a reload doesn't try to reuse a consumed
    // payload. If parsing/validation fails we still fall back cleanly.
    sessionStorage.removeItem(key);
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed &&
        typeof parsed === 'object' &&
        typeof (parsed as JoinResponse).token === 'string' &&
        (parsed as JoinResponse).token.length > 0 &&
        typeof (parsed as JoinResponse).wsUrl === 'string' &&
        (parsed as JoinResponse).wsUrl.length > 0 &&
        typeof (parsed as JoinResponse).role === 'string' &&
        (parsed as JoinResponse).role.length > 0 &&
        typeof (parsed as JoinResponse).roomName === 'string' &&
        (parsed as JoinResponse).roomName.length > 0 &&
        typeof (parsed as JoinResponse).identity === 'string' &&
        (parsed as JoinResponse).identity.length > 0 &&
        typeof (parsed as JoinResponse).handle === 'string' &&
        (parsed as JoinResponse).handle.length > 0
      ) {
        setJoined(parsed as JoinResponse);
      }
    } catch {
      // Malformed JSON: fall through to the manual join button.
    }
    // Intentionally empty: this handoff must run exactly once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLeave = useCallback(() => {
    setJoined(null);
  }, []);

  const hostActions = useMemo(() => {
    if (!isHost) return undefined;
    return {
      onInvite: async (targetIdentity: string) => {
        try {
          const res = await fetch(`/api/spaces/${spaceId}/stage`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'invite', targetIdentity }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            setError(body?.message ?? body?.error ?? `Invite failed (HTTP ${res.status}).`);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Invite failed.');
        }
      },
      onRemoveFromStage: async (targetIdentity: string) => {
        try {
          const res = await fetch(`/api/spaces/${spaceId}/stage`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'remove', targetIdentity }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            setError(body?.message ?? body?.error ?? `Remove failed (HTTP ${res.status}).`);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Remove failed.');
        }
      },
      onMuteToggle: async (targetIdentity: string, nextMuted: boolean) => {
        try {
          const res = await fetch(`/api/spaces/${spaceId}/stage`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              action: nextMuted ? 'mute' : 'unmute',
              targetIdentity,
            }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            setError(body?.message ?? body?.error ?? `Mute failed (HTTP ${res.status}).`);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Mute failed.');
        }
      },
      onRemoveFromSpace: async (targetIdentity: string) => {
        try {
          const res = await fetch(`/api/spaces/${spaceId}/stage`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'kick', targetIdentity }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            setError(body?.message ?? body?.error ?? `Kick failed (HTTP ${res.status}).`);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Kick failed.');
        }
      },
      onBlock: async (targetIdentity: string) => {
        try {
          const res = await fetch(`/api/spaces/${spaceId}/stage`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'block', targetIdentity }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            setError(body?.message ?? body?.error ?? `Block failed (HTTP ${res.status}).`);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Block failed.');
        }
      },
    };
  }, [isHost, spaceId]);

  const onJoin = useCallback(async () => {
    if (joining) return;
    setJoining(true);
    setError(null);
    try {
      const res = await fetch(`/api/spaces/${spaceId}/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      const body = (await res.json().catch(() => ({}))) as Partial<JoinResponse> & {
        error?: string;
        message?: string;
      };
      if (!res.ok || !body.token || !body.wsUrl) {
        setError(
          body.message ||
            body.error ||
            `Failed to join space (HTTP ${res.status}).`
        );
        return;
      }
      setJoined({
        token: body.token,
        wsUrl: body.wsUrl,
        role: (body.role as SpaceRole) ?? (isHost ? 'host' : 'audience'),
        roomName: body.roomName ?? '',
        identity: body.identity ?? '',
        handle: body.handle ?? '',
        displayName: body.displayName ?? null,
        avatarUrl: body.avatarUrl ?? null,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unexpected error joining space.'
      );
    } finally {
      setJoining(false);
    }
  }, [isHost, joining, spaceId]);

  const stageSlot = useMemo(() => {
    if (!joined) return null;
    // For the host, force stage role to 'host' regardless of the joined
    // response shape, so the StageManager / host controls always render.
    const stageRole: 'host' | 'speaker' | 'audience' =
      isHost || joined.role === 'host' ? 'host' : 'audience';
    // Prefer the friendly displayName over the raw DID for the StageControls
    // header so the host never sees a `did:plc:...` value.
    const friendlyStageName =
      joined.displayName ?? (joined.handle ? `@${joined.handle}` : joined.identity);
    return (
      <StageControls
        spaceId={spaceId}
        identity={joined.identity}
        displayName={friendlyStageName}
        role={stageRole}
        onTokenRefresh={(next) => {
          setJoined({
            token: next.token,
            wsUrl: next.wsUrl,
            role: next.role === 'audience' ? 'audience' : 'host',
            roomName: next.roomName,
            identity: next.identity,
            handle: joined.handle,
            displayName: joined.displayName ?? null,
            avatarUrl: joined.avatarUrl ?? null,
          });
        }}
      />
    );
  }, [isHost, joined, spaceId]);

  const sidebar = (
    <aside
      className="flex flex-col gap-4"
      data-testid="space-sidebar"
    >
      {isHost ? (
        <LiveBannerButton
          spaceId={spaceId}
          isLive={live}
          onChange={(next) => setLive(next.isLive)}
        />
      ) : null}
      {isHost ? (
        <AddPostForm
          spaceId={spaceId}
          onAdded={() => {
            void refreshPosts();
          }}
        />
      ) : null}
      {isHost ? <DeleteSpaceButton spaceId={spaceId} /> : null}
      {postsError ? (
        <p
          role="alert"
          className="rounded-md border border-red-700 bg-red-900/30 px-3 py-2 text-xs text-red-200"
        >
          {postsError}
        </p>
      ) : null}
      <div data-testid="post-carousel-wrapper">
        <h3 className="mb-2 text-sm font-semibold text-slate-200">
          Shared posts
        </h3>
        <PostCarousel posts={posts} />
      </div>
    </aside>
  );

  if (joined) {
    return (
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <SpaceRoom
            token={joined.token}
            wsUrl={joined.wsUrl}
            role={joined.role}
            identity={joined.identity}
            displayName={joined.displayName ?? joined.handle}
            handle={joined.handle}
            avatarUrl={joined.avatarUrl ?? null}
            isHost={isHost}
            hostActions={hostActions}
            onLeave={handleLeave}
            stageSlot={stageSlot}
          />
        </div>
        <div>{sidebar}</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="grid gap-6 md:grid-cols-3">
        <section className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300 md:col-span-2">
          <p className="mb-3">Sign in with Bluesky to join this space.</p>
          <a
            href="/api/auth/bluesky"
            className="inline-block rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
          >
            Sign in
          </a>
        </section>
        <div>{sidebar}</div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">
        <div className="flex flex-col gap-3">
          <p>
            {isHost
              ? 'You are the host. Joining will connect you as a speaker.'
              : 'Joining will connect you as audience (listen-only).'}
          </p>
          {error ? (
            <p
              role="alert"
              className="rounded-md border border-red-700 bg-red-900/30 px-3 py-2 text-sm text-red-200"
              data-testid="join-error"
            >
              {error}
            </p>
          ) : null}
          <div>
            <button
              type="button"
              onClick={() => {
                void onJoin();
              }}
              disabled={joining}
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
              data-testid="join-button"
            >
              {joining ? 'Joining…' : 'Join Space'}
            </button>
          </div>
        </div>
      </section>
      <div>{sidebar}</div>
    </div>
  );
}

export default SpacePageClient;
