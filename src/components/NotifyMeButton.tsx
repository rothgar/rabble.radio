'use client';

// src/components/NotifyMeButton.tsx
//
// "Notify me" for a scheduled show. Signed in it toggles a reminder through
// POST /api/spaces/[id]/remind; signed out it links to login. When a reminder
// is turned on we also ask the browser for notification permission so the
// ReminderToasts poller can raise a system notification when the show goes
// on air.

import { useCallback, useState, type ReactElement } from 'react';
import { Bell, BellRinging } from '@phosphor-icons/react';
import { Button } from '@/components/ui';

export interface NotifyMeButtonProps {
  spaceId: string;
  isAuthenticated: boolean;
  reminded: boolean;
  scheduledAt?: string | null;
  size?: 'sm' | 'md' | 'lg';
  onChange?: (reminded: boolean) => void;
}

export function NotifyMeButton({
  spaceId,
  isAuthenticated,
  reminded: initial,
  scheduledAt = null,
  size = 'md',
  onChange,
}: NotifyMeButtonProps): ReactElement {
  const [reminded, setReminded] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const next = !reminded;
    try {
      const res = await fetch(`/api/spaces/${encodeURIComponent(spaceId)}/remind`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ on: next }),
      });
      const body = (await res.json().catch(() => ({}))) as { reminded?: boolean; message?: string; error?: string };
      if (!res.ok) {
        setError(body.message || body.error || `Could not update the reminder (HTTP ${res.status}).`);
        return;
      }
      const value = Boolean(body.reminded);
      setReminded(value);
      onChange?.(value);
      if (value && typeof Notification !== 'undefined' && Notification.permission === 'default') {
        void Notification.requestPermission().catch(() => undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the reminder.');
    } finally {
      setBusy(false);
    }
  }, [busy, onChange, reminded, spaceId]);

  if (!isAuthenticated) {
    return (
      <Button
        href={`/login?next=${encodeURIComponent(`/show/${spaceId}`)}`}
        size={size}
        variant="secondary"
        data-testid="notify-me-signin"
      >
        <Bell size={18} aria-hidden /> Sign in to get notified
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        size={size}
        variant={reminded ? 'secondary' : 'primary'}
        disabled={busy}
        aria-pressed={reminded}
        onClick={() => {
          void toggle();
        }}
        data-testid="notify-me-button"
      >
        {reminded ? <BellRinging size={18} aria-hidden /> : <Bell size={18} aria-hidden />}
        {busy ? 'Saving…' : reminded ? "You'll be notified" : 'Notify me'}
      </Button>
      <p className="text-caption text-[var(--color-text-secondary)]" data-testid="notify-me-hint">
        {reminded
          ? `We'll tell you when this show goes on air${scheduledAt ? `, planned for ${new Date(scheduledAt).toLocaleString()}` : ''}. Tap again to cancel.`
          : 'Get a heads-up here and in the app when the host goes on air.'}
      </p>
      {error ? (
        <p role="alert" className="text-label text-[var(--color-live)]" data-testid="notify-me-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default NotifyMeButton;
