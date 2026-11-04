'use client';

// src/components/StartShowButton.tsx
//
// The signed-in call to action. One tap creates a show (default title, no
// topics yet), mints the host token and drops the host straight into the
// room, off air. The join payload is handed to the show page through
// sessionStorage exactly like CreateSpaceForm's "Start now" so the page
// auto-joins without a second click.

import { useCallback, useState, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';

export interface StartShowButtonProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary' | 'ghost';
  fullWidth?: boolean;
  className?: string;
  label?: string;
}

interface StartResponse {
  space?: { id: string };
  startNow?: boolean;
  token?: string;
  wsUrl?: string;
  role?: string;
  roomName?: string;
  identity?: string;
  handle?: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  error?: string;
  message?: string;
}

export function StartShowButton({
  size = 'md',
  variant = 'primary',
  fullWidth = false,
  className = '',
  label = 'Start a show',
}: StartShowButtonProps): ReactElement {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/spaces', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ startNow: true }),
      });
      const body = (await res.json().catch(() => ({}))) as StartResponse;
      if (res.status === 401) {
        router.push('/login?next=%2Fme');
        return;
      }
      if (!res.ok || !body.space?.id) {
        setError(body.message || body.error || `Could not start a show (HTTP ${res.status}).`);
        return;
      }
      if (body.token && body.wsUrl && body.roomName && body.identity && body.handle) {
        window.sessionStorage.setItem(
          `rabble_join_${body.space.id}`,
          JSON.stringify({
            token: body.token,
            wsUrl: body.wsUrl,
            role: body.role ?? 'host',
            roomName: body.roomName,
            identity: body.identity,
            handle: body.handle,
            displayName: body.displayName ?? null,
            avatarUrl: body.avatarUrl ?? null,
          })
        );
      }
      router.push(`/show/${encodeURIComponent(body.space.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start a show.');
      setBusy(false);
    }
  }, [busy, router]);

  return (
    <div className={fullWidth ? 'flex w-full flex-col gap-2' : 'inline-flex flex-col gap-2'}>
      <Button
        type="button"
        size={size}
        variant={variant}
        fullWidth={fullWidth}
        className={className}
        disabled={busy}
        onClick={() => {
          void start();
        }}
        data-testid="start-show-button"
      >
        {busy ? 'Starting…' : label}
      </Button>
      {error ? (
        <p
          role="alert"
          className="rounded-sm border border-[var(--color-live-border)] bg-[var(--color-live-muted)] px-3 py-2 text-label text-[var(--color-live)]"
          data-testid="start-show-error"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default StartShowButton;
