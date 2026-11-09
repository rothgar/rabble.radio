'use client';

// src/components/AppInstallBanner.tsx
//
// A slim strip under the site header on phones: "Get the Rabble app" with the
// right link for the device (TestFlight on iPhone, the APK on Android).
// Dismissing it is remembered per browser. Desktop browsers never see it;
// they get the /downloads page instead.

import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import Link from 'next/link';
import { DeviceMobile, X } from '@phosphor-icons/react';
import { appLinkFor, detectMobilePlatform, type MobilePlatform } from '@/lib/apps';

export const APP_BANNER_DISMISSED_KEY = 'rabble-app-banner-dismissed';

export function AppInstallBanner(): ReactElement | null {
  const [platform, setPlatform] = useState<MobilePlatform | null>(null);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(APP_BANNER_DISMISSED_KEY) === '1';
    } catch {
      /* storage unavailable: show the banner */
    }
    if (dismissed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- depends on navigator, client only
    setPlatform(detectMobilePlatform(navigator.userAgent, navigator.maxTouchPoints));
  }, []);

  if (!platform) return null;

  const dismiss = (): void => {
    try {
      window.localStorage.setItem(APP_BANNER_DISMISSED_KEY, '1');
    } catch {
      /* ignore */
    }
    setPlatform(null);
  };

  const label = platform === 'ios' ? 'Get the Rabble app for iPhone' : 'Get the Rabble app for Android';
  const cta = platform === 'ios' ? 'Open TestFlight' : 'Download APK';

  return (
    <div
      className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-highlight-muted)] px-4 py-2 sm:px-6"
      data-testid="app-install-banner"
      data-platform={platform}
    >
      <DeviceMobile size={20} weight="bold" className="shrink-0 text-[var(--color-text)]" aria-hidden />
      <Link href="/downloads" className="min-w-0 flex-1 truncate text-label font-semibold text-[var(--color-text)]">
        {label}
      </Link>
      <a
        href={appLinkFor(platform)}
        className="inline-flex min-h-[36px] shrink-0 items-center rounded-sm border border-[var(--color-border)] bg-[var(--color-accent)] px-3 text-label font-semibold text-white"
        data-testid="app-install-cta"
      >
        {cta}
      </a>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Hide"
        className="inline-flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
        data-testid="app-install-dismiss"
      >
        <X size={18} weight="bold" aria-hidden />
      </button>
    </div>
  );
}

export default AppInstallBanner;
