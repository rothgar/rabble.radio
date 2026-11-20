// tests/app/show-metadata.test.ts
//
// generateMetadata for /show/[id] fetches GET /api/spaces/[id] over HTTP
// (never imports src/lib/spaces.ts -- that module pulls in Prisma, and this
// route must stay Prisma-free, see src/app/show/[id]/page.tsx). Mock global
// fetch directly rather than any server module.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PublicSpace } from '@/types';

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const originalPublicUrl = process.env.PUBLIC_URL;
const originalFetch = global.fetch;

function space(overrides: Partial<PublicSpace> = {}): PublicSpace {
  return {
    id: 'sp1',
    slug: 'friday-jams',
    title: 'Friday jams',
    description: null,
    isLive: true,
    status: 'live',
    scheduledAt: null,
    expiresAt: null,
    listenerCount: 0,
    speakerCount: 0,
    reactionCount: 0,
    tunedInCount: 0,
    likeCount: 0,
    sessionCount: 0,
    totalListeners: 0,
    hostedSeconds: 0,
    lastLiveAt: null,
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    host: {
      did: 'did:plc:host',
      handle: 'alice.bsky.social',
      displayName: 'Alice',
      avatarUrl: null,
    },
    shareableUrl: 'https://rabble.radio/show/sp1',
    replay: null,
    reminded: false,
    ...overrides,
  } as PublicSpace;
}

describe('generateMetadata for /show/[id]', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_APP_URL = 'https://rabble.radio';
    delete process.env.PUBLIC_URL;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    process.env.PUBLIC_URL = originalPublicUrl;
    global.fetch = originalFetch;
  });

  it('sets title/description/og from the fetched show', async () => {
    global.fetch = vi.fn(async (url: string) => {
      expect(url).toBe('https://rabble.radio/api/spaces/sp1');
      return new Response(JSON.stringify({ space: space() }), { status: 200 });
    }) as unknown as typeof fetch;

    const { generateMetadata } = await import('@/app/show/[id]/layout');
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'sp1' }),
    });

    expect(metadata.title).toBe('Friday jams');
    const openGraph = metadata.openGraph as {
      title?: string;
      description?: string;
      url?: string;
    };
    expect(openGraph.title).toBe('Friday jams');
    expect(openGraph.url).toBe('https://rabble.radio/show/sp1');
    const [image] = metadata.openGraph?.images as Array<{ url: string }>;
    expect(image.url).toBe('/og-default.png');
  });

  it('falls back to a sentence naming the host when the description is blank', async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ space: space({ description: '' }) }), {
        status: 200,
      })
    ) as unknown as typeof fetch;

    const { generateMetadata } = await import('@/app/show/[id]/layout');
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'sp1' }),
    });

    expect(metadata.description).toBe('A live show hosted by Alice.');
    const openGraph = metadata.openGraph as { description?: string };
    expect(openGraph.description).toBe('A live show hosted by Alice.');
  });

  it('falls back to the handle when the host has no display name', async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          space: space({
            description: null,
            host: {
              did: 'did:plc:host',
              handle: 'alice.bsky.social',
              displayName: null,
              avatarUrl: null,
            },
          }),
        }),
        { status: 200 }
      )
    ) as unknown as typeof fetch;

    const { generateMetadata } = await import('@/app/show/[id]/layout');
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'sp1' }),
    });

    expect(metadata.description).toBe('A live show hosted by alice.bsky.social.');
  });

  it('falls back to the site-wide metadata when the show 404s', async () => {
    global.fetch = vi.fn(async () => new Response('not found', { status: 404 })) as unknown as typeof fetch;

    const { generateMetadata } = await import('@/app/show/[id]/layout');
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'does-not-exist' }),
    });

    expect(metadata).toEqual({});
  });

  it('falls back to the site-wide metadata when the fetch throws', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const { generateMetadata } = await import('@/app/show/[id]/layout');
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'sp1' }),
    });

    expect(metadata).toEqual({});
  });

  it('falls back to PUBLIC_URL when NEXT_PUBLIC_APP_URL is unset', async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.PUBLIC_URL = 'https://rabble.jgarr.net';
    global.fetch = vi.fn(async (url: string) => {
      expect(url).toBe('https://rabble.jgarr.net/api/spaces/sp1');
      return new Response(JSON.stringify({ space: space() }), { status: 200 });
    }) as unknown as typeof fetch;

    const { generateMetadata } = await import('@/app/show/[id]/layout');
    await generateMetadata({ params: Promise.resolve({ id: 'sp1' }) });

    expect(global.fetch).toHaveBeenCalled();
  });

  it('degrades to a 404-only origin, instead of throwing, when both app URL vars are unset', async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.PUBLIC_URL;
    global.fetch = vi.fn(async (url: string) => {
      expect(url).toBe('https://rabble.invalid/api/spaces/sp1');
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const { generateMetadata } = await import('@/app/show/[id]/layout');
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'sp1' }),
    });

    expect(metadata).toEqual({});
  });

  it('degrades to a 404-only origin, instead of throwing, when NEXT_PUBLIC_APP_URL is scheme-less', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'rabble.town';
    global.fetch = vi.fn(async (url: string) => {
      expect(url).toBe('https://rabble.invalid/api/spaces/sp1');
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const { generateMetadata } = await import('@/app/show/[id]/layout');
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'sp1' }),
    });

    expect(metadata).toEqual({});
  });
});
