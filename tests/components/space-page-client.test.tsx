// tests/components/space-page-client.test.tsx
//
// Exercises the auto-join handoff: when CreateSpaceForm stores a join
// payload in sessionStorage under `rabble_join_<spaceId>`, mounting
// SpacePageClient should consume it and render SpaceRoom directly.
//
// The join session and LiveKit connection live in ActiveRoomProvider (see
// issue #7: the room must survive navigating away from this page), so every
// render here is wrapped in a real provider.

vi.mock('@/components/SpaceRoom', () => ({
  SpaceRoom: () => <div data-testid="space-room">SpaceRoom</div>,
}));

vi.mock('livekit-client', () => ({
  Room: class FakeRoom {
    connect = vi.fn(async () => undefined);
    disconnect = vi.fn();
  },
}));

vi.mock('@livekit/components-react', async () => {
  const React = await import('react');
  return {
    RoomContext: {
      Provider: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
    },
    RoomAudioRenderer: () => null,
  };
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SpacePageClient } from '@/components/SpacePageClient';
import { ActiveRoomProvider } from '@/components/ActiveRoomProvider';

const SPACE_ID = 'sp-auto-join';

/** Every render needs ActiveRoomProvider: it owns the join session that
 * survives navigation (issue #7), and SpacePageClient reads it. */
function renderPage(element: ReactElement): ReturnType<typeof render> {
  return render(<ActiveRoomProvider>{element}</ActiveRoomProvider>);
}

function baseProps() {
  return {
    spaceId: SPACE_ID,
    isAuthenticated: true,
    isHost: true,
    isLive: true,
    status: 'live' as const,
    scheduledAt: null,
    title: 'Test Space',
    host: { did: 'did:plc:host', handle: 'host.bsky.social' },
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

    renderPage(<SpacePageClient {...baseProps()} />);

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

    renderPage(<SpacePageClient {...baseProps()} />);

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

    renderPage(<SpacePageClient {...baseProps()} />);

    await waitFor(() => {
      expect(screen.getByTestId('join-button')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('space-room')).not.toBeInTheDocument();
    expect(sessionStorage.getItem(`rabble_join_${SPACE_ID}`)).toBeNull();
  });

  it('removes malformed JSON from sessionStorage and falls back to the join button', async () => {
    sessionStorage.setItem(`rabble_join_${SPACE_ID}`, '{not json');

    renderPage(<SpacePageClient {...baseProps()} />);

    await waitFor(() => {
      expect(screen.getByTestId('join-button')).toBeInTheDocument();
    });
    expect(sessionStorage.getItem(`rabble_join_${SPACE_ID}`)).toBeNull();
  });

  it('renders the join button when no token is stored', async () => {
    expect(sessionStorage.getItem(`rabble_join_${SPACE_ID}`)).toBeNull();

    renderPage(<SpacePageClient {...baseProps()} />);

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

    renderPage(
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

    // space-room mounting and the onJoinedChange(true) notification come
    // from the same joinedHere flip but land in separate effects, so they
    // must be awaited together — asserting onJoinedChange right after the
    // first waitFor resolves races the second effect.
    await waitFor(() => {
      expect(screen.getByTestId('space-room')).toBeInTheDocument();
      expect(onJoinedChange).toHaveBeenLastCalledWith(true);
    });
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

    renderPage(<SpacePageClient {...baseProps()} isAuthenticated={false} isHost={false} />);

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
    renderPage(
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
    expect(screen.getByTestId('follow-host-button')).toBeTruthy();
    expect(screen.queryByTestId('join-button')).toBeNull();
  });

  it('offers Notify me and a quiet studio link instead of Join on an off-air show', () => {
    const { unmount } = renderPage(
      <SpacePageClient {...baseProps()} isHost={false} isLive={false} status="active" reminded={false} />
    );
    expect(screen.getByTestId('space-off-air')).toBeTruthy();
    expect(screen.getByTestId('notify-me-button')).toBeTruthy();
    expect(screen.getByTestId('follow-host-button')).toBeTruthy();
    expect(screen.queryByTestId('join-button')).toBeNull();
    expect(screen.getByTestId('enter-studio').textContent).toMatch(/enter the studio/i);
    unmount();
    renderPage(
      <SpacePageClient {...baseProps()} isAuthenticated={false} isHost={false} isLive={false} status="ended" reminded={false} />
    );
    expect(screen.getByTestId('space-off-air')).toBeTruthy();
    expect(screen.queryByTestId('enter-studio')).toBeNull();
    expect(screen.queryByTestId('join-button')).toBeNull();
  });

  it('offers a follow-show button for a named show, not for the host default title', () => {
    const { unmount } = renderPage(
      <SpacePageClient {...baseProps()} isHost={false} isLive={false} status="active" reminded={false} isNamedShow />
    );
    expect(screen.getByTestId('follow-show-button').textContent).toMatch(/follow test space/i);
    unmount();
    renderPage(
      <SpacePageClient
        {...baseProps()}
        isHost={false}
        isLive={false}
        status="active"
        reminded={false}
        isNamedShow={false}
      />
    );
    expect(screen.queryByTestId('follow-show-button')).toBeNull();
  });

  it('skips the follow-host button when the host did is not known', () => {
    renderPage(
      <SpacePageClient
        {...baseProps()}
        host={{ handle: 'host.bsky.social' }}
        isHost={false}
        isLive={false}
        status="active"
        reminded={false}
      />
    );
    expect(screen.getByTestId('notify-me-button')).toBeTruthy();
    expect(screen.queryByTestId('follow-host-button')).toBeNull();
    expect(screen.queryByTestId('follow-host-signin')).toBeNull();
  });

  it('plays the recording instead of joining when the show is off air with a replay', () => {
    renderPage(
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
    renderPage(
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
    renderPage(<SpacePageClient {...baseProps()} isAuthenticated={false} isHost={false} isLive />);
    await waitFor(() => expect(screen.getByTestId('space-room')).toBeTruthy());
    window.history.replaceState({}, '', '/');
  });
});
