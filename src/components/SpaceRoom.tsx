'use client';

// src/components/SpaceRoom.tsx
//
// LiveKit room wrapper. Receives the token + wsUrl from the join API and
// connects an audio-only room. Renders the participant grid + local mic
// controls.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import {
  LiveKitRoom,
  useLocalParticipant,
  useParticipants,
} from '@livekit/components-react';
import { Room } from 'livekit-client';
import { AudioParticipant, type AudioParticipantTileData } from '@/components/AudioParticipant';
import { LocalAudioControls } from '@/components/LocalAudioControls';

export type SpaceRole = 'host' | 'audience';

export interface SpaceRoomProps {
  token: string;
  wsUrl: string;
  role: SpaceRole;
  identity: string;
  displayName?: string;
  onLeave?: () => void;
  /**
   * Optional element rendered inside LiveKitRoom (so children can use
   * useRoomContext). Used by SpacePageClient to mount StageManager,
   * AudienceList and StageRequestToast.
   */
  stageSlot?: ReactNode;
  /**
   * When true, this user is the host of the space. The participant grid
   * exposes per-tile host action menus (mute, kick, block, invite).
   */
  isHost?: boolean;
  /**
   * Optional callbacks wired from the parent so host actions can fan out
   * to the stage endpoint. See HostActionMenu for the contract.
   */
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
  /**
   * Optional Bluesky handle for the local user (without the "@"). When
   * provided the host/audience header uses it as a friendly fallback so
   * we never surface a raw `did:plc:...` string while the /api/users
   * request is in flight.
   */
  handle?: string;
  /**
   * Optional avatar URL for the local user. Stored alongside the resolved
   * profiles so future tile enhancements can use it without an extra
   * round-trip.
   */
  avatarUrl?: string | null;
}

interface RoomGridProps {
  identity: string;
  displayName?: string;
  isHost: boolean;
  hostActions: SpaceRoomProps['hostActions'];
  /**
   * Pre-resolved profiles keyed by DID. The outer SpaceRoom fetches
   * these once and shares them so the host tile and the participant
   * grid render consistent labels.
   */
  profiles: Record<string, AudioParticipantTileData>;
}

export type ResolvedProfileMap = Record<string, AudioParticipantTileData>;

/**
 * Fetch user profile metadata for any DIDs we don't already have cached.
 * The endpoint is `/api/users?identities=...` which mirrors the
 * `AudioParticipantTileData` shape (handle, avatarUrl, displayName).
 *
 * Identities that fail to resolve simply stay out of the map; callers
 * fall back to the LiveKit-provided `name` and the raw identity.
 */
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

/**
 * Pick a human-friendly label for a DID. Prefers an explicit display name,
 * then the resolved handle (always prefixed with `@`), and finally falls
 * back to the raw identity. Crucially this function refuses to surface
 * `did:plc:` strings as a label when a better option is available.
 */
export function friendlyLabelFor(
  identity: string,
  profile: AudioParticipantTileData | undefined,
  fallbackName?: string
): string {
  const display = profile?.displayName?.trim() || fallbackName?.trim();
  if (display && !display.startsWith('did:')) return display;
  const handle = profile?.handle?.trim();
  if (handle && !handle.startsWith('did:')) return `@${handle}`;
  // Last resort: don't leak the raw DID. If we genuinely have no profile
  // we return a stable placeholder.
  return identity.startsWith('did:') ? 'You' : identity;
}

/**
 * Resolve the currently-displayed stage role for a participant. Speakers
 * are participants who publish their microphone (publish perms enabled).
 * Audience are participants without publish rights. The host's local
 * participant always reports as a speaker.
 */
function resolveParticipantMode(
  identity: string,
  isLocal: boolean,
  canPublish: boolean
): 'speaker' | 'audience' {
  if (isLocal) return 'speaker';
  return canPublish ? 'speaker' : 'audience';
}

function RoomGrid({
  identity,
  displayName,
  isHost,
  hostActions,
  profiles,
}: RoomGridProps): ReactElement {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();

  const onLocalMuteToggle = useCallback(async () => {
    if (!localParticipant) return;
    try {
      const next = !localParticipant.isMicrophoneEnabled;
      await localParticipant.setMicrophoneEnabled(next);
    } catch {
      // Best-effort: the LocalAudioControls button remains available.
    }
  }, [localParticipant]);

  return (
    <div
      className="grid gap-3 sm:grid-cols-2"
      data-testid="participants-grid"
    >
      {participants.length === 0 ? (
        <p className="col-span-full text-sm text-slate-400">
          Waiting for others to join…
        </p>
      ) : null}
      {participants.map((p) => {
        const isLocal = p.identity === identity;
        const isMuted = !p.isMicrophoneEnabled;
        const isSpeaking = p.isSpeaking;
        const profile = profiles[p.identity];
        const mode = resolveParticipantMode(p.identity, isLocal, !isMuted);
        // Prefer resolved handle / displayName from the users endpoint,
        // fall back to the LiveKit-provided name / identity.
        const resolvedHandle = profile?.handle ?? p.identity;
        const resolvedName =
          profile?.displayName ?? (isLocal ? displayName : undefined) ?? p.name ?? resolvedHandle;
        return (
          <AudioParticipant
            key={p.identity}
            identity={p.identity}
            did={p.identity}
            name={resolvedName}
            handle={profile?.handle}
            avatarUrl={profile?.avatarUrl ?? null}
            isMuted={isMuted}
            isSpeaking={isSpeaking}
            isLocal={isLocal}
            isHost={isHost}
            mode={mode}
            onInvite={hostActions?.onInvite ? () => hostActions.onInvite!(p.identity) : undefined}
            onMuteToggle={hostActions?.onMuteToggle ? () => hostActions.onMuteToggle!(p.identity, isMuted) : undefined}
            onRemoveFromStage={hostActions?.onRemoveFromStage ? () => hostActions.onRemoveFromStage!(p.identity) : undefined}
            onRemoveFromSpace={hostActions?.onRemoveFromSpace ? () => hostActions.onRemoveFromSpace!(p.identity) : undefined}
            onBlock={hostActions?.onBlock ? () => hostActions.onBlock!(p.identity) : undefined}
            onLocalMuteToggle={isLocal ? () => void onLocalMuteToggle() : undefined}
          />
        );
      })}
    </div>
  );
}

