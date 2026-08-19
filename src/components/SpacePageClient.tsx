'use client';

// src/components/SpacePageClient.tsx
//
// Client-side join flow for the space detail page. Fetches posts, exposes
// a "Join Space" button that POSTs to /api/spaces/[id]/join and, on
// success, mounts SpaceRoom with the redesigned Nocturne layout. The
// joined-state layout is owned entirely by SpaceRoom — this component
// just forwards the metadata it needs.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { SpaceRoom, type SpaceRole } from '@/components/SpaceRoom';
import type { PublicSpacePost } from '@/lib/posts';
import type { PublicRecording } from '@/components/RoomSidebar';

export interface SpacePageClientProps {
  spaceId: string;
  isAuthenticated: boolean;
  isHost: boolean;
  isLive: boolean;
  status?: string;
  scheduledAt?: string | null;
  title: string;
  host: {
    handle: string;
    displayName?: string | null;
    avatarUrl?: string | null;
  };
  shareableUrl: string;
  recording: PublicRecording | null;
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
  title,
  host,
  shareableUrl,
  recording,
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

  // Auto-join handoff: when the user just created a space with "Start
  // now", the create form stored a join payload under
  // `rabble_join_<spaceId>` and navigated here. Consume it on mount so
  // the host lands directly in the room without clicking Join.
  useEffect(() => {
    const key = `rabble_join_${spaceId}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) {
      return;
    }
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

  if (joined) {
    return (
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
        title={title}
        host={host}
        shareableUrl={shareableUrl}
        posts={posts}
        postsError={postsError}
        onPostAdded={() => {
          void refreshPosts();
        }}
        isLive={live}
        onLiveChange={setLive}
        spaceId={spaceId}
        recording={recording}
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <section
        className="rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-text)]"
        data-testid="space-unauthenticated"
      >
        <p className="mb-3">Sign in with Bluesky to join this space.</p>
        <a
          href="/api/auth/bluesky"
          className="inline-block rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-900)] hover:bg-[var(--color-accent-400)]"
        >
          Sign in
        </a>
      </section>
    );
  }

  return (
    <section
      className="rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text)]"
      data-testid="space-join-card"
    >
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
            className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-900)] hover:bg-[var(--color-accent-400)] disabled:opacity-50"
            data-testid="join-button"
          >
            {joining ? 'Joining…' : 'Join Space'}
          </button>
        </div>
        {status ? (
          <p className="text-xs text-[var(--color-neutral-500)]">
            Status: {status}
            {scheduledAt ? ` · ${new Date(scheduledAt).toLocaleString()}` : ''}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export default SpacePageClient;
