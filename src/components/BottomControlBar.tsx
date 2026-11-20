'use client';

import { useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { Broadcast, Hand, SignOut } from '@phosphor-icons/react';
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
  /**
   * Host only: whether the show is currently on air, and the toggle that
   * starts or stops the broadcast. Off air, only the stage hears itself.
   */
  onAir?: boolean;
  onToggleOnAir?: () => void;
  onAirBusy?: boolean;
  /**
   * Host or speaker only: true when this is the only participant left on
   * stage, so leaving will take the show off air. Changes the "Leave the
   * show?" dialog copy to warn about it instead of saying the show stays
   * open.
   */
  lastOnStage?: boolean;
}

/**
 * Shared action-button classes. Every control button is `flex-1 min-w-0` so
 * all buttons in a row are the same width and shape regardless of label
 * length, with centered, truncated text so nothing misaligns on mobile.
 */
const ACTION_BTN =
  'inline-flex min-h-touch min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]';

const ACTION_BTN_SECONDARY =
  'border border-[var(--color-divider)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-ink-muted)]';

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
  onAir = false,
  onToggleOnAir,
  onAirBusy = false,
  lastOnStage = false,
}: BottomControlBarProps): ReactElement {
  // Leaving is one tap on a bar people are already tapping, so it asks first.
  const [confirmLeave, setConfirmLeave] = useState(false);
  const askLeave = (): void => setConfirmLeave(true);
  // Portaled to document.body: the footer it's triggered from has
  // backdrop-blur, which creates a containing block that would resolve
  // this dialog's `fixed inset-0` against the footer's rect instead of
  // the viewport.
  const confirmDialog = confirmLeave
    ? createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="leave-dialog-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--color-scrim)] p-4 sm:items-center"
          data-testid="leave-dialog"
          onClick={() => setConfirmLeave(false)}
        >
          <div
            className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="leave-dialog-title" className="text-title font-semibold text-[var(--color-text)]">
              Leave the show?
            </h2>
            <p className="text-body text-[var(--color-text-secondary)]">
              {role === 'audience'
                ? 'You will stop listening and leave the room.'
                : lastOnStage
                  ? "You're the last one on stage. Leaving will take the show off air."
                  : 'You will leave the studio. The show stays open and you can come back from your shows list.'}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmLeave(false)}
                className={`${ACTION_BTN} ${ACTION_BTN_SECONDARY} flex-none`}
                data-testid="leave-dialog-stay"
              >
                Stay
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmLeave(false);
                  onLeave();
                }}
                className={`${ACTION_BTN} flex-none bg-[var(--color-live)] text-white hover:opacity-90`}
                data-testid="leave-dialog-confirm"
              >
                Leave
              </button>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

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
                ? 'border border-[var(--color-accent)] bg-[var(--color-ink)] text-[var(--color-text-on-ink)] hover:bg-[var(--color-accent-hover)]'
                : 'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]')
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
            onClick={askLeave}
            className={`${ACTION_BTN} ${ACTION_BTN_SECONDARY}`}
            data-testid="bottom-bar-leave"
          >
            <SignOut size={16} weight="bold" />
            <span className="truncate">Leave</span>
          </button>
        </div>
      );
    }

    // host + speaker share mic toggle + leave; the host also gets on air.
    return (
      <div className="flex w-full items-center gap-2" data-testid="bottom-bar-speaker">
        {role === 'host' && onToggleOnAir ? (
          <button
            type="button"
            onClick={onToggleOnAir}
            disabled={onAirBusy}
            aria-pressed={onAir}
            className={
              ACTION_BTN +
              ' disabled:opacity-50 ' +
              (onAir
                ? 'border border-[var(--color-live-border)] bg-[var(--color-live-muted)] text-[var(--color-live)] hover:bg-[var(--color-live-border)]'
                : 'bg-[var(--color-live)] text-white hover:opacity-90')
            }
            data-testid="bottom-bar-on-air"
            data-on-air={onAir ? 'true' : 'false'}
          >
            <Broadcast size={16} weight="bold" />
            <span className="truncate">
              {onAirBusy ? 'Working…' : onAir ? 'Go off air' : 'On air'}
            </span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={onMicToggle}
          aria-pressed={micOn}
          className={
            ACTION_BTN +
            ' ' +
            (micOn
              ? ACTION_BTN_SECONDARY
              : 'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]')
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
          onClick={askLeave}
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
      data-on-air={onAir ? 'true' : 'false'}
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
      {confirmDialog}
    </div>
  );
}

export default BottomControlBar;
