'use client';

// src/components/FollowToggleButton.tsx
//
// Shared shape behind NotifyMeButton, ShowFollowButton and FollowHostButton:
// sign in to follow when signed out; otherwise a toggle button that POSTs
// the new state, shows a hint and (once turned on) the push subscription
// status, and surfaces a server error. The three wrappers differ only in
// the endpoint, the response key, the icon pair, the copy and the
// data-testid prefix, passed in here.

import { useCallback, useState, type ReactElement, type ReactNode } from 'react';
import type { Icon } from '@phosphor-icons/react';
import { Button } from '@/components/ui';
import { postJson } from '@/lib/post-json';
import { ensurePushSubscription, type PushStatus } from '@/lib/push-client';

export interface FollowToggleButtonLabels {
  signIn: ReactNode;
  on: string;
  off: string;
  hintOn: string;
  hintOff: string;
  /** Prefix for the error shown when the server gives no message, e.g. "Could not update the reminder" (no trailing period: postJson appends " (HTTP <status>)."). */
  errorFallback: string;
}

export interface FollowToggleButtonProps {
  /** Full URL to POST `{ on }` to; the response carries the new state under `responseKey`. */
  endpoint: string;
  responseKey: string;
  isAuthenticated: boolean;
  active: boolean;
  signInHref: string;
  icons: { off: Icon; on: Icon };
  labels: FollowToggleButtonLabels;
  testIdPrefix: string;
  size?: 'sm' | 'md' | 'lg';
  onChange?: (active: boolean) => void;
}

export function FollowToggleButton({
  endpoint,
  responseKey,
  isAuthenticated,
  active: initial,
  signInHref,
  icons,
  labels,
  testIdPrefix,
  size = 'md',
  onChange,
}: FollowToggleButtonProps): ReactElement {
  const [active, setActive] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [push, setPush] = useState<PushStatus | null>(null);

  const toggle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const next = !active;
    try {
      const body = await postJson<Record<string, unknown>>(endpoint, { on: next }, labels.errorFallback);
      const value = Boolean(body[responseKey]);
      setActive(value);
      onChange?.(value);
      if (value) {
        // Register this browser for push so the alert arrives with the site closed.
        setPush(await ensurePushSubscription(true));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `${labels.errorFallback}.`);
    } finally {
      setBusy(false);
    }
  }, [active, busy, endpoint, labels.errorFallback, onChange, responseKey]);

  const OffIcon = icons.off;
  const OnIcon = icons.on;

  if (!isAuthenticated) {
    return (
      <Button href={signInHref} size={size} variant="secondary" data-testid={`${testIdPrefix}-signin`}>
        <OffIcon size={18} aria-hidden /> {labels.signIn}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        size={size}
        variant={active ? 'secondary' : 'primary'}
        disabled={busy}
        aria-pressed={active}
        onClick={() => {
          void toggle();
        }}
        data-testid={`${testIdPrefix}-button`}
      >
        {active ? <OnIcon size={18} aria-hidden /> : <OffIcon size={18} aria-hidden />}
        {busy ? 'Saving…' : active ? labels.on : labels.off}
      </Button>
      <p className="text-caption text-[var(--color-text-secondary)]" data-testid={`${testIdPrefix}-hint`}>
        {active ? labels.hintOn : labels.hintOff}
      </p>
      {active && push && push !== 'subscribed' ? (
        <p className="text-caption text-[var(--color-text-tertiary)]" data-testid={`${testIdPrefix}-push-status`}>
          {push === 'denied'
            ? 'Browser notifications are blocked, so you will only see the alert while the site is open.'
            : push === 'unsupported'
              ? 'This browser cannot receive push notifications; you will see the alert while the site is open.'
              : 'Push setup did not finish; you will still see the alert while the site is open.'}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-label text-[var(--color-live)]" data-testid={`${testIdPrefix}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default FollowToggleButton;
