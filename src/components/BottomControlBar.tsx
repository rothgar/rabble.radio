'use client';

import type { ReactElement } from 'react';
import { Hand, SignOut } from '@phosphor-icons/react';
import { ReactionBar } from '@/components/ReactionBar';

export type BottomControlRole = 'host' | 'speaker' | 'audience';

export interface BottomControlBarProps {
  role: BottomControlRole;
  micOn: boolean;
  onMicToggle: () => void;
  onLeave: () => void;
  onStepDown?: () => void;
  onReact: (emoji: string) => void;
  handRaised?: boolean;
  onToggleHand?: () => void;
}

export function BottomControlBar({
  role,
  micOn,
  onMicToggle,
  onLeave,
  onStepDown,
  onReact,
  handRaised = false,
  onToggleHand,
}: BottomControlBarProps): ReactElement {
  const renderActions = (): ReactElement => {
    if (role === 'audience') {
      return (
        <div className="flex items-center gap-2" data-testid="bottom-bar-audience">
          <button
            type="button"
            onClick={() => onToggleHand?.()}
            aria-pressed={handRaised}
            className={
              'inline-flex min-w-[190px] items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ' +
              (handRaised
                ? 'border border-[var(--color-accent)] bg-[var(--color-accent-800)] text-[var(--color-accent-100)] hover:bg-[var(--color-accent-700)]'
                : 'bg-[var(--color-accent)] text-[var(--color-accent-900)] hover:bg-[var(--color-accent-400)]')
            }
            data-testid="bottom-bar-raise-hand"
          >
            <Hand size={16} weight="bold" />
            {handRaised ? 'Hand raised' : 'Raise hand to speak'}
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-divider)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-accent-800)]"
            data-testid="bottom-bar-leave"
          >
            <SignOut size={16} weight="bold" />
            Leave
          </button>
        </div>
      );
    }

    // host + speaker share mic toggle + leave
    return (
      <div className="flex items-center gap-2" data-testid="bottom-bar-speaker">
        <button
          type="button"
          onClick={onMicToggle}
          aria-pressed={micOn}
          className={
            'inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ' +
            (micOn
              ? 'border border-[var(--color-divider)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-accent-800)]'
              : 'bg-[var(--color-accent)] text-[var(--color-accent-900)] hover:bg-[var(--color-accent-400)]')
          }
          data-testid="bottom-bar-mic-toggle"
        >
          {micOn ? 'Mute mic' : 'Unmute mic'}
        </button>
        {role === 'speaker' && onStepDown ? (
          <button
            type="button"
            onClick={onStepDown}
            className="inline-flex items-center justify-center rounded-full border border-[var(--color-divider)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-accent-800)]"
            data-testid="bottom-bar-step-down"
          >
            Step down
          </button>
        ) : null}
        <button
          type="button"
          onClick={onLeave}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-divider)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-accent-800)]"
          data-testid="bottom-bar-leave"
        >
          <SignOut size={16} weight="bold" />
          Leave
        </button>
      </div>
    );
  };

  return (
    <div
      className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-4"
      data-testid="bottom-control-bar"
      data-role={role}
    >
      <div className="flex items-center gap-3">
        <ReactionBar onReact={onReact} />
        <span
          aria-hidden
          className="mx-1 h-6 w-px bg-[var(--color-divider)]"
        />
      </div>
      <div className="flex items-center gap-2">{renderActions()}</div>
    </div>
  );
}

export default BottomControlBar;
