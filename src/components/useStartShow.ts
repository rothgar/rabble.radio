'use client';

// src/components/useStartShow.ts
//
// Shared "start a show" call: creates (or reopens, with a spaceId) an
// off-air show, hands the host token to the show page through
// sessionStorage exactly like CreateSpaceForm's "Start now", and navigates
// there. Used by StartShowButton (fixed spaceId) and StartShowMenu (a
// spaceId picked at click time).

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

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

export interface UseStartShow {
  busy: boolean;
  error: string | null;
  start: (spaceId?: string) => Promise<void>;
}

export function useStartShow(): UseStartShow {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    async (spaceId?: string) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch('/api/spaces', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(spaceId ? { startNow: true, spaceId } : { startNow: true }),
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
    },
    [busy, router]
  );

  return { busy, error, start };
}
