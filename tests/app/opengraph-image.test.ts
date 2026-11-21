// tests/app/opengraph-image.test.ts
//
// Per-show opengraph image: fetches GET /api/spaces/[id], the Fraunces
// font, and (for an allowed host) each avatar over HTTP (same Prisma-free
// constraint as layout.tsx, see its header comment), then renders a PNG
// with next/og's ImageResponse. Every one of those fetches must degrade to
// a fallback rather than throw -- satori has no error boundary, so an
// uncaught throw mid-render is a bare 500 with no image at all (see
// REVIEW.md).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicHost, PublicSpace } from '@/types';

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const originalFetch = global.fetch;

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

function host(did: string, overrides: Partial<PublicHost> = {}): PublicHost {
  return { did, handle: did, displayName: null, avatarUrl: null, ...overrides };
}

function space(onStageHosts: PublicHost[]): PublicSpace {
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
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    host: onStageHosts[0],
    onStageHosts,
    shareableUrl: 'https://rabble.radio/show/sp1',
    replay: null,
    reminded: false,
    isNamedShow: true,
    podcastFeedEnabled: false,
    podcastFeedUrl: null,
  } as PublicSpace;
}

type AvatarBehavior = 'network-error' | number | 'ok';

function mockFetch(opts: {
  spaceRow: PublicSpace | null;
  fontOk?: boolean;
  avatars?: Record<string, AvatarBehavior>;
}): void {
  const { spaceRow, fontOk = true, avatars = {} } = opts;
  const fontData = readFile(join(process.cwd(), 'assets/fonts/Fraunces72ptSoft-Black.ttf'));
  global.fetch = vi.fn(async (url: string) => {
    if (url.endsWith('/fonts/fraunces-black.ttf')) {
      if (!fontOk) throw new Error('font fetch failed');
      return new Response(await fontData);
    }
    if (url.includes('/api/spaces/')) {
      if (!spaceRow) return new Response('not found', { status: 404 });
      return new Response(JSON.stringify({ space: spaceRow }), { status: 200 });
    }
    const behavior = avatars[url];
    if (behavior === 'network-error') throw new Error('network down');
    if (typeof behavior === 'number') return new Response('err', { status: behavior });
    if (behavior === 'ok') return new Response(TINY_PNG, { headers: { 'content-type': 'image/png' } });
    throw new Error(`unexpected fetch to ${url}`);
  }) as unknown as typeof fetch;
}

afterEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  global.fetch = originalFetch;
  vi.resetModules();
});

