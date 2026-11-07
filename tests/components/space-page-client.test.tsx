// tests/components/space-page-client.test.tsx
//
// Exercises the auto-join handoff: when CreateSpaceForm stores a join
// payload in sessionStorage under `rabble_join_<spaceId>`, mounting
// SpacePageClient should consume it and render SpaceRoom directly.

vi.mock('@/components/SpaceRoom', () => ({
  SpaceRoom: () => <div data-testid="space-room">SpaceRoom</div>,
}));

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SpacePageClient } from '@/components/SpacePageClient';

const SPACE_ID = 'sp-auto-join';

function baseProps() {
  return {
    spaceId: SPACE_ID,
    isAuthenticated: true,
    isHost: true,
    isLive: true,
    status: 'live' as const,
    scheduledAt: null,
    title: 'Test Space',
    host: { handle: 'host.bsky.social' },
    shareableUrl: 'https://rabble.example/space/sp-auto-join',
    recording: null,
  };
}

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ posts: [] }),
  }) as unknown as typeof fetch;
});

describe('<SpacePageClient /> auto-join handoff', () => {
  it('consumes a valid stored token on mount and renders SpaceRoom', async () => {
    const payload = {
      token: 'jwt-token',
      wsUrl: 'wss://livekit.example.com',
      role: 'host',
      roomName: 'space-room',
      identity: 'did:plc:abc',
      handle: 'host.bsky.social',
      displayName: 'Host',
      avatarUrl: 'https://cdn.example/avatar.png',
    };
    sessionStorage.setItem(`rabble_join_${SPACE_ID}`, JSON.stringify(payload));

    render(<SpacePageClient {...baseProps()} />);

    await waitFor(() => {
      expect(screen.getByTestId('space-room')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('join-button')).not.toBeInTheDocument();
  });

  it('removes the stored token from sessionStorage after consumption', async () => {
    const payload = {
      token: 'jwt-token',
      wsUrl: 'wss://livekit.example.com',
      role: 'host',
      roomName: 'space-room',
      identity: 'did:plc:abc',
      handle: 'host.bsky.social',
    };
    sessionStorage.setItem(`rabble_join_${SPACE_ID}`, JSON.stringify(payload));

    render(<SpacePageClient {...baseProps()} />);

    await waitFor(() => {
      expect(screen.getByTestId('space-room')).toBeInTheDocument();
    });
    expect(sessionStorage.getItem(`rabble_join_${SPACE_ID}`)).toBeNull();
  });

  it('removes an invalid stored token and falls back to the join button', async () => {
    const invalid = {
      token: 'jwt-token',
      wsUrl: 'wss://livekit.example.com',
      role: 'host',
      roomName: 'space-room',
      identity: '',
      handle: 'host.bsky.social',
    };
    sessionStorage.setItem(
      `rabble_join_${SPACE_ID}`,
      JSON.stringify(invalid)
    );

    render(<SpacePageClient {...baseProps()} />);

    await waitFor(() => {
      expect(screen.getByTestId('join-button')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('space-room')).not.toBeInTheDocument();
    expect(sessionStorage.getItem(`rabble_join_${SPACE_ID}`)).toBeNull();
  });

  it('removes malformed JSON from sessionStorage and falls back to the join button', async () => {
    sessionStorage.setItem(`rabble_join_${SPACE_ID}`, '{not json');

    render(<SpacePageClient {...baseProps()} />);

    await waitFor(() => {
      expect(screen.getByTestId('join-button')).toBeInTheDocument();
    });
    expect(sessionStorage.getItem(`rabble_join_${SPACE_ID}`)).toBeNull();
  });

  it('renders the join button when no token is stored', async () => {
    expect(sessionStorage.getItem(`rabble_join_${SPACE_ID}`)).toBeNull();

    render(<SpacePageClient {...baseProps()} />);

    await waitFor(() => {
      expect(screen.getByTestId('join-button')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('space-room')).not.toBeInTheDocument();
  });
});

describe('<SpacePageClient /> onJoinedChange', () => {
  it('reports false on mount and true after a successful join', async () => {
    const onJoinedChange = vi.fn();

    global.fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.endsWith('/join') && init?.method === 'POST') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              token: 'jwt-token',
              wsUrl: 'wss://livekit.example.com',
              role: 'host',
              roomName: 'space-room',
              identity: 'did:plc:abc',
              handle: 'host.bsky.social',
            }),
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ posts: [] }),
        } as unknown as Response;
      }
    ) as unknown as typeof fetch;

    render(
      <SpacePageClient {...baseProps()} onJoinedChange={onJoinedChange} />
    );

    // Initially not joined.
    await waitFor(() => {
      expect(onJoinedChange).toHaveBeenCalledWith(false);
    });

    await waitFor(() => {
      expect(screen.getByTestId('join-button')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('join-button'));

    await waitFor(() => {
      expect(screen.getByTestId('space-room')).toBeInTheDocument();
    });
    expect(onJoinedChange).toHaveBeenLastCalledWith(true);
  });
});

