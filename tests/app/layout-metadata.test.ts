// tests/app/layout-metadata.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/font/google', () => ({
  Inter: () => ({ variable: '--font-inter' }),
  Fraunces: () => ({ variable: '--font-fraunces' }),
}));
vi.mock('@/components/DiagnosticsInstaller', () => ({ DiagnosticsInstaller: () => null }));
vi.mock('@/components/ReminderToasts', () => ({ ReminderToasts: () => null }));
vi.mock('@/components/ActiveRoomProvider', () => ({
  ActiveRoomProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock('@/components/PersistentShowBar', () => ({ PersistentShowBar: () => null }));

describe('root layout metadata', () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const originalPublicUrl = process.env.PUBLIC_URL;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    process.env.PUBLIC_URL = originalPublicUrl;
  });

  it('sets an absolute Open Graph image and a summary_large_image Twitter card', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://rabble.radio';
    const { metadata } = await import('@/app/layout');

    const openGraph = metadata.openGraph as { type?: string; siteName?: string; title?: string; description?: string };
    expect(metadata.title).toBe('Rabble');
    expect(openGraph.type).toBe('website');
    expect(openGraph.siteName).toBe('Rabble');
    expect(openGraph.title).toBe('Rabble');
    expect(openGraph.description).toBeTruthy();

    const [image] = metadata.openGraph?.images as Array<{ url: string; width: number; height: number }>;
    expect(image).toEqual({ url: '/og-default.png', width: 1200, height: 630 });

    const absoluteImageUrl = new URL(image.url, metadata.metadataBase as URL).href;
    expect(absoluteImageUrl).toBe('https://rabble.radio/og-default.png');
    expect(metadata.openGraph?.url).toBe('https://rabble.radio');

    const twitter = metadata.twitter as { card?: string };
    expect(twitter.card).toBe('summary_large_image');
  });

  it('falls back to the configured default origin when NEXT_PUBLIC_APP_URL and PUBLIC_URL are unset', async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.PUBLIC_URL;
    const { metadata } = await import('@/app/layout');

    expect((metadata.metadataBase as URL).href).toBe('https://rabble.invalid/');
  });

  it('does not crash when NEXT_PUBLIC_APP_URL is set but scheme-less', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'rabble.town';
    delete process.env.PUBLIC_URL;
    const { metadata } = await import('@/app/layout');

    expect((metadata.metadataBase as URL).href).toBe('https://rabble.invalid/');
  });
});
