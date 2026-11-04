// tests/app/me-page.test.tsx
//
// The signed-in account page: redirects anonymous visitors to login, and
// renders hosted stations (with recordings) and joined shows.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const m = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getUserByDid: vi.fn(),
  getHostedSpaces: vi.fn(),
  getJoinedShows: vi.fn(),
  getRecordingsForHost: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: m.redirect }));
vi.mock('@/lib/session', () => ({ getCurrentUser: m.getCurrentUser }));
vi.mock('@/lib/users', () => ({ getUserByDid: m.getUserByDid }));
vi.mock('@/lib/spaces', () => ({
  getHostedSpaces: m.getHostedSpaces,
  defaultPublicOrigin: () => 'https://rabble.rodeo',
  toPublicSpace: (s: Record<string, unknown>) => ({
    ...s,
    tags: s.tags ?? [],
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    scheduledAt: null,
    expiresAt: null,
    lastLiveAt: null,
    shareableUrl: `https://rabble.rodeo/show/${s.id}`,
  }),
}));
vi.mock('@/lib/metrics', () => ({ getJoinedShows: m.getJoinedShows }));
vi.mock('@/lib/recording', () => ({
  getRecordingsForHost: m.getRecordingsForHost,
  toPublicRecording: (r: Record<string, unknown>) => ({
    ...r,
    startedAt: '2026-11-01T10:00:00.000Z',
    endedAt: null,
    expiresAt: '2026-12-01T10:00:00.000Z',
    publishedAt: null,
  }),
}));
vi.mock('@/components/SiteHeader', () => ({
  SiteHeader: () => <header data-testid="site-header" />,
}));
vi.mock('@/components/StartShowButton', () => ({
  StartShowButton: () => <button data-testid="start-show-button">Start a show</button>,
}));

function hostedSpace(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sp1',
    slug: 'sp1',
    title: 'Friday jams',
    description: null,
    isLive: false,
    status: 'expired',
    listenerCount: 0,
    speakerCount: 0,
    reactionCount: 3,
    likeCount: 2,
    sessionCount: 4,
    totalListeners: 40,
    hostedSeconds: 5400,
    tags: ['Music'],
    host: { did: 'did:plc:me', handle: 'me.bsky.social', displayName: 'Me', avatarUrl: null },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.getCurrentUser.mockResolvedValue({ did: 'did:plc:me', handle: 'me.bsky.social' });
  m.getUserByDid.mockResolvedValue({
    did: 'did:plc:me',
    handle: 'me.bsky.social',
    displayName: 'Me',
    avatarUrl: null,
  });
  m.getHostedSpaces.mockResolvedValue([]);
  m.getJoinedShows.mockResolvedValue([]);
  m.getRecordingsForHost.mockResolvedValue([]);
});

describe('/me', () => {
  it('sends anonymous visitors to login', async () => {
    m.getCurrentUser.mockResolvedValueOnce(null);
    const { default: MePage } = await import('@/app/me/page');
    await expect(MePage()).rejects.toThrow('REDIRECT:/login?next=%2Fme');
  });

  it('renders the empty states and the podcast feed URL', async () => {
    const { default: MePage } = await import('@/app/me/page');
    render(await MePage());
    expect(screen.getByTestId('me-hosted-empty')).toBeInTheDocument();
    expect(screen.getByTestId('me-joined-empty')).toBeInTheDocument();
    expect(screen.getByTestId('me-podcast-feed-url')).toHaveTextContent(
      'https://rabble.rodeo/podcast/me.bsky.social/feed.xml'
    );
    expect(screen.getAllByTestId('start-show-button').length).toBeGreaterThan(0);
  });

  it('lists hosted stations with their recordings and joined shows', async () => {
    m.getHostedSpaces.mockResolvedValueOnce([hostedSpace()]);
    m.getRecordingsForHost.mockResolvedValueOnce([
      {
        id: 'rec1',
        spaceId: 'sp1',
        status: 'available',
        sizeBytes: 2048,
        published: true,
        contentType: 'video/mp4',
      },
    ]);
    m.getJoinedShows.mockResolvedValueOnce([
      {
        sessionId: 'sess1',
        role: 'listener',
        joinedAt: new Date('2026-11-01T10:00:00Z'),
        leftAt: null,
        stageSeconds: 0,
        session: { startedAt: new Date(), endedAt: null, durationSeconds: 0, uniqueListeners: 1 },
        space: {
          id: 'sp9',
          title: 'Other show',
          status: 'live',
          isLive: true,
          tags: [],
          host: { did: 'did:plc:other', handle: 'other.bsky.social', displayName: null, avatarUrl: null },
        },
      },
    ]);
    const { default: MePage } = await import('@/app/me/page');
    render(await MePage());

    const hosted = screen.getByTestId('hosted-show-sp1');
    expect(hosted).toHaveTextContent('Friday jams');
    expect(screen.getByTestId('hosted-show-stats')).toHaveTextContent('4 shows · 40 listeners · 2 likes · 1h 30m on air');
    expect(screen.getByTestId('recording-rec1')).toHaveAttribute('data-published', 'true');

    const joined = screen.getByTestId('joined-show-sess1');
    expect(joined).toHaveTextContent('Other show');
    expect(joined).toHaveTextContent('@other.bsky.social');
    expect(screen.getByTestId('joined-show-role')).toHaveTextContent('Listened');
  });
});
