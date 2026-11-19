'use client';

import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import Link from 'next/link';
import { UserMenu } from '@/components/UserMenu';
import { StartShowMenu } from '@/components/StartShowMenu';
import { FeedbackButton } from '@/components/FeedbackButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AppInstallBanner } from '@/components/AppInstallBanner';
import { Button, Wordmark } from '@/components/ui';

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
    <>
    <header
      className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-translucent)] px-4 py-3 backdrop-blur sm:px-6"
      data-testid="site-header"
    >
      <Link
        href="/"
        className="flex items-center gap-2 text-[var(--color-text)]"
        data-testid="site-brand"
      >
        <Wordmark compact />
      </Link>

      <nav className="flex items-center gap-3">
        <ThemeToggle />
        <FeedbackButton className="hidden sm:inline-flex" />
        {me ? (
          <>
            <StartShowMenu size="sm" />
            <UserMenu
              handle={me.handle}
              displayName={me.displayName ?? null}
              avatarUrl={me.avatarUrl ?? null}
            />
          </>
        ) : (
          <Button href="/login" size="md" data-testid="site-signin">
            Sign in
          </Button>
        )}
      </nav>
    </header>
    <AppInstallBanner />
    </>
  );
}

export default SiteHeader;
