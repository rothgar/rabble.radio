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
  RoomAudioRenderer,
  useLocalParticipant,
  useParticipants,
  useTracks,
} from '@livekit/components-react';
import type { Participant } from 'livekit-client';
import { Room, RoomEvent, Track } from 'livekit-client';
import { PreShowMusic } from '@/components/PreShowMusic';
import { useRoomContext } from '@livekit/components-react';
import { NocturneShell } from '@/components/NocturneShell';
import { RoomHeader } from '@/components/RoomHeader';
import { SpeakerCard } from '@/components/SpeakerCard';
import { AudienceBubbles, type AudienceMember } from '@/components/AudienceBubbles';
import { AudienceRows } from '@/components/AudienceRows';
import { RoomSidebar, type PublicRecording } from '@/components/RoomSidebar';
import { BottomControlBar } from '@/components/BottomControlBar';
import { ShareButtons } from '@/components/ShareButtons';
import { FloatingReaction } from '@/components/FloatingReaction';
import { FeedbackButton } from '@/components/FeedbackButton';
import { setRoomSnapshot } from '@/lib/diagnostics';
import { StageInviteToast } from '@/components/StageInviteToast';
import { StageControls, type StageControlsProps, getStageControlsBus } from '@/components/StageControls';
import type { ShowDetails } from '@/components/ShowDetailsForm';
import type { PublicSpacePost } from '@/lib/posts';
import { isAnonymousIdentity } from '@/lib/anonymous';

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
  /**
   * True when the local user joined without an account. Anonymous listeners
   * hear the room and count toward the listener total but are never rendered
   * as participants and cannot raise a hand.
   */
  anonymous?: boolean;
  /**
   * STUN/TURN servers minted for this join. When present they replace the
   * SFU's own ICE server list so listeners outside the homelab LAN can relay
   * media through Cloudflare TURN.
   */
  iceServers?: RTCIceServer[];
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
  /** Description and station topics; editable by the host from the sidebar. */
  description?: string | null;
  tags?: string[];
  /** Called when the host saves new details, or another client broadcasts them. */
  onSpaceUpdated?: (details: ShowDetails) => void;
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
  /** Pre-show music mood id (null for silence). */
  musicMood?: string | null;
  /** Host only: persist a new mood. */
  onMusicMoodChange?: (mood: string | null) => Promise<void> | void;
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
    () =>
      Array.from(new Set(identities.filter((id) => !isAnonymousIdentity(id))))
        .sort()
        .join('|'),
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

