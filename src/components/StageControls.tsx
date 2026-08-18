'use client';

// src/components/StageControls.tsx
//
// Wrapper that mounts the StageManager, AudienceList and StageRequestToast
// inside the LiveKitRoom context (via SpaceRoom.stageSlot). Bridges the
// stage service hook (useSpaceState) with the UI components.

import { useCallback, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  useRoomContext,
} from '@livekit/components-react';
import { useSpaceState, type StageRole } from '@/hooks/useSpaceState';
import { StageManager } from '@/components/StageManager';
import { AudienceList } from '@/components/AudienceList';
import { StageRequestToast } from '@/components/StageRequestToast';
import type { Participant } from 'livekit-client';

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
}

interface ParticipantLite {
  identity: string;
  name?: string;
}

function toLite(p: { identity: string; name?: string }): ParticipantLite {
  return { identity: p.identity, name: p.name ?? undefined };
}

/**
 * Build a minimal Participant-like object for the local participant so it
 * can be included in the speakers list shown to the host. The shape is a
 * subset of livekit-client's Participant that StageManager consumes.
 */
function localAsParticipant(
  identity: string,
  displayName?: string
): Participant {
  const fake = {
    identity,
    name: displayName ?? identity,
    isMicrophoneEnabled: true,
    isSpeaking: false,
  } as unknown as Participant;
  return fake;
}

export function StageControls({
  spaceId,
  identity,
  displayName,
  role,
  onTokenRefresh,
}: StageControlsProps): ReactElement | null {
  const room = useRoomContext();
  const { dispatchStageAction, hasPendingInvite } = useSpaceState({
    spaceId,
    identity,
    role,
  });
  const [accepting, setAccepting] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const participants = useMemo<ParticipantLite[]>(() => {
    if (!room) return [];
    return room.remoteParticipants
      ? Array.from(room.remoteParticipants.values()).map(toLite)
      : [];
  }, [room]);

  const audience = useMemo<ParticipantLite[]>(() => {
    if (!room) return [];
    // Without permission metadata we treat all remote participants as
    // audience. Speakers are tracked separately by the host UI below.
    return participants.filter((p) => p.identity !== identity);
  }, [participants, room, identity]);

  // Speakers list: for the host we must include the local participant so the
  // stage manager doesn't show an empty state when only the host is
  // connected. We surface the local participant as a Participant-shaped
  // stub; StageManager only reads identity / name.
  const speakers = useMemo<Participant[]>(() => {
    if (role === 'host') {
      const localIncluded = participants.some((p) => p.identity === identity);
      const localStub = localAsParticipant(identity, displayName);
      return localIncluded
        ? (participants as unknown as Participant[])
        : [localStub, ...(participants as unknown as Participant[])];
    }
    return participants as unknown as Participant[];
  }, [displayName, identity, participants, role]);

  const handleInvite = useCallback(
    async (targetIdentity: string) => {
      setActionError(null);
      const result = await dispatchStageAction('invite', targetIdentity);
      if (result.error) {
        setActionError(result.message ?? 'Invite failed.');
      }
    },
    [dispatchStageAction]
  );

  const handleRemove = useCallback(
    async (targetIdentity: string) => {
      setActionError(null);
      const result = await dispatchStageAction('remove', targetIdentity);
      if (result.error) {
        setActionError(result.message ?? 'Remove failed.');
      }
    },
    [dispatchStageAction]
  );

  const handleAccept = useCallback(async () => {
    setAccepting(true);
    setActionError(null);
    try {
      const result = await dispatchStageAction('accept');
      if (result.error || !result.token || !result.wsUrl || !result.role) {
        setActionError(result.message ?? result.error ?? 'Accept failed.');
        return;
      }
      onTokenRefresh({
        token: result.token,
        wsUrl: result.wsUrl,
        role: result.role,
        roomName: result.roomName ?? '',
        identity: result.identity ?? identity,
      });
    } finally {
      setAccepting(false);
    }
  }, [dispatchStageAction, identity, onTokenRefresh]);

  const handleDecline = useCallback(() => {
    setDeclined(true);
  }, []);

  const handleLeave = useCallback(async () => {
    setActionError(null);
    const result = await dispatchStageAction('leave');
    if (result.error || !result.token || !result.wsUrl || !result.role) {
      setActionError(result.message ?? result.error ?? 'Leave failed.');
      return;
    }
    onTokenRefresh({
      token: result.token,
      wsUrl: result.wsUrl,
      role: result.role,
      roomName: result.roomName ?? '',
      identity: result.identity ?? identity,
    });
  }, [dispatchStageAction, identity, onTokenRefresh]);

  return (
    <>
      {role === 'host' ? (
        <StageManager
          spaceId={spaceId}
          speakers={speakers}
          hostIdentity={identity}
          onRemoveSpeaker={handleRemove}
        />
      ) : null}

      {role === 'host' ? (
        <AudienceList
          spaceId={spaceId}
          audience={audience as unknown as Parameters<typeof AudienceList>[0]['audience']}
          isHost
          localIdentity={identity}
          onInvite={handleInvite}
        />
      ) : null}

      {role === 'audience' ? (
        <div className="flex flex-col gap-2">
          {hasPendingInvite && !declined ? (
            <StageRequestToast
              hostName={displayName}
              busy={accepting}
              onAccept={handleAccept}
              onDecline={handleDecline}
            />
          ) : null}
          <button
            type="button"
            onClick={() => {
              void handleLeave();
            }}
            className="self-start rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
            data-testid="leave-stage-button"
          >
            Leave stage (if promoted)
          </button>
        </div>
      ) : null}

      {actionError ? (
        <p
          role="alert"
          className="rounded-md border border-red-700 bg-red-900/30 px-3 py-2 text-xs text-red-200"
        >
          {actionError}
        </p>
      ) : null}
    </>
  );
}

export default StageControls;