describe('opengraph-image for /show/[id]', () => {
  it('renders a 1200x630 PNG with the show\'s on-stage hosts', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://rabble.radio';
    mockFetch({ spaceRow: space([host('did:h', { displayName: 'Alice' }), host('did:g', { displayName: 'Guest' })]) });

    const { default: Image, size, contentType } = await import('@/app/show/[id]/opengraph-image');
    const response = await Image({ params: Promise.resolve({ id: 'sp1' }) });

    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe('image/png');
    expect(response.headers.get('content-type')).toBe('image/png');
    const bytes = await response.arrayBuffer();
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it('still renders branding only when the show 404s', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://rabble.radio';
    mockFetch({ spaceRow: null });

    const { default: Image } = await import('@/app/show/[id]/opengraph-image');
    const response = await Image({ params: Promise.resolve({ id: 'missing' }) });

    expect(response.headers.get('content-type')).toBe('image/png');
    const bytes = await response.arrayBuffer();
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it('fetches the show and the font from the resolved app origin', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://rabble.radio';
    mockFetch({ spaceRow: space([host('did:h')]) });

    const { default: Image } = await import('@/app/show/[id]/opengraph-image');
    await Image({ params: Promise.resolve({ id: 'sp1' }) });

    const calledUrls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(calledUrls).toContain('https://rabble.radio/api/spaces/sp1');
    expect(calledUrls).toContain('https://rabble.radio/fonts/fraunces-black.ttf');
  });

  it('still renders when the font fetch fails, falling back to the default face', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://rabble.radio';
    mockFetch({ spaceRow: space([host('did:h')]), fontOk: false });

    const { default: Image } = await import('@/app/show/[id]/opengraph-image');
    const response = await Image({ params: Promise.resolve({ id: 'sp1' }) });

    expect(response.headers.get('content-type')).toBe('image/png');
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it('falls back to initials when an avatar fetch fails', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://rabble.radio';
    const avatarUrl = 'https://cdn.bsky.app/img/avatar/plain/did:h/abc@jpeg';
    mockFetch({
      spaceRow: space([host('did:h', { avatarUrl })]),
      avatars: { [avatarUrl]: 'network-error' },
    });

    const { default: Image } = await import('@/app/show/[id]/opengraph-image');
    const response = await Image({ params: Promise.resolve({ id: 'sp1' }) });

    expect(response.headers.get('content-type')).toBe('image/png');
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it('never fetches an avatar host outside bsky.app/bsky.network', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://rabble.radio';
    const avatarUrl = 'https://evil.example.com/avatar.png';
    mockFetch({ spaceRow: space([host('did:h', { avatarUrl })]) });

    const { default: Image } = await import('@/app/show/[id]/opengraph-image');
    const response = await Image({ params: Promise.resolve({ id: 'sp1' }) });

    const calledUrls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(calledUrls).not.toContain(avatarUrl);
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it('fetches and inlines an avatar from an allowed host', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://rabble.radio';
    const avatarUrl = 'https://cdn.bsky.app/img/avatar/plain/did:h/abc@jpeg';
    mockFetch({
      spaceRow: space([host('did:h', { avatarUrl })]),
      avatars: { [avatarUrl]: 'ok' },
    });

    const { default: Image } = await import('@/app/show/[id]/opengraph-image');
    const response = await Image({ params: Promise.resolve({ id: 'sp1' }) });

    const calledUrls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(calledUrls).toContain(avatarUrl);
    expect(response.headers.get('content-type')).toBe('image/png');
  });

  it("requests cdn.bsky.app's jpeg encode, not whatever format the stored URL defaults to", async () => {
    // cdn.bsky.app defaults to WebP, which next/og's bundled rasterizer
    // can't decode (silently renders a blank circle, no error -- verified
    // against the real CDN; see REVIEW.md). `@jpeg` is swapped in
    // regardless of whether the stored URL already names a format.
    process.env.NEXT_PUBLIC_APP_URL = 'https://rabble.radio';
    const storedUrl = 'https://cdn.bsky.app/img/avatar/plain/did:h/abc';
    const storedUrlWithFormat = 'https://cdn.bsky.app/img/avatar/plain/did:g/def@png';
    mockFetch({
      spaceRow: space([host('did:h', { avatarUrl: storedUrl }), host('did:g', { avatarUrl: storedUrlWithFormat })]),
      avatars: {
        'https://cdn.bsky.app/img/avatar/plain/did:h/abc@jpeg': 'ok',
        'https://cdn.bsky.app/img/avatar/plain/did:g/def@jpeg': 'ok',
      },
    });

    const { default: Image } = await import('@/app/show/[id]/opengraph-image');
    const response = await Image({ params: Promise.resolve({ id: 'sp1' }) });

    const calledUrls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(calledUrls).toContain('https://cdn.bsky.app/img/avatar/plain/did:h/abc@jpeg');
    expect(calledUrls).toContain('https://cdn.bsky.app/img/avatar/plain/did:g/def@jpeg');
    expect(calledUrls).not.toContain(storedUrl);
    expect(calledUrls).not.toContain(storedUrlWithFormat);
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it('fetches a bsky.network PDS blob host as stored, with no @jpeg suffix', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://rabble.radio';
    const avatarUrl = 'https://my-pds.host.bsky.network/img/blob/abc';
    mockFetch({
      spaceRow: space([host('did:h', { avatarUrl })]),
      avatars: { [avatarUrl]: 'ok' },
    });

    const { default: Image } = await import('@/app/show/[id]/opengraph-image');
    const response = await Image({ params: Promise.resolve({ id: 'sp1' }) });

    const calledUrls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(calledUrls).toContain(avatarUrl);
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });
});
