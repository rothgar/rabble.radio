'use client';

// src/components/LiveBannerButton.tsx
//
// Host-only toggle that flips the space's `isLive` flag and publishes (or
// deletes) the host's app.bsky.actor.status/self record via the live API.

import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';

export interface LiveBannerButtonProps {
  spaceId: string;
  isLive: boolean;
  /** Called after a successful live state change. */
  onChange?: (next: { isLive: boolean }) => void;
}

interface LiveApiResponse {
  ok?: boolean;
  error?: string;
  message?: string;
}

export function LiveBannerButton({
  spaceId,
  isLive,
  onChange,
}: LiveBannerButtonProps): ReactElement {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<boolean>(isLive);

  const handleToggle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const nextAction = live ? 'end' : 'start';
      const res = await fetch(`/api/spaces/${spaceId}/live`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: nextAction }),
      });
      const body = (await res
        .json()
        .catch(() => ({}))) as LiveApiResponse;
      if (!res.ok || body.ok === false) {
        setError(body.message || body.error || `HTTP ${res.status}`);
        return;
      }
      setLive(!live);
      onChange?.({ isLive: !live });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle live.');
    } finally {
      setBusy(false);
    }
  }, [busy, live, onChange, spaceId]);

  return (
    <div
      className="rounded-lg border border-slate-800 bg-slate-900 p-4"
      data-testid="live-banner"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-100">
            Live banner
          </h3>
          <p className="text-xs text-slate-400">
            {live
              ? 'Visible to others on Bluesky via your profile status.'
              : 'Going live writes your profile status with a link to this space.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void handleToggle();
          }}
          disabled={busy}
          className={
            'shrink-0 whitespace-nowrap ' +
            (live
              ? 'rounded-md border border-red-700 bg-red-900/40 px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-900/60 disabled:opacity-50'
              : 'rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50')
          }
          data-testid="live-banner-toggle"
          aria-pressed={live}
        >
          {busy ? 'Working…' : live ? 'End Live' : 'Go Live'}
        </button>
      </div>
      {error ? (
        <p
          role="alert"
          className="mt-2 rounded-md border border-red-700 bg-red-900/30 px-2 py-1 text-xs text-red-200"
          data-testid="live-banner-error"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default LiveBannerButton;
