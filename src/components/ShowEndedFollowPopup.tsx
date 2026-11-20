'use client';

// src/components/ShowEndedFollowPopup.tsx
//
// Shown once to a listener who was still in the room when the show ended,
// inviting them to follow the host for next time. Wraps FollowHostButton,
// which already owns the POST /api/hosts/[did]/follow toggle and the
// signed-out/push-permission states.

import { useEffect, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import { FollowHostButton } from '@/components/FollowHostButton';

export interface ShowEndedFollowPopupProps {
  hostDid: string;
  hostName: string;
  isAuthenticated: boolean;
  following: boolean;
  loginNext?: string;
  onClose: () => void;
}

export function ShowEndedFollowPopup({
  hostDid,
  hostName,
  isAuthenticated,
  following,
  loginNext,
  onClose,
}: ShowEndedFollowPopupProps): ReactElement {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--color-scrim)] p-4 sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="show-ended-follow-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="show-ended-follow-title"
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-5 shadow-xl"
        data-testid="show-ended-follow-dialog"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="show-ended-follow-title"
              className="text-title font-semibold text-[var(--color-text)]"
            >
              The show has ended
            </h2>
            <p className="mt-1 text-caption text-[var(--color-text-secondary)]">
              Follow {hostName} to hear about their next show.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
            data-testid="show-ended-follow-close"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <FollowHostButton
          hostDid={hostDid}
          hostName={hostName}
          isAuthenticated={isAuthenticated}
          following={following}
          loginNext={loginNext}
        />
      </div>
    </div>,
    document.body
  );
}

export default ShowEndedFollowPopup;
