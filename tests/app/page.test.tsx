// tests/app/page.test.tsx — the home page

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Suspense, type ReactElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import type { PublicSpace } from '@/types';

const m = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSpacesForUser: vi.fn(),
  decoratePublicSpaces: vi.fn(),
  getTopHosts: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getCurrentUser: m.getCurrentUser }));
vi.mock('@/lib/spaces', () => ({
  getSpacesForUser: m.getSpacesForUser,
  toPublicSpace: (s: PublicSpace) => s,
}));
vi.mock('@/lib/space-extras', () => ({ decoratePublicSpaces: m.decoratePublicSpaces }));
vi.mock('@/lib/hosts', () => ({ getTopHosts: m.getTopHosts }));
vi.mock('@/components/SiteHeader', () => ({ SiteHeader: () => <header data-testid="site-header" /> }));
vi.mock('@/components/StartShowMenu', () => ({
  StartShowMenu: () => <button data-testid="start-show-button">Start a show</button>,
}));

import HomePage, { HomeBody, HomeSkeleton } from '@/app/page';

function show(overrides: Partial<PublicSpace>): PublicSpace {
  return {
    id: 'sp', slug: 'sp', title: 'Show', description: null, isLive: false, status: 'active',
    scheduledAt: null, expiresAt: null, listenerCount: 0, speakerCount: 0, reactionCount: 0,
    likeCount: 0, sessionCount: 0, totalListeners: 0, hostedSeconds: 0, lastLiveAt: null,
    tags: ['Music'], createdAt: '', updatedAt: '', shareableUrl: '',
    host: { did: 'did:h', handle: 'host.test', displayName: 'Host', avatarUrl: null },
    replay: null, reminded: false, podcastFeedEnabled: false, podcastFeedUrl: null,
    ...overrides,
  };
}

const LIVE = show({ id: 'live1', title: 'Big Room', isLive: true, status: 'live', listenerCount: 40 });
const SMALL = show({ id: 'live2', title: 'Small Room', isLive: true, status: 'live', listenerCount: 2 });
const SCHEDULED = show({ id: 'sch1', title: 'Later', status: 'scheduled', scheduledAt: '2026-11-08T10:00:00.000Z' });

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  m.getSpacesForUser.mockResolvedValue([SMALL, LIVE, SCHEDULED]);
  m.decoratePublicSpaces.mockImplementation(async (s: PublicSpace[]) => s);
  m.getTopHosts.mockResolvedValue([
    { host: { did: 'did:h', handle: 'host.test', displayName: 'Host', avatarUrl: null }, popularity: 9, upcoming: [] },
  ]);
});

describe('HomePage signed out', () => {
  beforeEach(() => m.getCurrentUser.mockResolvedValue(null));

  it('offers listen-now, sign in and a login-gated Start a show', async () => {
    render(await HomeBody());
    expect(screen.getByTestId('home-signed-out')).toBeTruthy();
    expect(screen.getByTestId('home-listen-now').getAttribute('href')).toBe('/show/live1?listen=1');
    expect(screen.getByTestId('home-signin').getAttribute('href')).toBe('/login?next=%2F');
    expect(screen.getByTestId('home-start-show').getAttribute('href')).toBe('/login?next=%2Fme');
    expect(screen.queryByTestId('start-show-button')).toBeNull();
  });

  it('ranks on-air shows by room size with one-click Listen links', async () => {
    render(await HomeBody());
    const cards = screen.getByTestId('home-on-air').querySelectorAll('[data-testid^="show-list-card-"]');
    expect(Array.from(cards).map((c) => c.getAttribute('data-testid'))).toEqual(['show-list-card-live1', 'show-list-card-live2']);
    const action = cards[0].querySelector('[data-testid="show-list-action"]');
    expect(action?.textContent).toBe('Listen');
    expect(action?.getAttribute('href')).toBe('/show/live1?listen=1');
    expect(screen.getByTestId('home-popular')).toBeTruthy();
    expect(screen.getByTestId('home-host-host.test')).toBeTruthy();
    expect(screen.getByTestId('home-stations')).toBeTruthy();
    expect(screen.queryByTestId('home-for-you')).toBeNull();
  });
});

describe('HomePage signed in', () => {
  beforeEach(() => m.getCurrentUser.mockResolvedValue({ did: 'did:v', handle: 'viewer.test' }));

  it('shows Start a show and a For you section from follows', async () => {
    m.decoratePublicSpaces.mockImplementation(async (s: PublicSpace[]) =>
      s.map((x) => (x.id === 'live2' ? { ...x, hostFollowed: true } : { ...x, hostFollowed: false, followedInRoom: [] }))
    );
    render(await HomeBody());
    expect(screen.getByTestId('home-signed-in')).toBeTruthy();
    expect(screen.getByTestId('start-show-button')).toBeTruthy();
    expect(m.decoratePublicSpaces).toHaveBeenCalledWith(expect.any(Array), 'did:v');
    const forYou = screen.getByTestId('home-for-you');
    expect(forYou.querySelectorAll('[data-testid^="show-list-card-"]')).toHaveLength(1);
    expect(forYou.querySelector('[data-testid="show-list-following"]')).toBeTruthy();
  });

  it('shows an empty state when nothing is on air', async () => {
    m.getSpacesForUser.mockResolvedValue([SCHEDULED]);
    render(await HomeBody());
    expect(screen.getByTestId('home-on-air-empty')).toBeTruthy();
  });
});

describe('HomePage shell', () => {
  it('streams a skeleton with the pitch while the body loads', () => {
    render(<HomeSkeleton />);
    expect(screen.getByTestId('home-skeleton').getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('On air now')).toBeTruthy();
  });

  it('wraps the body in Suspense with the skeleton as fallback', () => {
    const el = HomePage();
    const children = (el.props as { children: ReactElement[] }).children;
    const layout = children[1];
    const suspense = (layout.props as { children: ReactElement }).children;
    expect(suspense.type).toBe(Suspense);
    expect((suspense.props as { fallback: ReactElement }).fallback.type).toBe(HomeSkeleton);
    expect((suspense.props as { children: ReactElement }).children.type).toBe(HomeBody);
  });
});
