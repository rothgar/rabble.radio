'use client';

// src/components/SpaceRoom.tsx
//
// Full-viewport room UI for the redesigned Nocturne live-room: nav bar,
// two-column content, sticky bottom bar, via NocturneShell, with
// RoomHeader / speaker grid / audience section / RoomSidebar /
// BottomControlBar nested inside. The LiveKit connection itself is owned by
// ActiveRoomProvider (so it survives navigating away from this page); this
// component only consumes the ambient room via useRoomContext().
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
  useLocalParticipant,
  useParticipants,
  useTracks,
} from '@livekit/components-react';
import type { Participant } from 'livekit-client';
import { RoomEvent, Track } from 'livekit-client';
import { PreShowMusic } from '@/components/PreShowMusic';
import { useRoomContext } from '@livekit/components-react';
import { useActiveRoom, type SpaceRole } from '@/components/ActiveRoomProvider';
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
import { ShowEndedFollowPopup } from '@/components/ShowEndedFollowPopup';
import type { ShowDetails } from '@/components/ShowDetailsForm';
import type { PublicSpacePost } from '@/lib/posts';
import { isAnonymousIdentity } from '@/lib/anonymous';

export type { SpaceRole };
export type BottomRole = 'host' | 'speaker' | 'audience';

export interface SpaceRoomProps {
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
  hostActions?: {
    onInvite?: (identity: string) => Promise<void> | void;
    onMuteToggle?: (
      identity: string,
      nextMuted: boolean
    ) => Promise<void> | void;
    onRemoveFromStage?: (identity: string) => Promise<void> | void;
    onRemoveFromSpace?: (identity: string) => Promise<void> | void;
    onBlock?: (identity: string) => Promise<void> | void;
    onReport?: (
      identity: string,
      reason: string,
      handle?: string
    ) => Promise<void> | void;
  };
  onLeave?: () => void;
  /**
   * Reserved slot for any extra children that need access to LiveKit
   * context. Currently unused by the redesigned layout but kept for
   * future host controls that want to live inside the room.
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
    did?: string;
    handle: string;
    displayName?: string | null;
    avatarUrl?: string | null;
  };
  /** Whether the viewer already follows this host (any of their shows). */
  hostSubscribed?: boolean;
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
 * Rooms the host's microphone has already been auto-unmuted for, keyed on
 * the Room instance rather than a per-mount ref: the room now survives
 * SpaceRoom unmounting (it lives in ActiveRoomProvider, see issue #7), so a
 * host who steps away from the studio page and comes back via
 * PersistentShowBar must not have their deliberate mute reversed just
 * because the component remounted.
 */
const autoUnmutedRooms = new WeakSet<object>();

/**
 * HostAutoUnmute: when the role is 'host', enable the local microphone
 * exactly once per connection (not per mount) so the host appears as a live
 * speaker.
 */
function HostAutoUnmute({
  role,
  onError,
}: {
  role: SpaceRole;
  onError?: (err: Error) => void;
}): null {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();

  useEffect(() => {
    if (role !== 'host') return;
    if (autoUnmutedRooms.has(room)) return;
    if (!localParticipant) return;
    autoUnmutedRooms.add(room);
    void localParticipant.setMicrophoneEnabled(true).catch((err: unknown) => {
      autoUnmutedRooms.delete(room);
      onError?.(err instanceof Error ? err : new Error('Microphone access denied.'));
    });
  }, [localParticipant, onError, role, room]);

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
  onAttributesChanged,
}: {
  spaceId: string;
  isHost: boolean;
  onLiveChange: (next: boolean) => void;
  onSpaceUpdated?: (details: ShowDetails) => void;
  onRemoteReaction?: (reaction: RemoteReaction) => void;
  /** A participant changed attributes (raised or lowered a hand). */
  onAttributesChanged?: () => void;
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
    const onAttributes = (): void => onAttributesChanged?.();
    room.on(RoomEvent.DataReceived, onData);
    room.on(RoomEvent.ParticipantPermissionsChanged, onPermissions);
    room.on(RoomEvent.ParticipantAttributesChanged, onAttributes);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
      room.off(RoomEvent.ParticipantPermissionsChanged, onPermissions);
      room.off(RoomEvent.ParticipantAttributesChanged, onAttributes);
    };
  }, [isHost, onAttributesChanged, onLiveChange, onRemoteReaction, onSpaceUpdated, room, spaceId]);

  return null;
}

