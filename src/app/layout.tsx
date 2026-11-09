import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Fraunces, Inter } from 'next/font/google';
import './globals.css';
import { DiagnosticsInstaller } from '@/components/DiagnosticsInstaller';
import { ReminderToasts } from '@/components/ReminderToasts';

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
  title: 'Rabble',
  description: 'Rabble Radio — live audio shows for Bluesky',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f1faee',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] antialiased">
        <DiagnosticsInstaller />
        {children}
        <ReminderToasts />
      </body>
    </html>
  );
}
