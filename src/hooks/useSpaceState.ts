'use client';

// src/hooks/useSpaceState.ts
//
// React hook bridging LiveKit room events to React state. Subscribes to
// data messages (stage invites, role-change broadcasts) and to participant
// metadata changes. Exposes helpers that components can call to dispatch
// stage actions via POST /api/spaces/[id]/stage.

import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useRoomContext } from '@livekit/components-react';
import type { Room } from 'livekit-client';

export type StageRole = 'host' | 'speaker' | 'audience';

export interface StageInviteMessage {
  type: 'stage_invite';
  spaceId: string;
  hostDid: string;
  targetIdentity: string;
  ts: number;
}

export interface StageRoleChangedMessage {
  type: 'stage_role_changed' | 'stage_removed';
  spaceId: string;
  identity: string;
  role: StageRole;
}

export interface StageDataMessage {
  type: string;
  [key: string]: unknown;
}

export interface StageActionResult {
  ok?: boolean;
  token?: string;
  wsUrl?: string;
  role?: StageRole;
  roomName?: string;
  identity?: string;
  error?: string;
  message?: string;
}

export interface UseSpaceStateOptions {
  spaceId: string;
  identity: string;
  /** Current LiveKit role used to decide whether to show host controls. */
  role: StageRole;
}

export type StageAction =
  | 'invite'
  | 'accept'
  | 'leave'
  | 'remove'
  | 'kick'
  | 'block'
  | 'mute'
  | 'unmute';

export interface UseSpaceStateResult {
  invites: StageInviteMessage[];
  /** True when the local user has a pending invite for this space. */
  hasPendingInvite: boolean;
  dispatchStageAction: (
    action: StageAction,
    targetIdentity?: string
  ) => Promise<StageActionResult>;
  reload: () => void;
}

function parseDataMessage(bytes: Uint8Array): StageDataMessage | null {
  try {
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text) as StageDataMessage;
  } catch {
    return null;
  }
}

export function useSpaceState(
  options: UseSpaceStateOptions
): UseSpaceStateResult {
  const { spaceId, identity } = options;
  const room: Room | null = useRoomContext();
  const [invites, setInvites] = useState<StageInviteMessage[]>([]);
  const [, setReloadKey] = useState(0);

  // Subscribe to LiveKit data messages for stage invites / role changes.
  useEffect(() => {
    if (!room) return;

    const handleData = (payload: Uint8Array): void => {
      const parsed = parseDataMessage(payload);
      if (!parsed || typeof parsed.type !== 'string') return;
      if (parsed.type === 'stage_invite') {
        const invite = parsed as unknown as StageInviteMessage;
        if (invite.spaceId !== spaceId) return;
        setInvites((prev) => {
          if (
            prev.some(
              (p) =>
                p.spaceId === invite.spaceId &&
                p.targetIdentity === invite.targetIdentity
            )
          ) {
            return prev;
          }
          return [...prev, { ...invite, ts: Date.now() }];
        });
      }
      // Role changes / removal triggers a reload — components that care
      // (e.g. participant grid) refresh from authoritative state.
      if (parsed.type === 'stage_role_changed' || parsed.type === 'stage_removed') {
        setReloadKey((k) => k + 1);
      }
    };

    room.on('dataReceived', handleData);
    return () => {
      room.off('dataReceived', handleData);
    };
  }, [room, spaceId]);

  // When the local user disconnects/reconnects, invite state from the
  // server is re-fetched via accept — nothing to do here other than clear
  // stale state if identity changes.
  useEffect(() => {
    setInvites([]);
  }, [identity, spaceId]);

  const hasPendingInvite = invites.some(
    (invite) => invite.targetIdentity === identity
  );

  const dispatchStageAction = useCallback(
    async (
      action: StageAction,
      targetIdentity?: string
    ): Promise<StageActionResult> => {
      const res = await fetch(`/api/spaces/${spaceId}/stage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, targetIdentity }),
      });
      const body = (await res.json().catch(() => ({}))) as StageActionResult;
      if (!res.ok) {
        return {
          error: body.error ?? `http_${res.status}`,
          message: body.message ?? 'Stage action failed.',
        };
      }
      return body;
    },
    [spaceId]
  );

  return {
    invites,
    hasPendingInvite,
    dispatchStageAction,
    reload: () => setReloadKey((k) => k + 1),
  };
}

// Re-export ReactElement so consumers can import a single thing.
export type { ReactElement };
