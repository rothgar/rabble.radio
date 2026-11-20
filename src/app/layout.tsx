import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Fraunces, Inter } from 'next/font/google';
import './globals.css';
import { DiagnosticsInstaller } from '@/components/DiagnosticsInstaller';
import { ReminderToasts } from '@/components/ReminderToasts';
import { ActiveRoomProvider } from '@/components/ActiveRoomProvider';
import { PersistentShowBar } from '@/components/PersistentShowBar';
import { canonicalizeOrigin, defaultPublicOrigin } from '@/lib/spaces';

/**
 * `canonicalizeOrigin`'s own fallback is `defaultPublicOrigin()`, which just
 * re-reads the same env vars — so a malformed, scheme-less value (e.g.
 * `NEXT_PUBLIC_APP_URL=rabble.town`) comes back out unchanged and would
 * still throw from `new URL()` here, crashing every page's metadata. Guard
 * the construction itself so a misconfigured env var degrades instead of
 * taking the app down.
 */
function resolveAppUrl(): URL {
  try {
    return new URL(canonicalizeOrigin(defaultPublicOrigin()));
  } catch {
    return new URL('https://rabble.invalid');
  }
}

const appUrl = resolveAppUrl();

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

/* Display face: Fraunces at its heaviest weight with the "soft" optical axis
   is the open-licence stand-in for Cooper Black (docs/brand.md). */
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: 'variable',
  axes: ['SOFT', 'WONK', 'opsz'],
  display: 'swap',
  variable: '--font-fraunces',
});

export const metadata: Metadata = {
  metadataBase: appUrl,
  title: 'Rabble',
  description: 'Rabble Radio — live audio shows for Bluesky',
  openGraph: {
    type: 'website',
    siteName: 'Rabble',
    title: 'Rabble',
    description: 'Rabble Radio — live audio shows for Bluesky',
    url: appUrl.origin,
    images: [{ url: '/og-default.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f1faee' },
    { media: '(prefers-color-scheme: dark)', color: '#062b38' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <head>
        {/* Apply the stored appearance before first paint (see ThemeToggle). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('rabble-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}",
          }}
        />
      </head>
      <body className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] antialiased">
        <DiagnosticsInstaller />
        <ActiveRoomProvider>
          {children}
          <PersistentShowBar />
          <ReminderToasts />
        </ActiveRoomProvider>
      </body>
    </html>
  );
}
