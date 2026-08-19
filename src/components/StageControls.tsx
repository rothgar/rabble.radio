'use client';

// src/components/StageControls.tsx
//
// Bridges `useSpaceState` to the redesigned SpaceRoom via callback props.
// Renders no DOM of its own — the parent (SpaceRoom) renders the toast
// and dispatches accept/decline via the stageControlsBus module below.

import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useSpaceState, type StageRole } from '@/hooks/useSpaceState';

export interface StageControlsProps {
  spaceId: string;
  identity: string;
  displayName?: string;
  role: StageRole;
  /** Called when the local user accepts an invite and receives a new token. */
  onTokenRefresh: (input: {
    token: string;
    wsUrl: string;
    role: StageRole;
    roomName: string;
    identity: string;
  }) => void;
  /** Notifies SpaceRoom that a stage invite has arrived. */
  onInvitePending: (hostName?: string) => void;
  /** Notifies SpaceRoom that a pending invite has been accepted or declined. */
  onInviteResolved: () => void;
}

/**
 * Module-level bus so SpaceRoom's invite toast can dispatch accept /
 * decline to the StageControls instance mounted inside LiveKitRoom
 * without prop-drilling handlers through the LiveKit context boundary.
 */
export interface StageControlsBus {
  accept: () => Promise<void>;
  decline: () => Promise<void>;
  busy: boolean;
}

const bus: { current: StageControlsBus | null } = { current: null };

export function setStageControlsBus(next: StageControlsBus | null): void {
  bus.current = next;
}

export function getStageControlsBus(): StageControlsBus | null {
  return bus.current;
}

export function StageControls({
  spaceId,
  identity,
  role,
  onTokenRefresh,
  onInvitePending,
  onInviteResolved,
}: StageControlsProps): ReactElement | null {
  const { dispatchStageAction, hasPendingInvite } = useSpaceState({
    spaceId,
    identity,
    role,
  });
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (hasPendingInvite) {
      onInvitePending(undefined);
    }
  }, [hasPendingInvite, onInvitePending]);

  const handleAccept = useCallback(async () => {
    setAccepting(true);
    try {
      const result = await dispatchStageAction('accept');
      if (!result.error && result.token && result.wsUrl && result.role) {
        onTokenRefresh({
          token: result.token,
          wsUrl: result.wsUrl,
          role: result.role,
          roomName: result.roomName ?? '',
          identity: result.identity ?? identity,
        });
      }
      onInviteResolved();
    } finally {
      setAccepting(false);
    }
  }, [dispatchStageAction, identity, onInviteResolved, onTokenRefresh]);

  const handleDecline = useCallback(async () => {
    await dispatchStageAction('leave');
    onInviteResolved();
  }, [dispatchStageAction, onInviteResolved]);

  useEffect(() => {
    setStageControlsBus({
      accept: handleAccept,
      decline: handleDecline,
      busy: accepting,
    });
    return () => {
      setStageControlsBus(null);
    };
  }, [accepting, handleAccept, handleDecline]);

  return null;
}

export default StageControls;