/** A `reaction` data message from POST /api/spaces/[id]/reactions. */
export interface RemoteReaction {
  did: string;
  emoji: string;
  handle?: string;
  displayName?: string | null;
  avatarUrl?: string | null;
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
function HostAutoUnmute({
  role,
  onError,
}: {
  role: SpaceRole;
  onError?: (err: Error) => void;
}): null {
  const { localParticipant } = useLocalParticipant();
  const enabledRef = useRef(false);

  useEffect(() => {
    if (role !== 'host') return;
    if (enabledRef.current) return;
    if (!localParticipant) return;
    enabledRef.current = true;
    void localParticipant.setMicrophoneEnabled(true).catch((err: unknown) => {
      enabledRef.current = false;
      onError?.(err instanceof Error ? err : new Error('Microphone access denied.'));
    });
  }, [localParticipant, onError, role]);

  return null;
}

/**
 * RoomSync: keeps the room UI in step with server-side state changes.
 *
 *  - `on_air_changed` data messages (sent by POST /api/spaces/[id]/live)
 *    flip the on-air flag for everyone without a reload.
 *  - `space_updated` data messages (PATCH /api/spaces/[id]) carry the new
 *    title / description / tags.
 *  - As a fallback for listeners, a local permission change that grants
 *    `canSubscribe` means the host went on air (and vice versa).
 */
function RoomSync({
  spaceId,
  isHost,
  onLiveChange,
  onSpaceUpdated,
  onRemoteReaction,
}: {
  spaceId: string;
  isHost: boolean;
  onLiveChange: (next: boolean) => void;
  onSpaceUpdated?: (details: ShowDetails) => void;
  onRemoteReaction?: (reaction: RemoteReaction) => void;
}): null {
  const room = useRoomContext();

  useEffect(() => {
    if (!room) return;
    const onData = (payload: Uint8Array): void => {
      let parsed: { type?: string; spaceId?: string; onAir?: boolean } & Partial<ShowDetails> &
        Partial<RemoteReaction>;
      try {
        parsed = JSON.parse(new TextDecoder().decode(payload));
      } catch {
        return;
      }
      if (!parsed || parsed.spaceId !== spaceId) return;
      if (parsed.type === 'on_air_changed' && typeof parsed.onAir === 'boolean') {
        onLiveChange(parsed.onAir);
      } else if (parsed.type === 'space_updated' && typeof parsed.title === 'string') {
        onSpaceUpdated?.({
          title: parsed.title,
          description: parsed.description ?? null,
          tags: Array.isArray(parsed.tags) ? parsed.tags : [],
          musicMood:
            parsed.musicMood === undefined ? undefined : typeof parsed.musicMood === 'string' ? parsed.musicMood : null,
        });
      } else if (
        parsed.type === 'reaction' &&
        typeof parsed.did === 'string' &&
        typeof parsed.emoji === 'string'
      ) {
        onRemoteReaction?.({
          did: parsed.did,
          emoji: parsed.emoji,
          handle: parsed.handle,
          displayName: parsed.displayName ?? null,
          avatarUrl: parsed.avatarUrl ?? null,
        });
      }
    };
    const onPermissions = (
      _prev: unknown,
      participant: { isLocal?: boolean; permissions?: { canSubscribe?: boolean; canPublish?: boolean } }
    ): void => {
      if (isHost || !participant?.isLocal) return;
      const perms = participant.permissions;
      if (!perms || perms.canPublish) return; // stage members always subscribe
      if (typeof perms.canSubscribe === 'boolean') onLiveChange(perms.canSubscribe);
    };
    room.on(RoomEvent.DataReceived, onData);
    room.on(RoomEvent.ParticipantPermissionsChanged, onPermissions);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
      room.off(RoomEvent.ParticipantPermissionsChanged, onPermissions);
    };
  }, [isHost, onLiveChange, onRemoteReaction, onSpaceUpdated, room, spaceId]);

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
  anonymous: boolean;
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
  description: string | null;
  tags: string[];
  onSpaceUpdated?: (details: ShowDetails) => void;
  onAirBusy: boolean;
  onAirError: string | null;
  onToggleOnAir: () => void;
  spaceId: string;
  recording: PublicRecording | null;
  handRaised: boolean;
  toggleHand: () => void;
  onReact: (emoji: string) => void;
  onRemoteReaction: (reaction: RemoteReaction) => void;
  floatingReactions: FloatingReactionState[];
  removeFloatingReaction: (id: string) => void;
  pendingInvite: { hostName?: string } | null;
  inviteBusy: boolean;
  onAcceptInvite: () => void;
  onDeclineInvite: () => void;
  stageSlot?: ReactNode;
  stageControlsProps: StageControlsProps;
  onMicError?: (err: Error) => void;
  musicMood: string | null;
  onMusicMoodChange?: (mood: string | null) => Promise<void> | void;
}