/**
 * Inner content rendered inside the ambient LiveKit room context. Has
 * access to room context hooks and renders the redesigned grid + bottom bar.
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
  hostSubscribed: boolean;
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
  stageSlot?: ReactNode;
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
  hostSubscribed,
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
  stageSlot,
  onMicError,
  musicMood,
  onMusicMoodChange,
}: InnerProps): ReactElement {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  // Music plays while nobody is sending audio: the show is off air, or it is
  // on air but no microphone (host's own included, so a solo host's device
  // mutes itself the moment it starts broadcasting) is published (the demo
  // shows).
  const micTracks = useTracks([Track.Source.Microphone], { onlySubscribed: false });
  const liveAudioCount = micTracks.filter((t) => Boolean(t.publication)).length;
  const musicActive = Boolean(musicMood) && (!isLive || liveAudioCount === 0);
  const localAvatarRef = useRef<HTMLDivElement | null>(null);
  const [micOn, setMicOn] = useState<boolean>(
    Boolean(localParticipant?.isMicrophoneEnabled)
  );
  const [invitedSet, setInvitedSet] = useState<Set<string>>(new Set());
  // Bumped when any participant's attributes change so raised hands show
  // up without waiting for another participant event.
  const [, setAttributesVersion] = useState(0);
  const onAttributesChanged = useCallback(() => setAttributesVersion((v) => v + 1), []);

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

  // Offer to follow the host the moment the show goes off air, to a
  // listener who was in the room when it happened (not someone who shows
  // up afterwards to a room that was already quiet).
  const wasLiveRef = useRef(isLive);
  const [showFollowPopup, setShowFollowPopup] = useState(false);
  useEffect(() => {
    if (wasLiveRef.current && !isLive && bottomRole === 'audience' && host.did) {
      setShowFollowPopup(true);
    }
    wasLiveRef.current = isLive;
  }, [isLive, bottomRole, host.did]);

  // A hand comes down once its owner is on stage.
  useEffect(() => {
    if (localOnStage && handRaised) toggleHand();
  }, [handRaised, localOnStage, toggleHand]);

  const handFor = useCallback(
    (p: Participant): boolean =>
      (p as { attributes?: Record<string, string> }).attributes?.hand === '1',
    []
  );

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
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[var(--color-ink)] ring-1 ring-[var(--color-border)]"
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
          <span className="text-[10px] font-semibold text-[var(--color-text-on-ink)]">
            YOU
          </span>
        )}
      </div>
      <span className="hidden text-sm text-[var(--color-text-tertiary)] sm:inline">
        {localName}
      </span>
    </div>
  );

  const onStageSection = (
    <section
      className="flex flex-col gap-3"
      data-testid="on-stage-section"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
        On stage
      </h2>
      {speakers.length === 0 ? (
        <p
          className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-divider)] bg-[var(--color-surface-translucent)] p-4 text-sm text-[var(--color-text-secondary)]"
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
                onReport={
                  hostActions?.onReport
                    ? (reason) => hostActions.onReport!(id, reason, handleFor(p))
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
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
        Listening · {audience.length + anonymousListeners}
      </h2>
      {anonymousNote}
      <AudienceRows
        audience={audience.map<AudienceMember>((p) => ({
          identity: resolveIdentity(p),
          name: displayFor(p),
          handle: handleFor(p),
          avatarUrl: avatarFor(p) ?? null,
          handRaised: handFor(p),
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
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
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
          handRaised: handFor(p),
        }))}
      />
    </section>
  );

  const preShowBanner = isLive ? null : (
    <section
      className="flex flex-col gap-2 rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-muted)] p-4"
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
      <RoomSync
        spaceId={spaceId}
        isHost={isHost}
        onLiveChange={onLiveChange}
        onSpaceUpdated={onSpaceUpdated}
        onRemoteReaction={onRemoteReaction}
        onAttributesChanged={onAttributesChanged}
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
            {preShowBanner}
            {onStageSection}
            {audienceSection}
            {musicMood || (isHost && !isLive) ? (
              <PreShowMusic
                spaceId={spaceId}
                moodId={musicMood}
                active={musicActive}
                isHost={isHost && !isLive}
                onMoodChange={onMusicMoodChange}
              />
            ) : null}
            <div
              className="flex flex-col gap-3 rounded-lg border border-[var(--color-divider)] bg-[var(--color-surface)] p-4 sm:p-6"
              data-testid="room-share-card"
            >
              <p className="text-sm font-semibold text-[var(--color-text-tertiary)]">
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
            isLive={isLive}
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
            lastOnStage={isLive && localOnStage && speakers.length <= 1}
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
      {showFollowPopup && host.did ? (
        <ShowEndedFollowPopup
          hostDid={host.did}
          hostName={host.displayName?.trim() || `@${host.handle}`}
          isAuthenticated={!anonymous}
          following={hostSubscribed}
          loginNext={`/show/${spaceId}`}
          onClose={() => setShowFollowPopup(false)}
        />
      ) : null}
    </>
  );
}

export function SpaceRoom({
  role,
  identity,
  displayName,
  handle,
  avatarUrl,
  onLeave,
  stageSlot,
  isHost = false,
  anonymous = false,
  hostActions,
  title,
  host,
  hostSubscribed = false,
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
  // The connection itself is owned by ActiveRoomProvider (mounted in the
  // root layout) so it survives navigating away from this page; this
  // component only consumes the ambient room it already connected.
  const room = useRoomContext();
  const { connectionError: joinError, leave: leaveActiveRoom } =
    useActiveRoom();
  const reactionId = useId();

  const [micError, setMicError] = useState<string | null>(null);
  const [handRaised, setHandRaised] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<
    FloatingReactionState[]
  >([]);

  /**
   * The raised hand is a LiveKit participant attribute (`hand: "1"`), so
   * the host and everyone else see it, including people who join later.
   */
  const setHand = useCallback(
    (next: boolean) => {
      setHandRaised(next);
      const local = room.localParticipant as {
        setAttributes?: (attrs: Record<string, string>) => Promise<void>;
      };
      void local.setAttributes?.({ hand: next ? '1' : '' }).catch(() => {});
    },
    [room]
  );
  const toggleHand = useCallback(() => setHand(!handRaised), [handRaised, setHand]);

  const handleError = useCallback((err: Error) => {
    setMicError(err?.message ?? 'Microphone error.');
    // eslint-disable-next-line no-console
    console.error('[SpaceRoom] LiveKit error:', err);
  }, []);

  const handleLeave = useCallback(() => {
    leaveActiveRoom();
    onLeave?.();
  }, [onLeave, leaveActiveRoom]);

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
        // A tile at the top of the viewport has no room above it for the
        // chip to rise through; those reactions float up from the bottom.
        if (rect.top >= 240 && rect.top <= window.innerHeight) {
          x = rect.left + rect.width / 2;
          y = rect.top;
        }
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

  return (
    <div
      className="flex flex-col"
      data-testid="space-room"
      data-role={role}
      data-anonymous={anonymous ? 'true' : 'false'}
      data-on-air={isLive ? 'true' : 'false'}
    >
      {joinError || micError ? (
        <div
          role="alert"
          className="mx-4 my-3 max-w-md rounded-md border border-[var(--color-error)] bg-[var(--color-error-muted)] px-3 py-2 text-xs text-[var(--color-error-text)] sm:mx-auto"
          data-testid="space-room-error"
        >
          {joinError ?? micError}
        </div>
      ) : null}

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
        hostSubscribed={hostSubscribed}
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
        stageSlot={stageSlot}
        onMicError={handleError}
      />
    </div>
  );
}

export default SpaceRoom;