/**
 * HostAutoUnmute: when the role is 'host', enable the local microphone
 * exactly once after the room connects so the host appears as a live
 * speaker rather than a muted presence on the stage.
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
      // If enabling fails (permission denied, no device, etc.) the user
      // can still toggle manually via LocalAudioControls.
      enabledRef.current = false;
    });
  }, [localParticipant, role]);

  return null;
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
}: SpaceRoomProps): ReactElement {
  const roomOptions = useMemo(
    () => ({
      // Audio-only: don't publish camera / screenshare.
      adaptiveStream: true,
      dynacast: true,
    }),
    []
  );

  // Build a Room instance once so the same room is reused between renders.
  const room = useMemo(() => new Room(roomOptions), [roomOptions]);

  const [connectionError, setConnectionError] = useState<string | null>(null);

  const handleConnected = useCallback(() => {
    setConnectionError(null);
  }, []);

  // NOTE: do NOT automatically leave on disconnect. Transient disconnects
  // (e.g. mobile network blips, server restart) should be handled by
  // LiveKit's own reconnection logic. `onLeave` is now reserved for an
  // explicit user action via LocalAudioControls.
  const handleDisconnected = useCallback(() => {
    // Intentionally a no-op: SpacePageClient owns the "leave" decision.
  }, []);

  const handleError = useCallback((err: Error) => {
    setConnectionError(err?.message ?? 'Connection error.');
    // Log to console for diagnostics; do not unmount the room.
    // eslint-disable-next-line no-console
    console.error('[SpaceRoom] LiveKit error:', err);
  }, []);

  // Surface connection state changes in console for future diagnostics.
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

  const handleLeave = useCallback(() => {
    try {
      room.disconnect();
    } catch {
      /* swallow */
    }
    onLeave?.();
  }, [onLeave, room]);

  // Pre-seed the profile map with the locally-known handle so the host
  // header can render a friendly label immediately, without waiting for
  // the /api/users round-trip.
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

  // Merge order matters: seededProfiles (which carry the fresh handle /
  // avatarUrl from the join/start-now response) must win over whatever
  // /api/users returns for the local DID. Otherwise a stale or missing
  // row in the DB would clobber the avatarUrl we just received.
  const mergedProfiles = useMemo<ResolvedProfileMap>(() => {
    const next: ResolvedProfileMap = { ...profiles, ...seededProfiles };
    // Defence in depth: if the seed has an avatarUrl but the merged map
    // somehow ended up with a null/empty value for the local identity,
    // restore it. Also verify the seed is keyed by `identity` so the
    // RoomGrid lookup (`profiles[p.identity]`) hits.
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

  const localProfile = mergedProfiles[identity];
  const identityLabel = friendlyLabelFor(
    identity,
    localProfile,
    handle ? `@${handle}` : displayName
  );

  // Diagnostic: log the seeded and merged profile maps so we can confirm
  // whether the avatarUrl from the join/start-now response is reaching
  // the participant grid. This is a temporary debug aid.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[SpaceRoom] profiles', {
      identity,
      seededProfiles,
      mergedProfiles,
    });
  }, [identity, mergedProfiles, seededProfiles]);

  return (
    <div
      className="flex flex-col gap-4 rounded-lg border border-slate-800 bg-slate-900 p-4"
      data-testid="space-room"
      data-role={role}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">
          {role === 'host' ? 'You are the host' : 'You are in the audience'}
        </h2>
        <span className="text-xs text-slate-500" data-testid="identity-label">
          {identityLabel}
        </span>
      </div>

      {connectionError ? (
        <p
          role="alert"
          className="rounded-md border border-red-700 bg-red-900/30 px-3 py-2 text-xs text-red-200"
          data-testid="space-room-error"
        >
          {connectionError}
        </p>
      ) : null}

      <LiveKitRoom
        room={room}
        token={token}
        serverUrl={wsUrl}
        connect={true}
        audio={role === 'host'}
        video={false}
        onConnected={handleConnected}
        onDisconnected={handleDisconnected}
        onError={handleError}
        data-lk-theme="default"
      >
        <HostAutoUnmute role={role} />
        <RoomGrid
          identity={identity}
          displayName={displayName}
          isHost={isHost}
          hostActions={hostActions}
          profiles={mergedProfiles}
        />
        <div className="mt-4">
          <LocalAudioControls
            onLeave={handleLeave}
          />
        </div>
        {stageSlot ? (
          <div className="mt-4 flex flex-col gap-3" data-testid="stage-slot">
            {stageSlot}
          </div>
        ) : null}
      </LiveKitRoom>

    </div>
  );
}

export default SpaceRoom;