function Inner({
  identity,
  displayName,
  isHost,
  anonymous,
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
  description,
  tags,
  onSpaceUpdated,
  onAirBusy,
  onAirError,
  onToggleOnAir,
  spaceId,
  recording,
  handRaised,
  toggleHand,
  onReact,
  onRemoteReaction,
  floatingReactions,
  removeFloatingReaction,
  pendingInvite,
  inviteBusy,
  onAcceptInvite,
  onDeclineInvite,
  stageSlot,
  stageControlsProps,
  onMicError,
  musicMood,
  onMusicMoodChange,
}: InnerProps): ReactElement {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  // Music plays while nobody else is sending audio: the show is off air, or
  // it is on air but no remote microphone is published (the demo shows).
  const micTracks = useTracks([Track.Source.Microphone], { onlySubscribed: false });
  const remoteAudioCount = micTracks.filter(
    (t) => t.publication && !(t.participant as { isLocal?: boolean }).isLocal
  ).length;
  const musicActive = Boolean(musicMood) && (!isLive || remoteAudioCount === 0);
  const localAvatarRef = useRef<HTMLDivElement | null>(null);
  const [micOn, setMicOn] = useState<boolean>(
    Boolean(localParticipant?.isMicrophoneEnabled)
  );
  const [invitedSet, setInvitedSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    setMicOn(Boolean(localParticipant?.isMicrophoneEnabled));
  }, [localParticipant?.isMicrophoneEnabled]);

  // Keep a snapshot of the room for the feedback button's diagnostics.
  useEffect(() => {
    setRoomSnapshot({
      spaceId,
      role: isHost ? 'host' : role,
      connected: Boolean(localParticipant),
      onAir: isLive,
      micOn,
      participants: participants.length,
      speakers: participants.filter((p) => canPublishFor(p)).length,
    });
    return () => setRoomSnapshot(null);
  }, [isHost, isLive, localParticipant, micOn, participants, role, spaceId]);

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

  // Anonymous listeners (identity `anon:…`) are counted but never rendered.
  const speakers: Participant[] = [];
  const audience: Participant[] = [];
  let anonymousListeners = 0;
  for (const p of remoteParticipants) {
    if (isAnonymousIdentity(p.identity)) anonymousListeners++;
    else if (canPublishFor(p)) speakers.push(p);
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

  // Everyone in the room, including anonymous listeners and the local user
  // when they are an anonymous listener themselves.
  const listenerCount =
    audience.length + speakers.length + anonymousListeners + (anonymous ? 1 : 0);
  const anonymousNote =
    anonymousListeners > 0 ? (
      <p
        className="text-label text-[var(--color-text-tertiary)]"
        data-testid="anonymous-listeners"
      >
        +{anonymousListeners} listening without an account
      </p>
    ) : null;

  const navAvatar = (
    <div className="flex items-center gap-2" data-testid="nav-avatar">
      <div
        ref={localAvatarRef}
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[var(--color-accent-700)] ring-1 ring-[var(--color-neutral-800)]"
        data-testid="nav-avatar-tile"
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
          className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-divider)] bg-[var(--color-surface-translucent)] p-4 text-sm text-[var(--color-neutral-500)]"
          data-testid="on-stage-empty"
        >
          No speakers yet.
        </p>
      ) : (
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4"
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
        Listening · {audience.length + anonymousListeners}
      </h2>
      {anonymousNote}
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
        Listening · {audience.length + anonymousListeners + 1}
      </h2>
      {anonymousNote}
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

  const preShowBanner = isLive ? null : (
    <section
      className="flex flex-col gap-2 rounded-md border border-[var(--color-accent-700)] bg-[var(--color-accent-muted)] p-4"
      data-testid="pre-show-banner"
      data-role={bottomRole}
    >
      {bottomRole === 'host' ? (
        <>
          <p className="text-title font-semibold text-[var(--color-text)]">You&apos;re off air</p>
          <p className="text-body text-[var(--color-text-secondary)]">
            Right now only you and your co-hosts can hear each other. Share the
            link to invite people, bring co-hosts on stage from the Listening
            list, then press <span className="font-semibold text-[var(--color-text)]">On air</span> when
            you&apos;re ready to go on air.
          </p>
        </>
      ) : bottomRole === 'speaker' ? (
        <>
          <p className="text-title font-semibold text-[var(--color-text)]">You&apos;re on stage, off air</p>
          <p className="text-body text-[var(--color-text-secondary)]">
            You and the host can hear each other. Listeners will hear you once
            the show goes on air.
          </p>
        </>
      ) : (
        <>
          <p className="text-title font-semibold text-[var(--color-text)]">The show hasn&apos;t started yet</p>
          <p className="text-body text-[var(--color-text-secondary)]">
            The host is getting ready. You&apos;ll hear audio as soon as they go
            on air, so stick around.
          </p>
        </>
      )}
    </section>
  );

  return (
    <>
      <HostAutoUnmute role={role} onError={onMicError} />
      <StageControls {...stageControlsProps} />
      <RoomSync
        spaceId={spaceId}
        isHost={isHost}
        onLiveChange={onLiveChange}
        onSpaceUpdated={onSpaceUpdated}
        onRemoteReaction={onRemoteReaction}
      />
      {stageSlot}
      <NocturneShell
        navAvatar={navAvatar}
        header={
          <RoomHeader
            title={title}
            host={host}
            listenerCount={listenerCount}
            onAir={isLive}
            trailing={<FeedbackButton variant="icon" spaceId={spaceId} />}
          />
        }
        main={
          <div className="flex flex-col gap-6">
            {onAirError ? (
              <p
                role="alert"
                className="rounded-sm border border-[var(--color-live-border)] bg-[var(--color-live-muted)] px-3 py-2 text-label text-[var(--color-live)]"
                data-testid="on-air-error"
              >
                {onAirError}
              </p>
            ) : null}
            {musicMood || (isHost && !isLive) ? (
              <PreShowMusic
                spaceId={spaceId}
                moodId={musicMood}
                active={musicActive}
                isHost={isHost && !isLive}
                onMoodChange={onMusicMoodChange}
              />
            ) : null}
            {preShowBanner}
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
            <div
              className="flex flex-col gap-3 rounded-lg border border-[var(--color-divider)] bg-[var(--color-surface)] p-4 sm:p-6"
              data-testid="room-share-card"
            >
              <p className="text-sm font-semibold text-[var(--color-neutral-400)]">
                {isHost && !isLive ? 'Invite people' : 'Share this show'}
              </p>
              <ShareButtons shareableUrl={shareableUrl} title={title} />
            </div>
          </div>
        }
        sidebar={
          <RoomSidebar
            spaceId={spaceId}
            isHost={isHost}
            title={title}
            description={description}
            tags={tags}
            onSpaceUpdated={onSpaceUpdated}
            posts={posts}
            postsError={postsError}
            onPostAdded={onPostAdded}
            recording={recording}
          />
        }
        bottomBar={
          <BottomControlBar
            role={bottomRole}
            anonymous={anonymous}
            signInHref={`/login?next=${encodeURIComponent(`/show/${spaceId}`)}`}
            micOn={micOn}
            onMicToggle={onMicToggle}
            onLeave={handleLeave}
            onStepDown={onStepDown}
            onReact={onReact}
            handRaised={handRaised}
            onToggleHand={toggleHand}
            onAir={isLive}
            onToggleOnAir={isHost ? onToggleOnAir : undefined}
            onAirBusy={onAirBusy}
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
  anonymous = false,
  iceServers,
  hostActions,
  title,
  host,
  shareableUrl,
  posts,
  postsError,
  onPostAdded,
  isLive,
  onLiveChange,
  description = null,
  tags = [],
  onSpaceUpdated,
  spaceId,
  recording,
  musicMood,
  onMusicMoodChange,
}: SpaceRoomProps): ReactElement {
  const roomOptions = useMemo(
    () => ({
      adaptiveStream: true,
      dynacast: true,
      ...(iceServers && iceServers.length > 0
        ? { rtcConfig: { iceServers } }
        : {}),
    }),
    [iceServers]
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

  // On-air toggle (host only). POSTs to the live route; the server flips the
  // audience's subscribe permission and broadcasts `on_air_changed`, but we
  // also update locally so the host's UI responds immediately.
  const [onAirBusy, setOnAirBusy] = useState(false);
  const [onAirError, setOnAirError] = useState<string | null>(null);
  const handleToggleOnAir = useCallback(async () => {
    if (onAirBusy) return;
    setOnAirBusy(true);
    setOnAirError(null);
    try {
      const res = await fetch(`/api/spaces/${encodeURIComponent(spaceId)}/live`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: isLive ? 'end' : 'start' }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok || body.ok === false) {
        setOnAirError(body.message || body.error || `HTTP ${res.status}`);
        return;
      }
      onLiveChange(!isLive);
    } catch (err) {
      setOnAirError(err instanceof Error ? err.message : 'Could not change on-air state.');
    } finally {
      setOnAirBusy(false);
    }
  }, [isLive, onAirBusy, onLiveChange, spaceId]);

  const removeFloatingReaction = useCallback((id: string) => {
    setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
  }, []);

  /**
   * Float an emoji up from someone's avatar in the stage/audience area. If
   * their tile is not on screen (e.g. the grid is still loading) it rises
   * from the bottom centre instead.
   */
  const spawnReaction = useCallback(
    (emoji: string, el: HTMLElement | null) => {
      let x = window.innerWidth / 2;
      let y = window.innerHeight - 120;
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

  const handleReact = useCallback(
    (emoji: string) => {
      spawnReaction(emoji, document.querySelector<HTMLElement>('[data-local-avatar="true"]'));
      // Best-effort: record the reaction server-side so it feeds the show's
      // metrics and is broadcast to the rest of the room. Failures are
      // swallowed — the local emoji already rendered.
      void fetch(`/api/spaces/${encodeURIComponent(spaceId)}/reactions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emoji }),
      }).catch(() => undefined);
    },
    [spaceId, spawnReaction]
  );

  /** Someone else reacted: float it from their avatar. Our own come back too; skip those. */
  const handleRemoteReaction = useCallback(
    (reaction: RemoteReaction) => {
      if (reaction.did === identity) return;
      const el = document.querySelector<HTMLElement>(
        `[data-testid$="-avatar-${CSS.escape(reaction.did)}"]`
      );
      spawnReaction(reaction.emoji, el);
    },
    [identity, spawnReaction]
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
      data-anonymous={anonymous ? 'true' : 'false'}
      data-on-air={isLive ? 'true' : 'false'}
    >
      {connectionError ? (
        <div
          role="alert"
          className="mx-4 my-3 max-w-md rounded-md border border-red-700 bg-red-900/30 px-3 py-2 text-xs text-red-200 sm:mx-auto"
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
        <RoomAudioRenderer />
        <Inner
          musicMood={musicMood ?? null}
          onMusicMoodChange={onMusicMoodChange}
          identity={identity}
          displayName={displayName}
          isHost={isHost}
          anonymous={anonymous}
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
          description={description}
          tags={tags}
          onSpaceUpdated={onSpaceUpdated}
          onAirBusy={onAirBusy}
          onAirError={onAirError}
          onToggleOnAir={() => {
            void handleToggleOnAir();
          }}
          spaceId={spaceId}
          recording={recording ?? null}
          handRaised={handRaised}
          toggleHand={toggleHand}
          onReact={handleReact}
          onRemoteReaction={handleRemoteReaction}
          floatingReactions={floatingReactions}
          removeFloatingReaction={removeFloatingReaction}
          pendingInvite={pendingInvite}
          inviteBusy={inviteBusy}
          onAcceptInvite={handleAcceptInvite}
          onDeclineInvite={handleDeclineInvite}
          stageSlot={stageSlot}
          stageControlsProps={stageControlsProps}
          onMicError={handleError}
        />
      </LiveKitRoom>
    </div>
  );
}

export default SpaceRoom;
