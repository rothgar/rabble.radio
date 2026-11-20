// tests/app/station-page.test.tsx
//
// Renders the /station/[tag] server component with mocked data access and
// checks the show list, the host cluster, the not-found and empty states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PublicSpace } from '@/types';

const { mockGetSpacesForUser, mockGetCurrentUser, mockCountPostsBySpace } =
  vi.hoisted(() => ({
    mockGetSpacesForUser: vi.fn(),
    mockGetCurrentUser: vi.fn(),
    mockCountPostsBySpace: vi.fn(),
  }));

vi.mock('@/lib/spaces', () => ({
  getSpacesForUser: mockGetSpacesForUser,
  tryExpireStaleSpaces: vi.fn(async () => 0),
  toPublicSpace: (s: PublicSpace) => s,
}));

vi.mock('@/lib/session', () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock('@/lib/posts', () => ({
  countPostsBySpace: mockCountPostsBySpace,
}));

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
    reactionCount: 2,
    tunedInCount: 3,
    likeCount: 0,
    sessionCount: 0,
    totalListeners: 0,
    hostedSeconds: 0,
    lastLiveAt: null,
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
    replay: null,
    reminded: false,
    isNamedShow: false,
    podcastFeedEnabled: false,
    podcastFeedUrl: null,
    ...overrides,
  };
}

async function renderStation(tag: string) {
  const { default: StationPage } = await import('@/app/station/[tag]/page');
  return render(await StationPage({ params: Promise.resolve({ tag }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(null);
  mockCountPostsBySpace.mockResolvedValue({});
});

describe('/station/[tag] page', () => {
  it('lists every show carrying the tag, including as a secondary tag', async () => {
    mockGetSpacesForUser.mockResolvedValue([
      makeShow({ id: 'sp1', tags: ['Music'] }),
      makeShow({
        id: 'sp2',
        title: 'Late night',
        tags: ['Comedy', 'Music'],
        host: {
          did: 'did:plc:other',
          handle: 'carol.bsky.social',
          displayName: 'Carol',
          avatarUrl: null,
        },
      }),
      makeShow({ id: 'sp3', title: 'Game night', tags: ['Gaming'] }),
    ]);
    mockCountPostsBySpace.mockResolvedValue({ sp1: 4 });

    await renderStation('Music');

    const shows = screen.getAllByTestId('station-show');
    expect(shows).toHaveLength(2);
    expect(screen.getByTestId('station-count')).toHaveTextContent('2 shows');
    // 3 + 3 listeners across the two shows carrying the tag (anonymous
    // listeners are part of listenerCount from the occupancy sweep).
    expect(screen.getByTestId('station-listeners')).toHaveTextContent('6 listening');
    expect(screen.getAllByTestId('station-host-avatar')).toHaveLength(2);
    expect(shows[0]).toHaveTextContent('4 posts');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Music');
    expect(mockCountPostsBySpace).toHaveBeenCalledWith(['sp1', 'sp2']);
  });

  it('renders the empty state for a valid station with no shows', async () => {
    mockGetSpacesForUser.mockResolvedValue([
      makeShow({ id: 'sp3', title: 'Game night', tags: ['Gaming'] }),
    ]);
    await renderStation('Music');
    expect(screen.getByTestId('station-empty')).toBeInTheDocument();
    expect(screen.queryAllByTestId('station-show')).toHaveLength(0);
  });

  it('renders not-found for an invalid tag without querying shows', async () => {
    await renderStation('Not A Category');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Station not found'
    );
    expect(mockGetSpacesForUser).not.toHaveBeenCalled();
  });

  it('renders not-found instead of throwing for a malformed percent-encoded tag', async () => {
    await renderStation('%');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Station not found'
    );
    expect(mockGetSpacesForUser).not.toHaveBeenCalled();
  });
});

describe('/station/[tag] metadata', () => {
  it('generates category-specific Open Graph metadata (#78)', async () => {
    const pageModule = await import('@/app/station/[tag]/page');
    expect(typeof pageModule.generateMetadata).toBe('function');

    const meta = await pageModule.generateMetadata!({
      params: Promise.resolve({ tag: 'Music' }),
    });
    expect(meta.title).toContain('Music');
    expect(meta.openGraph?.description).toBeTruthy();
  });

  it('does not throw generating metadata for an unrecognized tag (#78)', async () => {
    const pageModule = await import('@/app/station/[tag]/page');
    await expect(
      pageModule.generateMetadata!({
        params: Promise.resolve({ tag: 'Not A Category' }),
      })
    ).resolves.not.toThrow();
  });

  it('does not throw generating metadata for a malformed percent-encoded tag (#78)', async () => {
    const pageModule = await import('@/app/station/[tag]/page');
    await expect(
      pageModule.generateMetadata!({
        params: Promise.resolve({ tag: '%' }),
      })
    ).resolves.not.toThrow();
  });
});
