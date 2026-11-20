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
import { useActiveRoom } from '@/components/ActiveRoomProvider';
import type { ShowDetails } from '@/components/ShowDetailsForm';
import type { PublicSpacePost } from '@/lib/posts';
import type { PublicRecording } from '@/components/RoomSidebar';
import type { PublicReplay } from '@/types';
import { NotifyMeButton } from '@/components/NotifyMeButton';
import { FollowHostButton } from '@/components/FollowHostButton';
import { ShowFollowButton } from '@/components/ShowFollowButton';
import { ReplayPlayer } from '@/components/ReplayPlayer';

export interface SpacePageClientProps {
  spaceId: string;
  isAuthenticated: boolean;
  isHost: boolean;
  isLive: boolean;
  status?: string;
  scheduledAt?: string | null;
  title: string;
  description?: string | null;
  tags?: string[];
  host: {
    did?: string;
    handle: string;
    displayName?: string | null;
    avatarUrl?: string | null;
  };
  shareableUrl: string;
  recording: PublicRecording | null;
  /** Latest playable recording while the show is off air. */
  replay?: PublicReplay | null;
  /** Whether the viewer already asked to be notified (scheduled shows). */
  reminded?: boolean;
  /** Whether the viewer already follows this host (any of their shows). */
  hostSubscribed?: boolean;
  /** True when this show has a name of its own, not the host's default-titled show. */
  isNamedShow?: boolean;
  /** Whether the viewer already follows this exact named show. */
  showFollowed?: boolean;
  /** Pre-show music mood id, null for silence. */
  musicMood?: string | null;
  /**
   * Called whenever the joined state changes (`true` once the user is in
   * the room, `false` after leaving). Lets the surrounding page swap its
   * chrome (site header, detail sections) for the full-bleed room.
   */
  onJoinedChange?: (joined: boolean) => void;
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
  /** True when joined without a session (listen-only). */
  anonymous?: boolean;
  /** Server-side on-air state at join time. */
  onAir?: boolean;
  /** Per-join STUN/TURN servers; absent when no relay is configured. */
  iceServers?: RTCIceServer[];
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
  description = null,
  tags = [],
  host,
  shareableUrl,
  recording,
  replay = null,
  reminded = false,
  hostSubscribed = false,
  isNamedShow = false,
  showFollowed = false,
  musicMood = null,
  onJoinedChange,
}: SpacePageClientProps): ReactElement {
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The join session and the LiveKit connection itself live in
  // ActiveRoomProvider (root layout) so they survive navigating away from
  // this page; `joinedHere` is true once that session is for this space.
  const activeRoom = useActiveRoom();
  const joinedHere = activeRoom.session?.spaceId === spaceId;
  const [live, setLiveState] = useState<boolean>(isLive);
  const setLive = useCallback(
    (next: boolean) => {
      setLiveState(next);
      if (activeRoom.session?.spaceId === spaceId) activeRoom.setLive(next);
    },
    [activeRoom, spaceId]
  );
  // Show details can change while in the room (the host renames the show
  // or picks topics), so they live in state seeded from the page props.
  const [details, setDetails] = useState<ShowDetails>({ title, description, tags, musicMood: musicMood ?? null });
  // Messages that predate the music field leave the current mood alone.
  const mergeDetails = useCallback(
    (next: ShowDetails) => {
      setDetails((prev) => ({ ...prev, ...next, musicMood: next.musicMood === undefined ? prev.musicMood : next.musicMood }));
      // Keep PersistentShowBar's title current even after the host
      // navigates away from this page.
      if (activeRoom.session?.spaceId === spaceId) activeRoom.setTitle(next.title);
    },
    [activeRoom, spaceId]
  );
  const changeMusicMood = useCallback(
    async (mood: string | null) => {
      const res = await fetch(`/api/spaces/${encodeURIComponent(spaceId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ musicMood: mood }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Could not save the music mood (HTTP ${res.status}).`);
      }
      setDetails((prev) => ({ ...prev, musicMood: mood }));
    },
    [spaceId]
  );
  const [posts, setPosts] = useState<PublicSpacePost[]>([]);
  const [postsError, setPostsError] = useState<string | null>(null);

  // Notify the surrounding page whenever the user enters or leaves the
  // room so it can hide the page chrome while the full-screen shell is up.
  useEffect(() => {
    onJoinedChange?.(joinedHere);
  }, [joinedHere, onJoinedChange]);

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
        const session = parsed as JoinResponse;
        activeRoom.join({
          spaceId,
          token: session.token,
          wsUrl: session.wsUrl,
          role: session.role,
          identity: session.identity,
          isHost,
          handle: session.handle,
          displayName: session.displayName,
          avatarUrl: session.avatarUrl,
          anonymous: session.anonymous,
          iceServers: session.iceServers,
          title: details.title,
          host,
          shareableUrl,
          isLive: live,
        });
      }
    } catch {
      // Malformed JSON: fall through to the manual join button.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One-click "Listen" from the home page: /show/[id]?listen=1 joins on
  // mount (anonymously when signed out) instead of showing the join card.
  // Not for the host, who should choose when to open the studio.
  const [autoListen, setAutoListen] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('listen') === '1' && !isHost && isLive) setAutoListen(true);
  }, [isHost, isLive]);

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
      onReport: async (targetIdentity: string, reason: string, targetHandle?: string) => {
        try {
          const res = await fetch('/api/reports', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ spaceId, targetIdentity, reason, targetHandle }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            setError(body?.message ?? body?.error ?? `Report failed (HTTP ${res.status}).`);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Report failed.');
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
            `Failed to join the show (HTTP ${res.status}).`
        );
        return;
      }
      const role: SpaceRole = (body.role as SpaceRole) ?? (isHost ? 'host' : 'audience');
      const onAir = typeof body.onAir === 'boolean' ? body.onAir : live;
      activeRoom.join({
        spaceId,
        token: body.token,
        wsUrl: body.wsUrl,
        role,
        identity: body.identity ?? '',
        isHost,
        handle: body.handle ?? '',
        displayName: body.displayName ?? null,
        avatarUrl: body.avatarUrl ?? null,
        anonymous: body.anonymous === true,
        iceServers: body.iceServers,
        title: details.title,
        host,
        shareableUrl,
        isLive: onAir,
      });
      if (typeof body.onAir === 'boolean') setLive(body.onAir);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unexpected error joining the show.'
      );
    } finally {
      setJoining(false);
    }
  }, [activeRoom, details.title, host, isHost, joining, live, setLive, shareableUrl, spaceId]);

  useEffect(() => {
    if (!autoListen || joinedHere || joining) return;
    setAutoListen(false);
    void onJoin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoListen]);

  if (joinedHere && activeRoom.session) {
    const session = activeRoom.session;
    return (
      <SpaceRoom
        role={session.role}
        identity={session.identity}
        displayName={session.displayName ?? session.handle}
        handle={session.handle}
        avatarUrl={session.avatarUrl}
        isHost={isHost}
        anonymous={session.anonymous}
        hostActions={hostActions}
        title={details.title}
        description={details.description}
        tags={details.tags}
        onSpaceUpdated={mergeDetails}
        musicMood={details.musicMood ?? null}
        onMusicMoodChange={isHost ? changeMusicMood : undefined}
        host={host}
        hostSubscribed={hostSubscribed}
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

  // Off air with a recording: play it back instead of opening an empty stage.
  // The host still gets a way into the studio underneath.
  if (!live && replay) {
    return (
      <div className="flex flex-col gap-4" data-testid="space-replay">
        <ReplayPlayer replay={replay} title={details.title} />
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-[var(--color-live-border)] bg-[var(--color-live-muted)] px-3 py-2 text-sm text-[var(--color-live)]"
            data-testid="join-error"
          >
            {error}
          </p>
        ) : null}
        {isHost ? (
          <button
            type="button"
            onClick={() => {
              void onJoin();
            }}
            disabled={joining}
            className="inline-flex min-h-touch items-center justify-center self-start rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-4 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-raised)] disabled:opacity-50"
            data-testid="join-button"
          >
            {joining ? 'Opening…' : 'Open the studio'}
          </button>
        ) : null}
      </div>
    );
  }

  // Scheduled, or just off air: nothing to listen to yet, so everyone but the
  // host gets "Notify me". Signed-in guests the host wants on stage before
  // going on air can still slip into the studio through the quiet link.
  if (!isHost && !live) {
    const scheduled = status === 'scheduled';
    return (
      <section
        className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text)] sm:p-6"
        data-testid={scheduled ? 'space-scheduled' : 'space-off-air'}
      >
        <p>
          {scheduled
            ? `This show hasn't started yet${scheduledAt ? ` — it is planned for ${new Date(scheduledAt).toLocaleString()}` : ''}.`
            : 'The host is off air right now. Get notified the moment they go live.'}
        </p>
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-[var(--color-live-border)] bg-[var(--color-live-muted)] px-3 py-2 text-sm text-[var(--color-live)]"
            data-testid="join-error"
          >
            {error}
          </p>
        ) : null}
        <div>
          <NotifyMeButton
            spaceId={spaceId}
            isAuthenticated={isAuthenticated}
            reminded={reminded}
            scheduledAt={scheduledAt}
          />
        </div>
        {host.did ? (
          <div>
            <FollowHostButton
              hostDid={host.did}
              hostName={host.displayName?.trim() || `@${host.handle}`}
              isAuthenticated={isAuthenticated}
              following={hostSubscribed}
              loginNext={`/show/${spaceId}`}
            />
          </div>
        ) : null}
        {isNamedShow ? (
          <div>
            <ShowFollowButton
              spaceId={spaceId}
              showTitle={details.title}
              isAuthenticated={isAuthenticated}
              following={showFollowed}
              loginNext={`/show/${spaceId}`}
            />
          </div>
        ) : null}
        {isAuthenticated && !scheduled ? (
          <button
            type="button"
            onClick={() => {
              void onJoin();
            }}
            disabled={joining}
            className="self-start text-xs text-[var(--color-text-tertiary)] underline-offset-2 hover:underline disabled:opacity-50"
            data-testid="enter-studio"
          >
            {joining ? 'Opening…' : 'Invited to the stage? Enter the studio'}
          </button>
        ) : null}
      </section>
    );
  }

  if (!isAuthenticated) {
    return (
      <section
        className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text)] sm:p-6"
        data-testid="space-unauthenticated"
      >
        <p>
          Listen without an account. You will count toward the listener total
          but will not appear in the room; sign in with Bluesky to raise your
          hand, react, or take the stage.
        </p>
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-[var(--color-live-border)] bg-[var(--color-live-muted)] px-3 py-2 text-sm text-[var(--color-live)]"
            data-testid="join-error"
          >
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              void onJoin();
            }}
            disabled={joining}
            className="inline-flex min-h-touch items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
            data-testid="listen-button"
          >
            {joining ? 'Connecting…' : 'Listen'}
          </button>
          <a
            href={`/login?next=${encodeURIComponent(`/show/${spaceId}`)}`}
            className="inline-flex min-h-touch items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-4 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-raised)]"
            data-testid="space-signin-link"
          >
            Sign in
          </a>
        </div>
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
            ? 'You are the host. Joining puts you on stage, off air until you press On air.'
            : 'Joining puts you in the audience (listen-only).'}
        </p>
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-[var(--color-error)] bg-[var(--color-error-muted)] px-3 py-2 text-sm text-[var(--color-error-text)]"
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
            className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
            data-testid="join-button"
          >
            {joining ? 'Joining…' : 'Join the show'}
          </button>
        </div>
        {status ? (
          <p className="text-xs text-[var(--color-text-secondary)]">
            Status: {status}
            {scheduledAt ? ` · ${new Date(scheduledAt).toLocaleString()}` : ''}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export default SpacePageClient;
