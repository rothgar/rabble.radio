import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';
import { DiagnosticsInstaller } from '@/components/DiagnosticsInstaller';
import { ReminderToasts } from '@/components/ReminderToasts';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Rabble',
  description: 'Rabble Radio — live audio shows for Bluesky',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] antialiased">
        <DiagnosticsInstaller />
        {children}
        <ReminderToasts />
      </body>
    </html>
  );
}
