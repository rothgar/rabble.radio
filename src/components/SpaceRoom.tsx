'use client';

// src/components/SpaceRoom.tsx
//
// LiveKit room wrapper for the redesigned Nocturne live-room. Renders the
// full viewport shell (nav bar, two-column content, sticky bottom bar) via
// NocturneShell, with RoomHeader / speaker grid / audience section /
// RoomSidebar / BottomControlBar nested inside.
//
// Stage membership is determined by `participant.permissions.canPublish`.
// The local participant mirrors onto the stage grid when role is host or
// the local track has publish rights.
//
// Floating emoji reactions are spawned from the local user's avatar
// (speaker card if on stage, audience "YOU" bubble otherwise) via
// getBoundingClientRect().

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactElement, ReactNode } from 'react';
import {
  LiveKitRoom,
  useLocalParticipant,
  useParticipants,
} from '@livekit/components-react';
import type { Participant } from 'livekit-client';
import { Room } from 'livekit-client';
import { NocturneShell } from '@/components/NocturneShell';
import { RoomHeader } from '@/components/RoomHeader';
import { SpeakerCard } from '@/components/SpeakerCard';
import { AudienceBubbles, type AudienceMember } from '@/components/AudienceBubbles';
import { AudienceRows } from '@/components/AudienceRows';
import { RoomSidebar, type PublicRecording } from '@/components/RoomSidebar';
import { BottomControlBar } from '@/components/BottomControlBar';
import { FloatingReaction } from '@/components/FloatingReaction';
import { StageInviteToast } from '@/components/StageInviteToast';
import { StageControls, type StageControlsProps, getStageControlsBus } from '@/components/StageControls';
import type { PublicSpacePost } from '@/lib/posts';

export type SpaceRole = 'host' | 'audience';
export type BottomRole = 'host' | 'speaker' | 'audience';

export interface SpaceRoomProps {
  token: string;
  wsUrl: string;
  role: SpaceRole;
  identity: string;
  displayName?: string;
  handle?: string;
  avatarUrl?: string | null;
  isHost?: boolean;
  hostActions?: {
    onInvite?: (identity: string) => Promise<void> | void;
    onMuteToggle?: (
      identity: string,
      nextMuted: boolean
    ) => Promise<void> | void;
    onRemoveFromStage?: (identity: string) => Promise<void> | void;
    onRemoveFromSpace?: (identity: string) => Promise<void> | void;
    onBlock?: (identity: string) => Promise<void> | void;
  };
  onLeave?: () => void;
  /**
   * Reserved slot for any extra children that need access to LiveKit
   * context. Currently unused by the redesigned layout but kept for
   * future host controls that want to live inside LiveKitRoom.
   */
  stageSlot?: ReactNode;
  /** Title shown in the room header. */
  title: string;
  /** Host metadata shown in the header. */
  host: {
    handle: string;
    displayName?: string | null;
    avatarUrl?: string | null;
  };
  /** Public shareable URL for the room. */
  shareableUrl: string;
  posts: PublicSpacePost[];
  postsError: string | null;
  onPostAdded: () => void;
  isLive: boolean;
  onLiveChange: (next: boolean) => void;
  spaceId: string;
  recording?: PublicRecording | null;
}

/**
 * Lightweight profile metadata shared between the speaker grid and the
 * audience bubbles/rows.
 */
export interface AudioParticipantTileData {
  handle?: string;
  avatarUrl?: string | null;
  displayName?: string | null;
}

export type ResolvedProfileMap = Record<string, AudioParticipantTileData>;

