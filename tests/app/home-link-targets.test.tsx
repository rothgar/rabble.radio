// tests/app/home-link-targets.test.tsx
//
// Every internal link the home page renders must land on something the app
// actually serves. The home page used to link each host in the "Popular
// hosts" strip at /podcast/<handle>, where only the feed documents under it
// exist (src/app/podcast/[handle]/feed.xml) — no page renders at that path,
// so tapping a host from the home page landed on the Next.js 404 page.
//
// Like tests/app/route-runtime.test.ts, this reads the route tree from disk
// rather than hardcoding a list, so it holds whatever the home page links at:
// it asks only that no internal link from the home page 404s.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import type { PublicSpace } from '@/types';

const m = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSpacesForUser: vi.fn(),
  decoratePublicSpaces: vi.fn(),
  getTopHosts: vi.fn(),
  getBlockedDids: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getCurrentUser: m.getCurrentUser }));
vi.mock('@/lib/spaces', () => ({
  getSpacesForUser: m.getSpacesForUser,
  toPublicSpace: (s: PublicSpace) => s,
}));
vi.mock('@/lib/space-extras', () => ({ decoratePublicSpaces: m.decoratePublicSpaces }));
vi.mock('@/lib/hosts', () => ({ getTopHosts: m.getTopHosts }));
vi.mock('@/lib/blocks', () => ({ getBlockedDids: m.getBlockedDids }));
vi.mock('@/components/SiteHeader', () => ({ SiteHeader: () => <header data-testid="site-header" /> }));
vi.mock('@/components/StartShowMenu', () => ({
  StartShowMenu: () => <button data-testid="start-show-button">Start a show</button>,
}));

import { HomeBody } from '@/app/page';

const appDir = join(__dirname, '..', '..', 'src', 'app');

/** Path patterns for every page and route the App Router serves. */
const served = (readdirSync(appDir, { recursive: true }) as string[])
  .filter((f) => /(^|\/)(page|route)\.[tj]sx?$/.test(f))
  .map((f) => f.replace(/(^|\/)(page|route)\.[tj]sx?$/, '$1'))
  .map((dir) => {
    const segments = dir
      .split('/')
      .filter(Boolean)
      .map((seg) => {
        if (seg.startsWith('[...')) return '/.*';
        if (seg.startsWith('[')) return '/[^/]+';
        return `/${seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
      })
      .join('');
    // The app root ("page.tsx" at src/app/) reduces to an empty `dir`; match
    // the literal "/" for it rather than the empty string, which no real
    // path is ever equal to.
    return new RegExp('^' + (segments || '/') + '$');
  });

function isServed(path: string): boolean {
  return served.some((r) => r.test(path));
}

function show(overrides: Partial<PublicSpace>): PublicSpace {
  return {
    id: 'sp', slug: 'sp', title: 'Show', description: null, isLive: false, status: 'active',
    scheduledAt: null, expiresAt: null, listenerCount: 0, speakerCount: 0, reactionCount: 0,
    tunedInCount: 0, likeCount: 0, sessionCount: 0, totalListeners: 0, hostedSeconds: 0, lastLiveAt: null,
    tags: ['Music'], createdAt: '', updatedAt: '', shareableUrl: '',
    host: { did: 'did:h', handle: 'host.test', displayName: 'Host', avatarUrl: null },
    onStageHosts: [{ did: 'did:h', handle: 'host.test', displayName: 'Host', avatarUrl: null }],
    replay: null, reminded: false, isNamedShow: false, podcastFeedEnabled: false, podcastFeedUrl: null,
    ...overrides,
  };
}

const LIVE = show({ id: 'live1', title: 'Big Room', isLive: true, status: 'live', listenerCount: 40 });

function internalHrefs(): string[] {
  return Array.from(document.querySelectorAll('a[href]'))
    .map((a) => a.getAttribute('href') ?? '')
    .filter((h) => h.startsWith('/') && !h.startsWith('//'))
    .map((h) => {
      const path = h.split('?')[0].split('#')[0];
      try {
        return decodeURIComponent(path);
      } catch {
        return path;
      }
    });
}

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  m.getSpacesForUser.mockResolvedValue([LIVE]);
  m.decoratePublicSpaces.mockImplementation(async (s: PublicSpace[]) => s);
  m.getBlockedDids.mockResolvedValue(new Set());
  m.getTopHosts.mockResolvedValue([
    { host: { did: 'did:h', handle: 'host.test', displayName: 'Host', avatarUrl: null }, popularity: 9, upcoming: [] },
  ]);
});

describe('home page link targets', () => {
  it('serves the routes the signed-out home page links to', async () => {
    render(await HomeBody());
    // The popular-hosts strip is rendered, so its links are really checked.
    expect(screen.getByTestId('home-host-host.test')).toBeTruthy();
    const hrefs = internalHrefs();
    expect(hrefs.length).toBeGreaterThan(0);
    const orphaned = hrefs.filter((h) => !isServed(h));
    expect(orphaned, `home page links to paths no page or route serves: ${orphaned.join(', ')}`).toEqual([]);
  });

  it('serves the routes the signed-in home page links to', async () => {
    m.getCurrentUser.mockResolvedValue({
      did: 'did:me',
      handle: 'me.test',
      displayName: 'Me',
      avatarUrl: null,
    } as never);
    render(await HomeBody());
    const hrefs = internalHrefs();
    expect(hrefs.length).toBeGreaterThan(0);
    const orphaned = hrefs.filter((h) => !isServed(h));
    expect(orphaned, `home page links to paths no page or route serves: ${orphaned.join(', ')}`).toEqual([]);
  });
});
