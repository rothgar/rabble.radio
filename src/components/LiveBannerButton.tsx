'use client';

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
      className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] p-4"
      data-testid="live-banner"
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-2 w-2 rounded-full"
          style={{
            backgroundColor: live ? '#f87171' : '#94a3b8',
            animation: live ? 'pulse-live 1.6s ease-in-out infinite' : undefined,
          }}
        />
        <span
          className="text-xs font-medium uppercase tracking-wide text-[var(--color-neutral-400)]"
          data-testid="live-banner-status"
        >
          {live ? 'Broadcasting live' : 'Not broadcasting'}
        </span>
      </div>
      <button
        type="button"
        onClick={() => {
          void handleToggle();
        }}
        disabled={busy}
        className={
          'w-full rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ' +
          (live
            ? 'border border-amber-700/60 bg-amber-900/40 text-amber-100 hover:bg-amber-900/60'
            : 'bg-[var(--color-accent)] text-[var(--color-accent-900)] hover:bg-[var(--color-accent-400)]')
        }
        data-testid="live-banner-toggle"
        aria-pressed={live}
      >
        {busy ? 'Working…' : live ? 'Pause broadcast' : 'Resume broadcast'}
      </button>
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-700 bg-red-900/30 px-2 py-1 text-xs text-red-200"
          data-testid="live-banner-error"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default LiveBannerButton;
