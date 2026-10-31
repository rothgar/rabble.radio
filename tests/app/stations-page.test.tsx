// tests/app/stations-page.test.tsx
//
// Renders the /stations server component with mocked data access and checks
// that shows are grouped into station cards by primary tag, and that the
// empty state renders when nothing is on air.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PublicSpace } from '@/types';

const { mockGetSpacesForUser, mockGetCurrentUser } = vi.hoisted(() => ({
  mockGetSpacesForUser: vi.fn(),
  mockGetCurrentUser: vi.fn(),
}));

vi.mock('@/lib/spaces', () => ({
  getSpacesForUser: mockGetSpacesForUser,
  tryExpireStaleSpaces: vi.fn(async () => 0),
  // The page maps rows through toPublicSpace; our fixtures are already in the
  // public shape, so pass them through.
  toPublicSpace: (s: PublicSpace) => s,
}));

vi.mock('@/lib/session', () => ({
  getCurrentUser: mockGetCurrentUser,
}));

// SiteHeader is a client component that calls /api/me on mount.
vi.mock('@/components/SiteHeader', () => ({
  SiteHeader: () => <header data-testid="site-header" />,
}));

function makeShow(overrides: Partial<PublicSpace> = {}): PublicSpace {
  return {
    id: 'sp1',
    slug: 'sp1',
    title: 'Friday jams',
    description: null,
    isLive: true,
    status: 'live',
    scheduledAt: null,
    expiresAt: null,
    listenerCount: 3,
    speakerCount: 1,
    reactionCount: 0,
    tags: ['Music'],
    createdAt: '2025-02-01T00:00:00.000Z',
    updatedAt: '2025-02-01T00:00:00.000Z',
    host: {
      did: 'did:plc:host',
      handle: 'alice.bsky.social',
      displayName: 'Alice',
      avatarUrl: null,
    },
    shareableUrl: 'https://rabble.example/show/sp1',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(null);
});

describe('/stations page', () => {
  it('groups shows into station cards by primary tag', async () => {
    mockGetSpacesForUser.mockResolvedValue([
      // Sports sorts after Music in the category list, so Music stays the
      // primary tag and the show is grouped under the Music station.
      makeShow({ id: 'sp1', tags: ['Music', 'Sports'] }),
      makeShow({ id: 'sp2', title: 'Second set', tags: ['Music'] }),
      makeShow({ id: 'sp3', title: 'Game night', tags: ['Gaming'] }),
    ]);
    const { default: StationsPage } = await import('@/app/stations/page');
    render(await StationsPage());

    const cards = screen.getAllByTestId('station-card');
    const stations = cards.map((c) => c.getAttribute('data-station'));
    expect(stations).toEqual(expect.arrayContaining(['Music', 'Gaming']));
    expect(cards).toHaveLength(2);

    const music = cards.find((c) => c.getAttribute('data-station') === 'Music')!;
    expect(music).toHaveTextContent('2 shows');
    expect(music).toHaveAttribute('href', '/station/Music');
    const gaming = cards.find((c) => c.getAttribute('data-station') === 'Gaming')!;
    expect(gaming).toHaveTextContent('1 show');
    expect(screen.queryByTestId('home-empty')).not.toBeInTheDocument();
  });

  it('renders the empty state when there are no shows and no suggestions', async () => {
    mockGetSpacesForUser.mockResolvedValue([]);
    const { default: StationsPage } = await import('@/app/stations/page');
    render(await StationsPage());
    // With no shows, either the empty state or the "start a new station"
    // suggestions render; both are valid empty experiences but no station
    // card may appear.
    expect(screen.queryAllByTestId('station-card')).toHaveLength(0);
    const empty = screen.queryByTestId('home-empty');
    const suggestions = screen.queryByTestId('station-suggestions');
    expect(empty ?? suggestions).not.toBeNull();
  });

  it('passes the signed-in viewer to the listing query', async () => {
    mockGetCurrentUser.mockResolvedValue({
      did: 'did:plc:viewer',
      handle: 'viewer.bsky.social',
    });
    mockGetSpacesForUser.mockResolvedValue([makeShow()]);
    const { default: StationsPage } = await import('@/app/stations/page');
    render(await StationsPage());
    expect(mockGetSpacesForUser).toHaveBeenCalledWith('did:plc:viewer');
    expect(screen.getAllByTestId('station-card')).toHaveLength(1);
  });
});
