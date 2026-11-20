'use client';

// src/components/FollowHostButton.tsx
//
// "Follow this host" for every show they go live on, not just the one the
// viewer happens to be looking at. Signed in it toggles a host follow
// through POST /api/hosts/[did]/follow; signed out it links to login. When
// a follow is turned on we also ask the browser for notification
// permission so the ReminderToasts poller (and the push the host's go-live
// triggers) can raise a system notification.

import { useCallback, useState, type ReactElement } from 'react';
import { BellSimple, BellSimpleRinging } from '@phosphor-icons/react';
import { Button } from '@/components/ui';
import { ensurePushSubscription, type PushStatus } from '@/lib/push-client';

export interface FollowHostButtonProps {
  hostDid: string;
  hostName: string;
  isAuthenticated: boolean;
  following: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** Where to send a signed-out visitor back to after they log in. */
  loginNext?: string;
  onChange?: (following: boolean) => void;
}

export function FollowHostButton({
  hostDid,
  hostName,
  isAuthenticated,
  following: initial,
  size = 'md',
  loginNext,
  onChange,
}: FollowHostButtonProps): ReactElement {
  const [following, setFollowing] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [push, setPush] = useState<PushStatus | null>(null);

  const toggle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const next = !following;
    try {
      const res = await fetch(`/api/hosts/${encodeURIComponent(hostDid)}/follow`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ on: next }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        following?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(body.message || body.error || `Could not update the follow (HTTP ${res.status}).`);
        return;
      }
      const value = Boolean(body.following);
      setFollowing(value);
      onChange?.(value);
      if (value) {
        // Register this browser for push so the alert arrives with the site closed.
        setPush(await ensurePushSubscription(true));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the follow.');
    } finally {
      setBusy(false);
    }
  }, [busy, following, hostDid, onChange]);

  if (!isAuthenticated) {
    const href = loginNext ? `/login?next=${encodeURIComponent(loginNext)}` : '/login';
    return (
      <Button href={href} size={size} variant="secondary" data-testid="follow-host-signin">
        <BellSimple size={18} aria-hidden /> Sign in to follow {hostName}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        size={size}
        variant={following ? 'secondary' : 'primary'}
        disabled={busy}
        aria-pressed={following}
        onClick={() => {
          void toggle();
        }}
        data-testid="follow-host-button"
      >
        {following ? <BellSimpleRinging size={18} aria-hidden /> : <BellSimple size={18} aria-hidden />}
        {busy ? 'Saving…' : following ? `Following ${hostName}` : `Follow ${hostName}`}
      </Button>
      <p className="text-caption text-[var(--color-text-secondary)]" data-testid="follow-host-hint">
        {following
          ? `We'll tell you whenever ${hostName} goes on air, on any show. Tap again to stop.`
          : `Get notified whenever ${hostName} goes on air, even with this site closed.`}
      </p>
      {following && push && push !== 'subscribed' ? (
        <p className="text-caption text-[var(--color-text-tertiary)]" data-testid="follow-host-push-status">
          {push === 'denied'
            ? 'Browser notifications are blocked, so you will only see the alert while the site is open.'
            : push === 'unsupported'
              ? 'This browser cannot receive push notifications; you will see the alert while the site is open.'
              : 'Push setup did not finish; you will still see the alert while the site is open.'}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-label text-[var(--color-live)]" data-testid="follow-host-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default FollowHostButton;
