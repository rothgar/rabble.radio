'use client';

// src/components/LocalAudioControls.tsx
//
// Buttons for the local participant: toggle microphone, leave the room.
// Uses LiveKit hooks so the buttons stay in sync with the actual room state.

import { useCallback } from 'react';
import type { ReactElement } from 'react';
import { useLocalParticipant } from '@livekit/components-react';

export interface LocalAudioControlsProps {
  onLeave?: () => void;
}

export function LocalAudioControls({
  onLeave,
}: LocalAudioControlsProps): ReactElement {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();

  const onToggleMic = useCallback(async () => {
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch {
      // swallow; the UI will stay in sync via the hook on the next event.
    }
  }, [isMicrophoneEnabled, localParticipant]);

  const onLeaveClick = useCallback(() => {
    onLeave?.();
  }, [onLeave]);

  return (
    <div
      className="flex items-center justify-center gap-3"
      data-testid="local-audio-controls"
    >
      <button
        type="button"
        onClick={() => {
          void onToggleMic();
        }}
        aria-pressed={!isMicrophoneEnabled}
        className={
          'rounded-md px-4 py-2 text-sm font-medium transition-colors ' +
          (isMicrophoneEnabled
            ? 'bg-sky-600 text-white hover:bg-sky-500'
            : 'bg-slate-700 text-slate-100 hover:bg-slate-600')
        }
        data-testid="mic-toggle"
        data-muted={isMicrophoneEnabled ? 'false' : 'true'}
      >
        {isMicrophoneEnabled ? 'Mute' : 'Unmute'}
      </button>
      <button
        type="button"
        onClick={onLeaveClick}
        className="rounded-md border border-red-700 bg-red-900/30 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-900/50"
        data-testid="leave-button"
      >
        Leave
      </button>
    </div>
  );
}

export default LocalAudioControls;
