'use client';

// src/components/StageRequestToast.tsx
//
// Toast that surfaces a pending stage invite to an audience member. Renders
// Accept / Decline buttons which call back into the parent.

import type { ReactElement } from 'react';

export interface StageRequestToastProps {
  hostName?: string;
  onAccept: () => Promise<void> | void;
  onDecline: () => void;
  busy?: boolean;
}

export function StageRequestToast({
  hostName,
  onAccept,
  onDecline,
  busy = false,
}: StageRequestToastProps): ReactElement {
  return (
    <div
      role="alertdialog"
      aria-live="polite"
      data-testid="stage-request-toast"
      className="rounded-lg border border-sky-700 bg-sky-950/80 p-4 text-sm text-sky-50 shadow-lg"
    >
      <div className="mb-2 font-medium">
        {hostName ? `${hostName} invited you to stage.` : 'You have been invited to stage.'}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            void onAccept();
          }}
          disabled={busy}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          data-testid="stage-request-accept"
        >
          {busy ? 'Joining…' : 'Accept'}
        </button>
        <button
          type="button"
          onClick={onDecline}
          disabled={busy}
          className="rounded-md border border-sky-700 px-3 py-1.5 text-xs font-medium text-sky-100 hover:bg-sky-900/60 disabled:opacity-50"
          data-testid="stage-request-decline"
        >
          Decline
        </button>
      </div>
    </div>
  );
}

export default StageRequestToast;
