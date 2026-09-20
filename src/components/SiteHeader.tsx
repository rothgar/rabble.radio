'use client';

import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import Link from 'next/link';
import { UserMenu } from '@/components/UserMenu';

interface Me {
  did: string;
  handle: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

/**
 * Global site header shown on the main pages. Always renders the Rabble Radio
 * brand and navigation, plus the signed-in user's profile picture with a
 * logout menu (or a sign-in action when anonymous).
 */
export function SiteHeader(): ReactElement {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/me', { credentials: 'include' })
      .then((res) => (res.status === 401 ? null : res.json()))
      .then((data: Me | null) => {
        if (cancelled) return;
        setMe(data && data.did && data.handle ? data : null);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur sm:px-6"
      data-testid="site-header"
    >
      <Link
        href="/stations"
        className="flex items-center gap-2 text-slate-100"
        data-testid="site-brand"
      >
        <span
          aria-hidden
          className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-sky-700 text-sky-200"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
            <path d="M5 5a10 10 0 0 0 0 14" />
            <path d="M19 5a10 10 0 0 1 0 14" />
            <path d="M8 8a6 6 0 0 0 0 8" />
            <path d="M16 8a6 6 0 0 1 0 8" />
          </svg>
        </span>
        <span className="text-base font-medium tracking-tight">Rabble Radio</span>
      </Link>

      <nav className="flex items-center gap-3">
        {me ? (
          <UserMenu
            handle={me.handle}
            displayName={me.displayName ?? null}
            avatarUrl={me.avatarUrl ?? null}
          />
        ) : (
          <Link
            href="/login"
            className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 active:bg-sky-700"
            data-testid="site-signin"
          >
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}

export default SiteHeader;
