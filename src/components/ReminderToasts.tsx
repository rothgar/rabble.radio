'use client';

// src/components/ReminderToasts.tsx
//
// Delivers "Notify me" reminders on the web. Polls GET /api/me/reminders?due=1
// once a minute (and when the tab becomes visible) while signed in, shows an
// in-page toast for each show that went on air, and raises a browser
// notification when the user granted permission. Stops polling after a 401.

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import Link from 'next/link';
import { X } from '@phosphor-icons/react';
import { ensurePushSubscription } from '@/lib/push-client';
import { useActiveRoom } from '@/components/ActiveRoomProvider';

export interface DueReminderView {
  spaceId: string;
  title: string;
  host: { handle: string; displayName: string | null };
}

export const REMINDER_POLL_MS = 60_000;

export function ReminderToasts({ pollMs = REMINDER_POLL_MS }: { pollMs?: number }): ReactElement | null {
  const [due, setDue] = useState<DueReminderView[]>([]);
  const stopped = useRef(false);

  const poll = useCallback(async () => {
    if (stopped.current) return;
    try {
      const res = await fetch('/api/me/reminders?due=1', { credentials: 'include', cache: 'no-store' });
      if (res.status === 401) {
        stopped.current = true;
        return;
      }
      if (!res.ok) return;
      const body = (await res.json().catch(() => ({}))) as { due?: DueReminderView[] };
      const items = body.due ?? [];
      if (items.length === 0) return;
      setDue((prev) => [...prev, ...items.filter((i) => !prev.some((p) => p.spaceId === i.spaceId))]);
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        for (const item of items) {
          try {
            const n = new Notification(`${item.title} is on air`, {
              body: `${item.host.displayName ?? '@' + item.host.handle} just went live on Rabble Radio.`,
              tag: `rabble-reminder-${item.spaceId}`,
            });
            n.onclick = () => {
              window.focus();
              window.location.href = `/show/${encodeURIComponent(item.spaceId)}`;
            };
          } catch {
            // Notification constructor can throw on some platforms; the toast still shows.
          }
        }
      }
    } catch {
      // network hiccup: try again next tick
    }
  }, []);

  useEffect(() => {
    // If this browser already granted notifications, make sure the server
    // still has its push subscription (they rotate, and users sign in on
    // new browsers). Never prompts.
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      void ensurePushSubscription(false);
    }
    void poll();
    const timer = window.setInterval(() => void poll(), pollMs);
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [poll, pollMs]);

  // PersistentShowBar is also fixed to the bottom of the viewport; land
  // above it rather than inside its own height.
  const { barVisible } = useActiveRoom();

  if (due.length === 0) return null;
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4 ${
        barVisible ? 'bottom-24' : 'bottom-4'
      }`}
      data-testid="reminder-toasts"
      aria-live="polite"
    >
      {due.map((item) => (
        <div
          key={item.spaceId}
          className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-lg border border-[var(--color-live-border)] bg-[var(--color-surface)] p-3 shadow-xl"
          data-testid={`reminder-toast-${item.spaceId}`}
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-live)]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-semibold text-[var(--color-text)]">{item.title} is on air</p>
            <p className="truncate text-caption text-[var(--color-text-secondary)]">
              {item.host.displayName ?? `@${item.host.handle}`} just went live.
            </p>
          </div>
          <Link
            href={`/show/${encodeURIComponent(item.spaceId)}`}
            className="inline-flex h-10 items-center rounded-sm bg-[var(--color-accent)] px-3 text-label font-semibold text-white"
            onClick={() => setDue((prev) => prev.filter((p) => p.spaceId !== item.spaceId))}
            data-testid="reminder-toast-listen"
          >
            Listen
          </Link>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setDue((prev) => prev.filter((p) => p.spaceId !== item.spaceId))}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--color-text-secondary)]"
            data-testid="reminder-toast-dismiss"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}

export default ReminderToasts;
