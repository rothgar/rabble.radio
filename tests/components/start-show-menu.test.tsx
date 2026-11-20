// tests/components/start-show-menu.test.tsx
//
// The recent-shows selector at the "Start a show" entry points: a plain
// button for a host with zero or one hosted show, a picker over their
// recent shows when they have more than one.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PublicSpace } from '@/types';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { StartShowMenu } from '@/components/StartShowMenu';

function show(overrides: Partial<PublicSpace>): PublicSpace {
  return {
    id: 'sp', slug: 'sp', title: 'Show', description: null, isLive: false, status: 'active',
    scheduledAt: null, expiresAt: null, listenerCount: 0, speakerCount: 0, reactionCount: 0,
    likeCount: 0, sessionCount: 0, totalListeners: 0, hostedSeconds: 0, lastLiveAt: null,
    tags: [], createdAt: '', updatedAt: '', shareableUrl: '',
    host: { did: 'did:h', handle: 'host.test', displayName: 'Host', avatarUrl: null },
    replay: null, reminded: false, podcastFeedEnabled: false, podcastFeedUrl: null,
    ...overrides,
  };
}

const DEFAULT_SHOW = show({ id: 'sp-default', title: 'host.test’s show' });
const NAMED_SHOW = show({ id: 'sp-named', title: 'Friday jams', tags: ['Music'] });

function mockFetch(hosted: PublicSpace[]): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url === '/api/me/shows') {
      return Promise.resolve({ ok: true, json: async () => ({ hosted, joined: [] }) });
    }
    if (url === '/api/spaces') {
      return Promise.resolve({ ok: true, status: 201, json: async () => ({ space: { id: 'started' } }) });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  pushMock.mockReset();
  vi.unstubAllGlobals();
});

describe('<StartShowMenu /> with zero or one hosted show', () => {
  it('renders the plain button with no picker chrome when the host has no shows', async () => {
    mockFetch([]);
    render(<StartShowMenu />);
    await waitFor(() => expect(screen.getByTestId('start-show-button')).toBeTruthy());
    expect(screen.queryByTestId('start-show-menu-trigger')).toBeNull();
  });

  it('renders the plain button when the host has only their default show', async () => {
    mockFetch([DEFAULT_SHOW]);
    render(<StartShowMenu />);
    await waitFor(() => expect(screen.getByTestId('start-show-button')).toBeTruthy());
    expect(screen.queryByTestId('start-show-menu-trigger')).toBeNull();
  });
});

describe('<StartShowMenu /> with several hosted shows', () => {
  it('shows a picker trigger alongside the main button', async () => {
    mockFetch([NAMED_SHOW, DEFAULT_SHOW]);
    render(<StartShowMenu />);
    await waitFor(() => expect(screen.getByTestId('start-show-menu-trigger')).toBeTruthy());
    expect(screen.getByTestId('start-show-button')).toBeTruthy();
  });

  it('starts the default show when the main button is clicked', async () => {
    const fetchMock = mockFetch([NAMED_SHOW, DEFAULT_SHOW]);
    render(<StartShowMenu />);
    await waitFor(() => expect(screen.getByTestId('start-show-menu-trigger')).toBeTruthy());
    fireEvent.click(screen.getByTestId('start-show-button'));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/show/started'));
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/spaces');
    expect(JSON.parse((call?.[1] as RequestInit).body as string)).toEqual({ startNow: true });
  });

  it('lists the recent shows and reopens the one picked', async () => {
    const fetchMock = mockFetch([NAMED_SHOW, DEFAULT_SHOW]);
    render(<StartShowMenu />);
    await waitFor(() => expect(screen.getByTestId('start-show-menu-trigger')).toBeTruthy());
    fireEvent.click(screen.getByTestId('start-show-menu-trigger'));
    expect(screen.getByTestId('start-show-menu-panel')).toBeTruthy();
    expect(screen.getByText('Friday jams')).toBeTruthy();
    expect(screen.getByText('Music')).toBeTruthy();

    fireEvent.click(screen.getByTestId(`start-show-menu-option-${NAMED_SHOW.id}`));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/show/started'));
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/spaces');
    expect(JSON.parse((call?.[1] as RequestInit).body as string)).toEqual({
      startNow: true,
      spaceId: NAMED_SHOW.id,
    });
    expect(screen.queryByTestId('start-show-menu-panel')).toBeNull();
  });

  it('closes the picker on an outside click', async () => {
    mockFetch([NAMED_SHOW, DEFAULT_SHOW]);
    render(<StartShowMenu />);
    await waitFor(() => expect(screen.getByTestId('start-show-menu-trigger')).toBeTruthy());
    fireEvent.click(screen.getByTestId('start-show-menu-trigger'));
    expect(screen.getByTestId('start-show-menu-panel')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('start-show-menu-panel')).toBeNull();
  });

  it('keeps both the button and the trigger as 44px touch targets', async () => {
    mockFetch([NAMED_SHOW, DEFAULT_SHOW]);
    render(<StartShowMenu />);
    await waitFor(() => expect(screen.getByTestId('start-show-menu-trigger')).toBeTruthy());
    expect(screen.getByTestId('start-show-button').className).toContain('min-h-touch');
    expect(screen.getByTestId('start-show-menu-trigger').className).toContain('min-h-touch');
    expect(screen.getByTestId('start-show-menu-trigger').className).toContain('min-w-touch');
  });
});
