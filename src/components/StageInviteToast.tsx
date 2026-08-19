'use client';

import type { ReactElement } from 'react';
import { HandWaving } from '@phosphor-icons/react';

export interface StageInviteToastProps {
  hostName?: string;
  onAccept: () => void;
  onDecline: () => void;
  busy?: boolean;
}

export function StageInviteToast({
  hostName,
  onAccept,
  onDecline,
  busy = false,
}: StageInviteToastProps): ReactElement {
  return (
    <div
      role="alertdialog"
      aria-live="polite"
      data-testid="stage-invite-toast"
      className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-accent)] bg-[var(--color-surface)] p-3"
    >
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-700)] text-[var(--color-accent-100)]"
      >
        <HandWaving size={18} weight="fill" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium text-[var(--color-text)]">
          {hostName ? `${hostName} invited you to stage.` : 'You have been invited to stage.'}
        </span>
        <span className="text-xs text-[var(--color-neutral-400)]">
          Accept to join the speakers.
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onDecline}
          disabled={busy}
          className="rounded-full border border-[var(--color-divider)] px-3 py-1 text-xs font-medium text-[var(--color-neutral-200)] hover:bg-[var(--color-accent-800)] disabled:opacity-50"
          data-testid="stage-request-decline"
        >
          Decline
        </button>
        <button
          type="button"
          onClick={() => {
            void onAccept();
          }}
          disabled={busy}
          className="rounded-full bg-[var(--color-accent)] px-3 py-1 text-xs font-semibold text-[var(--color-accent-900)] transition-colors hover:bg-[var(--color-accent-400)] disabled:opacity-50"
          data-testid="stage-request-accept"
        >
          {busy ? 'Joining…' : 'Accept'}
        </button>
      </div>
    </div>
  );
}

export default StageInviteToast;
