'use client';

// src/components/AuthButton.tsx
//
// Client component that hits /api/me and renders either a sign-in form (with a
// handle input) or the authenticated user's handle with a logout link.

import { useCallback, useEffect, useState, type FormEvent, type ReactElement } from 'react';

interface MeResponse {
  id?: string;
  did?: string;
  handle?: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  error?: string;
}

export function AuthButton(): ReactElement {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [handle, setHandle] = useState('');
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/me', { credentials: 'include' });
      if (res.status === 401) {
        setMe(null);
        return;
      }
      const data = (await res.json()) as MeResponse;
      setMe(data);
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onSignIn = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = handle.trim();
      if (!trimmed) return;
      setLoading(true);
      window.location.href = `/api/auth/bluesky?handle=${encodeURIComponent(trimmed)}`;
    },
    [handle]
  );

  if (me?.handle) {
    return (
      <div className="flex items-center gap-3">
        {me.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={me.avatarUrl}
            alt=""
            className="h-8 w-8 rounded-full border border-slate-700"
          />
        ) : null}
        <span className="text-sm text-slate-200">@{me.handle}</span>
        <a
          href="/logout"
          className="rounded-md border border-slate-700 px-3 py-1 text-sm hover:bg-slate-800"
        >
          Sign out
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={onSignIn} className="flex items-center gap-2">
      <input
        type="text"
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        placeholder="alice.bsky.social"
        aria-label="Bluesky handle"
        className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
        required
        pattern="[a-zA-Z0-9._-]+"
      />
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-sky-600 px-3 py-1 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
      >
        Sign in with Bluesky
      </button>
    </form>
  );
}

export default AuthButton;