function useResolvedProfiles(identities: string[]): ResolvedProfileMap {
  const [profiles, setProfiles] = useState<ResolvedProfileMap>({});

  const identitiesKey = useMemo(
    () => Array.from(new Set(identities)).sort().join('|'),
    [identities]
  );

  useEffect(() => {
    const list = identitiesKey ? identitiesKey.split('|') : [];
    if (list.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/users?identities=${encodeURIComponent(list.join(','))}`,
          { method: 'GET', headers: { accept: 'application/json' } }
        );
        if (!res.ok) return;
        const body = (await res.json().catch(() => ({}))) as {
          users?: Array<{
            did: string;
            handle?: string;
            avatarUrl?: string | null;
            displayName?: string | null;
          }>;
        };
        if (cancelled || !body.users) return;
        setProfiles((prev) => {
          const next = { ...prev };
          for (const u of body.users ?? []) {
            if (!u?.did) continue;
            next[u.did] = {
              handle: u.handle ?? u.did,
              avatarUrl: u.avatarUrl ?? null,
              displayName: u.displayName ?? null,
            };
          }
          return next;
        });
      } catch {
        // Best-effort; the fallback initials will still render.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [identitiesKey]);

  return profiles;
}

interface FloatingReactionState {
  id: string;
  emoji: string;
  x: number;
  y: number;
}

/**
 * Determine whether a LiveKit participant has publish rights (i.e. is a
 * speaker on stage). The LiveKit participant exposes
 * `permissions.canPublish`; when the permission metadata is unavailable
 * we fall back to the microphone state as a best-effort signal.
 */
function canPublishFor(p: Participant | undefined | null): boolean {
  if (!p) return false;
  const perms = (p as { permissions?: { canPublish?: boolean } }).permissions;
  if (perms && typeof perms.canPublish === 'boolean') {
    return perms.canPublish;
  }
  return Boolean((p as { isMicrophoneEnabled?: boolean }).isMicrophoneEnabled);
}

/**
 * HostAutoUnmute: when the role is 'host', enable the local microphone
 * exactly once after the room connects so the host appears as a live
 * speaker.
 */
function HostAutoUnmute({ role }: { role: SpaceRole }): null {
  const { localParticipant } = useLocalParticipant();
  const enabledRef = useRef(false);

  useEffect(() => {
    if (role !== 'host') return;
    if (enabledRef.current) return;
    if (!localParticipant) return;
    enabledRef.current = true;
    void localParticipant.setMicrophoneEnabled(true).catch(() => {
      enabledRef.current = false;
    });
  }, [localParticipant, role]);

  return null;
}

/**
 * Inner content rendered inside `LiveKitRoom`. Has access to room
 * context hooks and renders the redesigned grid + bottom bar.
 */
interface InnerProps {
  identity: string;
  displayName?: string;
  isHost: boolean;
  hostActions: SpaceRoomProps['hostActions'];
  mergedProfiles: ResolvedProfileMap;
  handleLeave: () => void;
  role: SpaceRole;
  title: string;
  host: SpaceRoomProps['host'];
  shareableUrl: string;
  posts: PublicSpacePost[];
  postsError: string | null;
  onPostAdded: () => void;
  isLive: boolean;
  onLiveChange: (next: boolean) => void;
  spaceId: string;
  recording: PublicRecording | null;
  handRaised: boolean;
  toggleHand: () => void;
  onReact: (emoji: string) => void;
  floatingReactions: FloatingReactionState[];
  removeFloatingReaction: (id: string) => void;
  pendingInvite: { hostName?: string } | null;
  inviteBusy: boolean;
  onAcceptInvite: () => void;
  onDeclineInvite: () => void;
  stageSlot?: ReactNode;
  stageControlsProps: StageControlsProps;
}

function Inner({
  identity,
  displayName,
  isHost,
  hostActions,
  mergedProfiles,
  handleLeave,
  role,
  title,
  host,
  shareableUrl,
  posts,
  postsError,
  onPostAdded,
  isLive,
  onLiveChange,
  spaceId,
  recording,
  handRaised,
  toggleHand,
  onReact,
  floatingReactions,
  removeFloatingReaction,
  pendingInvite,
  inviteBusy,
  onAcceptInvite,
  onDeclineInvite,
  stageSlot,
  stageControlsProps,
}: InnerProps): ReactElement {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const localAvatarRef = useRef<HTMLDivElement | null>(null);
  const [micOn, setMicOn] = useState<boolean>(
    Boolean(localParticipant?.isMicrophoneEnabled)
  );
  const [invitedSet, setInvitedSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    setMicOn(Boolean(localParticipant?.isMicrophoneEnabled));
  }, [localParticipant?.isMicrophoneEnabled]);

  const onMicToggle = useCallback(async () => {
    if (!localParticipant) return;
    try {
      const next = !localParticipant.isMicrophoneEnabled;
      await localParticipant.setMicrophoneEnabled(next);
      setMicOn(next);
    } catch {
      /* swallow */
    }
  }, [localParticipant]);

  const onStepDown = useCallback(() => {
    if (!localParticipant) return;
    void localParticipant.setMicrophoneEnabled(false).catch(() => {});
  }, [localParticipant]);

  // Partition participants into speakers / audience using permissions.
  // The local participant is handled separately so we never render it in
  // both the speaker grid and the audience section.
  const localIdentityKey = localParticipant?.identity || identity;
  const remoteParticipants = participants.filter(
    (p) => !(p as { isLocal?: boolean }).isLocal && p.identity !== localIdentityKey
  );

  const speakers: Participant[] = [];
  const audience: Participant[] = [];
  for (const p of remoteParticipants) {
    if (canPublishFor(p)) speakers.push(p);
    else audience.push(p);
  }

  const localOnStage =
    isHost || role === 'host' || canPublishFor(localParticipant);
  if (localOnStage && localParticipant) {
    // Render the local user at the top of the stage grid with the known
    // identity (the LiveKit local participant may have an empty identity
    // before the room fully connects).
    speakers.unshift(localParticipant);
  }

  const bottomRole: BottomRole = useMemo(() => {
    if (isHost) return 'host';
    if (localOnStage) return 'speaker';
    return 'audience';
  }, [isHost, localOnStage]);

  const resolveIdentity = useCallback(
    (p: Participant): string => p.identity || identity,
    [identity]
  );

  const localResolved = mergedProfiles[identity];
  const localHandle = localResolved?.handle;
  const localAvatar = localResolved?.avatarUrl ?? null;
  const localName =
    localResolved?.displayName ??
    displayName ??
    (localHandle ? `@${localHandle}` : 'You');

  const displayFor = useCallback(
    (p: Participant): string => {
      const id = resolveIdentity(p);
      const isLocal = id === localIdentityKey;
      const profile = mergedProfiles[id];
      const fallback = isLocal
        ? displayName ?? undefined
        : (p as { name?: string }).name ?? undefined;
      const display = profile?.displayName?.trim() || fallback?.trim();
      if (display && !display.startsWith('did:')) return display;
      if (profile?.handle && !profile.handle.startsWith('did:')) {
        return `@${profile.handle}`;
      }
      if (isLocal && localHandle) return `@${localHandle}`;
      return id.startsWith('did:') ? 'Listener' : id;
    },
    [displayName, identity, localHandle, localIdentityKey, mergedProfiles, resolveIdentity]
  );

  const handleFor = useCallback(
    (p: Participant): string | undefined => {
      const id = resolveIdentity(p);
      return mergedProfiles[id]?.handle;
    },
    [identity, mergedProfiles, resolveIdentity]
  );

  const avatarFor = useCallback(
    (p: Participant): string | null | undefined => {
      const id = resolveIdentity(p);
      return mergedProfiles[id]?.avatarUrl ?? null;
    },
    [identity, mergedProfiles, resolveIdentity]
  );

  const isLocalParticipant = useCallback(
    (p: Participant): boolean => resolveIdentity(p) === localIdentityKey,
    [localIdentityKey, resolveIdentity]
  );

  const listenerCount = audience.length + speakers.length;

  const navAvatar = (
    <div className="flex items-center gap-2" data-testid="nav-avatar">
      <div
        ref={localAvatarRef}
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[var(--color-accent-700)] ring-1 ring-[var(--color-neutral-800)]"
        data-testid="nav-avatar-tile"
        data-local-avatar="true"
      >
        {localAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={localAvatar}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-[10px] font-semibold text-[var(--color-accent-100)]">
            YOU
          </span>
        )}
      </div>
      <span className="hidden text-sm text-[var(--color-neutral-300)] sm:inline">
        {localName}
      </span>
    </div>
  );

  const onStageSection = (
    <section
      className="flex flex-col gap-3"
      data-testid="on-stage-section"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-neutral-400)]">
        On stage
      </h2>
      {speakers.length === 0 ? (
        <p
          className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-divider)] bg-[var(--color-surface)]/40 p-4 text-sm text-[var(--color-neutral-500)]"
          data-testid="on-stage-empty"
        >
          No speakers yet.
        </p>
      ) : (
        <div
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
          data-testid="speakers-grid"
        >
          {speakers.map((p) => {
            const id = resolveIdentity(p);
            const isLocal = isLocalParticipant(p);
            return (
              <SpeakerCard
                key={id}
                identity={id}
                name={displayFor(p)}
                handle={handleFor(p)}
                avatarUrl={avatarFor(p)}
                isHost={isHost && isLocal}
                isHostCard={isHost && !isLocal}
                isLocal={isLocal}
                isMuted={!p.isMicrophoneEnabled}
                isSpeaking={p.isSpeaking}
                avatarRef={isLocal ? localAvatarRef : undefined}
                onMuteToggle={
                  hostActions?.onMuteToggle
                    ? () =>
                        hostActions.onMuteToggle!(
                          id,
                          !p.isMicrophoneEnabled
                        )
                    : undefined
                }
                onRemoveFromStage={
                  hostActions?.onRemoveFromStage
                    ? () => hostActions.onRemoveFromStage!(id)
                    : undefined
                }
                onBlock={
                  hostActions?.onBlock
                    ? () => hostActions.onBlock!(id)
                    : undefined
                }
              />
            );
          })}
        </div>
      )}
    </section>
  );

  const audienceSection = isHost ? (
    <section
      className="flex flex-col gap-3"
      data-testid="audience-section"
      data-view="rows"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-neutral-400)]">
        Listening · {audience.length}
      </h2>
      <AudienceRows
        audience={audience.map<AudienceMember>((p) => ({
          identity: resolveIdentity(p),
          name: displayFor(p),
          handle: handleFor(p),
          avatarUrl: avatarFor(p) ?? null,
        }))}
        invitedSet={invitedSet}
        onInvite={async (target) => {
          setInvitedSet((prev) => {
            if (prev.has(target)) return prev;
            const next = new Set(prev);
            next.add(target);
            return next;
          });
          try {
            await hostActions?.onInvite?.(target);
          } catch {
            setInvitedSet((prev) => {
              const next = new Set(prev);
              next.delete(target);
              return next;
            });
          }
        }}
      />
    </section>
  ) : (
    <section
      className="flex flex-col gap-3"
      data-testid="audience-section"
      data-view="bubbles"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-neutral-400)]">
        Listening · {audience.length + 1}
      </h2>
      <AudienceBubbles
        localIdentity={localIdentityKey}
        localName={localName}
        localHandle={localHandle}
        localAvatarUrl={localAvatar ?? null}
        localAvatarRef={localAvatarRef}
        audience={audience.map<AudienceMember>((p) => ({
          identity: resolveIdentity(p),
          name: displayFor(p),
          handle: handleFor(p),
          avatarUrl: avatarFor(p) ?? null,
        }))}
      />
    </section>
  );

  return (
    <>
      <HostAutoUnmute role={role} />
      <StageControls {...stageControlsProps} />
      {stageSlot}
      <NocturneShell
        navAvatar={navAvatar}
        header={
          <RoomHeader
            title={title}
            host={host}
            listenerCount={listenerCount}
            shareableUrl={shareableUrl}
          />
        }
        main={
          <div className="flex flex-col gap-6">
            {pendingInvite ? (
              <StageInviteToast
                hostName={pendingInvite.hostName}
                busy={inviteBusy}
                onAccept={onAcceptInvite}
                onDecline={onDeclineInvite}
              />
            ) : null}
            {onStageSection}
            {audienceSection}
          </div>
        }
        sidebar={
          <RoomSidebar
            spaceId={spaceId}
            isHost={isHost}
            isLive={isLive}
            onLiveChange={onLiveChange}
            posts={posts}
            postsError={postsError}
            onPostAdded={onPostAdded}
            recording={recording}
          />
        }
        bottomBar={
          <BottomControlBar
            role={bottomRole}
            micOn={micOn}
            onMicToggle={onMicToggle}
            onLeave={handleLeave}
            onStepDown={onStepDown}
            onReact={onReact}
            handRaised={handRaised}
            onToggleHand={toggleHand}
          />
        }
      />
      {floatingReactions.map((r) => (
        <FloatingReaction
          key={r.id}
          id={r.id}
          emoji={r.emoji}
          x={r.x}
          y={r.y}
          onDone={removeFloatingReaction}
        />
      ))}
    </>
  );
}

export function SpaceRoom({
  token,
  wsUrl,
  role,
  identity,
  displayName,
  handle,
  avatarUrl,
  onLeave,
  stageSlot,
  isHost = false,
  hostActions,
  title,
  host,
  shareableUrl,
  posts,
  postsError,
  onPostAdded,
  isLive,
  onLiveChange,
  spaceId,
  recording,
}: SpaceRoomProps): ReactElement {
  const roomOptions = useMemo(
    () => ({
      adaptiveStream: true,
      dynacast: true,
    }),
    []
  );

  const room = useMemo(() => new Room(roomOptions), [roomOptions]);
  const reactionId = useId();

  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [handRaised, setHandRaised] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<
    FloatingReactionState[]
  >([]);
  const [pendingInvite, setPendingInvite] = useState<{
    hostName?: string;
  } | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  const toggleHand = useCallback(() => setHandRaised((v) => !v), []);

  const handleConnected = useCallback(() => {
    setConnectionError(null);
  }, []);

  const handleDisconnected = useCallback(() => {
    // Intentionally a no-op: parent owns the leave decision.
  }, []);

  const handleError = useCallback((err: Error) => {
    setConnectionError(err?.message ?? 'Connection error.');
    // eslint-disable-next-line no-console
    console.error('[SpaceRoom] LiveKit error:', err);
  }, []);

  const handleLeave = useCallback(() => {
    try {
      room.disconnect();
    } catch {
      /* swallow */
    }
    onLeave?.();
  }, [onLeave, room]);

  useEffect(() => {
    const logState = (state: string): void => {
      // eslint-disable-next-line no-console
      console.info('[SpaceRoom] connection state:', state);
    };
    logState('init');
    const onConnected = (): void => logState('connected');
    const onDisconnected = (): void => logState('disconnected');
    const onReconnecting = (): void => logState('reconnecting');
    const onReconnected = (): void => logState('reconnected');
    room.on('connected', onConnected);
    room.on('disconnected', onDisconnected);
    room.on('reconnecting', onReconnecting);
    room.on('reconnected', onReconnected);
    return () => {
      room.off('connected', onConnected);
      room.off('disconnected', onDisconnected);
      room.off('reconnecting', onReconnecting);
      room.off('reconnected', onReconnected);
    };
  }, [room]);

  // Pre-seed the profile map with the locally-known handle so the host
  // header can render a friendly label immediately.
  const seededProfiles = useMemo<ResolvedProfileMap>(() => {
    if (!handle && !avatarUrl && !displayName) return {};
    return {
      [identity]: {
        handle: handle ?? undefined,
        avatarUrl: avatarUrl ?? null,
        displayName: displayName ?? null,
      },
    };
  }, [avatarUrl, displayName, handle, identity]);

  const profiles = useResolvedProfiles([identity]);

  const mergedProfiles = useMemo<ResolvedProfileMap>(() => {
    const next: ResolvedProfileMap = { ...profiles, ...seededProfiles };
    const seeded = seededProfiles[identity];
    if (seeded) {
      const current = next[identity] ?? {};
      next[identity] = {
        handle: current.handle ?? seeded.handle,
        displayName: current.displayName ?? seeded.displayName,
        avatarUrl:
          (current.avatarUrl && current.avatarUrl.length > 0
            ? current.avatarUrl
            : null) ?? seeded.avatarUrl ?? null,
      };
    }
    return next;
  }, [identity, profiles, seededProfiles]);

  const removeFloatingReaction = useCallback((id: string) => {
    setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleReact = useCallback(
    (emoji: string) => {
      const el = document.querySelector<HTMLElement>('[data-local-avatar="true"]');
      let x = window.innerWidth / 2;
      let y = window.innerHeight / 2;
      if (el) {
        const rect = el.getBoundingClientRect();
        x = rect.left + rect.width / 2;
        y = rect.top;
      }
      const id = `${reactionId}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}`;
      setFloatingReactions((prev) => [...prev, { id, emoji, x, y }]);
    },
    [reactionId]
  );

  // StageControls renders no visible DOM but bridges useSpaceState to the
  // parent via callbacks. The pending-invite toast is owned by StageControls
  // (rendered via React portal to document.body) so SpaceRoom itself stays
  // free of accept/decline logic.
  const stageControlsProps: StageControlsProps = useMemo(
    () => ({
      spaceId,
      identity,
      displayName: displayName ?? (handle ? `@${handle}` : identity),
      role: isHost || role === 'host' ? 'host' : 'audience',
      onTokenRefresh: () => {
        // No-op at the SpaceRoom level. The parent (SpacePageClient) owns
        // the join token; if promotion requires a token rotation it
        // should re-issue the token via its own pipeline.
      },
      onInvitePending: (hostName) => {
        setPendingInvite((prev) => prev ?? { hostName });
      },
      onInviteResolved: () => {
        setPendingInvite(null);
        setInviteBusy(false);
      },
    }),
    [displayName, handle, identity, isHost, role, spaceId]
  );

  const handleAcceptInvite = useCallback(async () => {
    setInviteBusy(true);
    const bus = getStageControlsBus();
    if (bus) await bus.accept();
    setPendingInvite(null);
    setInviteBusy(false);
  }, []);

  const handleDeclineInvite = useCallback(async () => {
    const bus = getStageControlsBus();
    if (bus) await bus.decline();
    setPendingInvite(null);
    setInviteBusy(false);
  }, []);

  return (
    <div
      className="flex flex-col"
      data-testid="space-room"
      data-role={role}
    >
      {connectionError ? (
        <div
          role="alert"
          className="mx-auto my-3 max-w-md rounded-md border border-red-700 bg-red-900/30 px-3 py-2 text-xs text-red-200"
          data-testid="space-room-error"
        >
          {connectionError}
        </div>
      ) : null}

      <LiveKitRoom
        room={room}
        token={token}
        serverUrl={wsUrl}
        connect={true}
        audio={true}
        video={false}
        onConnected={handleConnected}
        onDisconnected={handleDisconnected}
        onError={handleError}
        data-lk-theme="default"
      >
        <Inner
          identity={identity}
          displayName={displayName}
          isHost={isHost}
          hostActions={hostActions}
          mergedProfiles={mergedProfiles}
          handleLeave={handleLeave}
          role={role}
          title={title}
          host={host}
          shareableUrl={shareableUrl}
          posts={posts}
          postsError={postsError}
          onPostAdded={onPostAdded}
          isLive={isLive}
          onLiveChange={onLiveChange}
          spaceId={spaceId}
          recording={recording ?? null}
          handRaised={handRaised}
          toggleHand={toggleHand}
          onReact={handleReact}
          floatingReactions={floatingReactions}
          removeFloatingReaction={removeFloatingReaction}
          pendingInvite={pendingInvite}
          inviteBusy={inviteBusy}
          onAcceptInvite={handleAcceptInvite}
          onDeclineInvite={handleDeclineInvite}
          stageSlot={stageSlot}
          stageControlsProps={stageControlsProps}
        />
      </LiveKitRoom>
    </div>
  );
}

export default SpaceRoom;