describe('<SpacePageClient /> anonymous listening', () => {
  it('lets a signed-out visitor listen and mounts the room as anonymous', async () => {
    global.fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.endsWith('/join') && init?.method === 'POST') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              token: 'jwt-token',
              wsUrl: 'wss://livekit.example.com',
              role: 'audience',
              roomName: 'space-room',
              identity: 'anon:123',
              handle: '',
              displayName: null,
              avatarUrl: null,
              anonymous: true,
            }),
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ posts: [] }),
        } as unknown as Response;
      }
    ) as unknown as typeof fetch;

    render(<SpacePageClient {...baseProps()} isAuthenticated={false} isHost={false} />);

    const card = await screen.findByTestId('space-unauthenticated');
    expect(card).toBeInTheDocument();
    expect(screen.getByTestId('space-signin-link')).toHaveAttribute(
      'href',
      `/login?next=${encodeURIComponent(`/show/${SPACE_ID}`)}`
    );
    expect(screen.queryByTestId('join-button')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('listen-button'));

    await waitFor(() => {
      expect(screen.getByTestId('space-room')).toBeInTheDocument();
    });
  });
});

describe('SpacePageClient scheduled and replay branches', () => {
  it('offers Notify me instead of Join on a scheduled show', () => {
    render(
      <SpacePageClient
        {...baseProps()}
        isHost={false}
        isLive={false}
        status="scheduled"
        scheduledAt="2026-11-08T10:00:00.000Z"
        reminded={false}
      />
    );
    expect(screen.getByTestId('space-scheduled')).toBeTruthy();
    expect(screen.getByTestId('notify-me-button')).toBeTruthy();
    expect(screen.queryByTestId('join-button')).toBeNull();
  });

  it('offers Notify me and a quiet studio link instead of Join on an off-air show', () => {
    const { unmount } = render(
      <SpacePageClient {...baseProps()} isHost={false} isLive={false} status="active" reminded={false} />
    );
    expect(screen.getByTestId('space-off-air')).toBeTruthy();
    expect(screen.getByTestId('notify-me-button')).toBeTruthy();
    expect(screen.queryByTestId('join-button')).toBeNull();
    expect(screen.getByTestId('enter-studio').textContent).toMatch(/enter the studio/i);
    unmount();
    render(
      <SpacePageClient {...baseProps()} isAuthenticated={false} isHost={false} isLive={false} status="ended" reminded={false} />
    );
    expect(screen.getByTestId('space-off-air')).toBeTruthy();
    expect(screen.queryByTestId('enter-studio')).toBeNull();
    expect(screen.queryByTestId('join-button')).toBeNull();
  });

  it('plays the recording instead of joining when the show is off air with a replay', () => {
    render(
      <SpacePageClient
        {...baseProps()}
        isHost={false}
        isLive={false}
        status="active"
        replay={{
          recordingId: 'rec1',
          audioUrl: '/api/recordings/rec1/audio',
          contentType: 'audio/mp4',
          startedAt: '2026-11-07T00:00:00.000Z',
          endedAt: null,
          durationSeconds: null,
          sizeBytes: null,
        }}
      />
    );
    expect(screen.getByTestId('replay-player')).toBeTruthy();
    expect(screen.queryByTestId('join-button')).toBeNull();
  });

  it('still lets the host open the studio under the replay', () => {
    render(
      <SpacePageClient
        {...baseProps()}
        isHost
        isLive={false}
        status="active"
        replay={{
          recordingId: 'rec1',
          audioUrl: '/api/recordings/rec1/audio',
          contentType: 'audio/mp4',
          startedAt: '2026-11-07T00:00:00.000Z',
          endedAt: null,
          durationSeconds: null,
          sizeBytes: null,
        }}
      />
    );
    expect(screen.getByTestId('replay-player')).toBeTruthy();
    expect(screen.getByTestId('join-button').textContent).toMatch(/open the studio/i);
  });
});

describe('SpacePageClient one-click listen', () => {
  it('joins on mount when the URL carries ?listen=1 and the show is on air', async () => {
    window.history.replaceState({}, '', '/show/sp-auto-join?listen=1');
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (String(url).includes('/join')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ token: 't', wsUrl: 'wss://x', role: 'audience', roomName: 'r', identity: 'anon-1', handle: 'anon', anonymous: true }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ posts: [] }) };
    });
    render(<SpacePageClient {...baseProps()} isAuthenticated={false} isHost={false} isLive />);
    await waitFor(() => expect(screen.getByTestId('space-room')).toBeTruthy());
    window.history.replaceState({}, '', '/');
  });
});
