'use client';

// src/components/ShowFollowButton.tsx
//
// "Follow this show" — notified only when this exact named show goes live
// as its host, not the host's other shows or guest appearances elsewhere.
// Signed in it toggles a show follow through POST /api/spaces/[id]/follow;
// signed out it links to login. When a follow is turned on we also ask the
// browser for notification permission so the ReminderToasts poller (and
// the push the host's go-live triggers) can raise a system notification.

import { useCallback, useState, type ReactElement } from 'react';
import { BellSimple, BellSimpleRinging } from '@phosphor-icons/react';
import { Button } from '@/components/ui';
import { ensurePushSubscription, type PushStatus } from '@/lib/push-client';

export interface ShowFollowButtonProps {
  spaceId: string;
  showTitle: string;
  isAuthenticated: boolean;
  following: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** Where to send a signed-out visitor back to after they log in. */
  loginNext?: string;
  onChange?: (following: boolean) => void;
}

export function ShowFollowButton({
  spaceId,
  showTitle,
  isAuthenticated,
  following: initial,
  size = 'md',
  loginNext,
  onChange,
}: ShowFollowButtonProps): ReactElement {
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
      const res = await fetch(`/api/spaces/${encodeURIComponent(spaceId)}/follow`, {
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
  }, [busy, following, spaceId, onChange]);

  if (!isAuthenticated) {
    const href = loginNext ? `/login?next=${encodeURIComponent(loginNext)}` : '/login';
    return (
      <Button href={href} size={size} variant="secondary" data-testid="follow-show-signin">
        <BellSimple size={18} aria-hidden /> Sign in to follow {showTitle}
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
        data-testid="follow-show-button"
      >
        {following ? <BellSimpleRinging size={18} aria-hidden /> : <BellSimple size={18} aria-hidden />}
        {busy ? 'Saving…' : following ? `Following ${showTitle}` : `Follow ${showTitle}`}
      </Button>
      <p className="text-caption text-[var(--color-text-secondary)]" data-testid="follow-show-hint">
        {following
          ? `We'll tell you whenever ${showTitle} goes on air. Tap again to stop.`
          : `Get notified whenever ${showTitle} goes on air, even with this site closed.`}
      </p>
      {following && push && push !== 'subscribed' ? (
        <p className="text-caption text-[var(--color-text-tertiary)]" data-testid="follow-show-push-status">
          {push === 'denied'
            ? 'Browser notifications are blocked, so you will only see the alert while the site is open.'
            : push === 'unsupported'
              ? 'This browser cannot receive push notifications; you will see the alert while the site is open.'
              : 'Push setup did not finish; you will still see the alert while the site is open.'}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-label text-[var(--color-live)]" data-testid="follow-show-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default ShowFollowButton;
