'use client';

import type { ReactElement } from 'react';
import { Hand, SignOut } from '@phosphor-icons/react';
import { ReactionBar } from '@/components/ReactionBar';

export type BottomControlRole = 'host' | 'speaker' | 'audience';

export interface BottomControlBarProps {
  role: BottomControlRole;
  /** Anonymous listeners cannot raise a hand; they get a sign-in link instead. */
  anonymous?: boolean;
  /** Where the sign-in link should go (defaults to /login). */
  signInHref?: string;
  micOn: boolean;
  onMicToggle: () => void;
  onLeave: () => void;
  onStepDown?: () => void;
  onReact: (emoji: string) => void;
  handRaised?: boolean;
  onToggleHand?: () => void;
}

/**
 * Shared action-button classes. Every control button is `flex-1 min-w-0` so
 * all buttons in a row are the same width and shape regardless of label
 * length, with centered, truncated text so nothing misaligns on mobile.
 */
const ACTION_BTN =
  'inline-flex min-h-touch min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]';

const ACTION_BTN_SECONDARY =
  'border border-[var(--color-divider)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-accent-800)]';

export function BottomControlBar({
  role,
  anonymous = false,
  signInHref = '/login',
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
        <div className="flex w-full items-center gap-2" data-testid="bottom-bar-audience">
          {anonymous ? (
            <a
              href={signInHref}
              className={`${ACTION_BTN} bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]`}
              data-testid="bottom-bar-signin"
            >
              <span className="truncate">Sign in to speak</span>
            </a>
          ) : (
          <button
            type="button"
            onClick={() => onToggleHand?.()}
            aria-pressed={handRaised}
            className={
              ACTION_BTN +
              ' ' +
              (handRaised
                ? 'border border-[var(--color-accent)] bg-[var(--color-accent-800)] text-[var(--color-accent-100)] hover:bg-[var(--color-accent-700)]'
                : 'bg-[var(--color-accent)] text-[var(--color-accent-900)] hover:bg-[var(--color-accent-400)]')
            }
            data-testid="bottom-bar-raise-hand"
          >
            <Hand size={16} weight="bold" />
            <span className="truncate">
              {handRaised ? (
                'Hand raised'
              ) : (
                <>
                  <span className="hidden sm:inline">Raise hand to speak</span>
                  <span className="sm:hidden">Raise hand</span>
                </>
              )}
            </span>
          </button>
          )}
          <button
            type="button"
            onClick={onLeave}
            className={`${ACTION_BTN} ${ACTION_BTN_SECONDARY}`}
            data-testid="bottom-bar-leave"
          >
            <SignOut size={16} weight="bold" />
            <span className="truncate">Leave</span>
          </button>
        </div>
      );
    }

    // host + speaker share mic toggle + leave
    return (
      <div className="flex w-full items-center gap-2" data-testid="bottom-bar-speaker">
        <button
          type="button"
          onClick={onMicToggle}
          aria-pressed={micOn}
          className={
            ACTION_BTN +
            ' ' +
            (micOn
              ? ACTION_BTN_SECONDARY
              : 'bg-[var(--color-accent)] text-[var(--color-accent-900)] hover:bg-[var(--color-accent-400)]')
          }
          data-testid="bottom-bar-mic-toggle"
        >
          <span className="truncate">{micOn ? 'Mute mic' : 'Unmute mic'}</span>
        </button>
        {role === 'speaker' && onStepDown ? (
          <button
            type="button"
            onClick={onStepDown}
            className={`${ACTION_BTN} ${ACTION_BTN_SECONDARY}`}
            data-testid="bottom-bar-step-down"
          >
            <span className="truncate">Step down</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={onLeave}
          className={`${ACTION_BTN} ${ACTION_BTN_SECONDARY}`}
          data-testid="bottom-bar-leave"
        >
          <SignOut size={16} weight="bold" />
          <span className="truncate">Leave</span>
        </button>
      </div>
    );
  };

  return (
    <div
      className="mx-auto flex w-full max-w-[1180px] flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid="bottom-control-bar"
      data-role={role}
      data-anonymous={anonymous ? 'true' : 'false'}
    >
      <div className="flex items-center justify-center gap-3 sm:justify-start">
        <ReactionBar onReact={onReact} />
        <span
          aria-hidden
          className="mx-1 hidden h-6 w-px bg-[var(--color-divider)] sm:block"
        />
      </div>
      <div className="flex w-full min-w-0 flex-1 items-center gap-2 sm:w-auto">
        {renderActions()}
      </div>
    </div>
  );
}

export default BottomControlBar;
