// tests/components/active-room-provider.test.tsx
//
// ActiveRoomProvider owns the LiveKit connection so it survives navigating
// away from /show/[id] (issue #7). These tests exercise join/leave and the
// "one room at a time" rule against a fake Room, without a real
// RTCPeerConnection.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import {
  ActiveRoomProvider,
  useActiveRoom,
  type JoinPayload,
} from '@/components/ActiveRoomProvider';

const boundary = vi.hoisted(() => {
  const instances: Array<{ connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
  let nextConnectResult: 'resolve' | 'reject' = 'resolve';

  class FakeRoom {
    connect = vi.fn(async () => {
      if (nextConnectResult === 'reject') throw new Error('bad token');
    });
    disconnect = vi.fn();
    constructor() {
      instances.push(this);
    }
  }

  return {
    FakeRoom,
    instances,
    failNextConnect: (): void => {
      nextConnectResult = 'reject';
    },
    reset: (): void => {
      instances.length = 0;
      nextConnectResult = 'resolve';
    },
  };
});

let pathname = '/stations';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}));

vi.mock('livekit-client', () => ({ Room: boundary.FakeRoom }));

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

const PAYLOAD: JoinPayload = {
  spaceId: 'sp1',
  token: 't1',
  wsUrl: 'wss://livekit.example.com',
  role: 'host',
  identity: 'did:plc:host1',
  isHost: true,
  handle: 'host.bsky.social',
  displayName: 'Host',
  avatarUrl: null,
  title: 'Test show',
  host: { handle: 'host.bsky.social', displayName: 'Host' },
  shareableUrl: 'https://rabble.example/show/sp1',
  isLive: true,
};

function Harness(): ReactElement {
  const { session, connectionError, barVisible, join, leave } = useActiveRoom();
  return (
    <div>
      <p data-testid="session">{session ? JSON.stringify(session) : 'none'}</p>
      <p data-testid="error">{connectionError ?? 'none'}</p>
      <p data-testid="bar-visible">{String(barVisible)}</p>
      <button onClick={() => join(PAYLOAD)} data-testid="join">
        join
      </button>
      <button onClick={() => join({ ...PAYLOAD, spaceId: 'sp2', title: 'Other show' })} data-testid="join-other">
        join other
      </button>
      <button onClick={leave} data-testid="leave">
        leave
      </button>
    </div>
  );
}

function renderHarness(): ReturnType<typeof render> {
  return render(
    <ActiveRoomProvider>
      <Harness />
    </ActiveRoomProvider>
  );
}

beforeEach(() => {
  boundary.reset();
  pathname = '/stations';
});

describe('<ActiveRoomProvider />', () => {
  it('has no session before anyone joins', () => {
    renderHarness();
    expect(screen.getByTestId('session').textContent).toBe('none');
  });

  it('connects a new Room and exposes the session once joined', async () => {
    renderHarness();
    fireEvent.click(screen.getByTestId('join'));

    await waitFor(() => {
      expect(boundary.instances).toHaveLength(1);
    });
    expect(boundary.instances[0].connect).toHaveBeenCalledWith('wss://livekit.example.com', 't1');
    expect(screen.getByTestId('session').textContent).toContain('"spaceId":"sp1"');
  });

  it('disconnects the previous room when joining a different show', async () => {
    renderHarness();
    fireEvent.click(screen.getByTestId('join'));
    await waitFor(() => expect(boundary.instances).toHaveLength(1));
    const first = boundary.instances[0];

    fireEvent.click(screen.getByTestId('join-other'));
    await waitFor(() => expect(boundary.instances).toHaveLength(2));

    expect(first.disconnect).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('session').textContent).toContain('"spaceId":"sp2"');
  });

  it('disconnects the room and clears the session on leave', async () => {
    renderHarness();
    fireEvent.click(screen.getByTestId('join'));
    await waitFor(() => expect(boundary.instances).toHaveLength(1));

    fireEvent.click(screen.getByTestId('leave'));
    expect(boundary.instances[0].disconnect).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('session').textContent).toBe('none');
  });

  it('surfaces a connect failure as connectionError', async () => {
    boundary.failNextConnect();
    renderHarness();
    fireEvent.click(screen.getByTestId('join'));

    await waitFor(() => {
      expect(screen.getByTestId('error').textContent).toBe('bad token');
    });
  });

  it('barVisible is false with no session, even off the show route', () => {
    pathname = '/stations';
    renderHarness();
    expect(screen.getByTestId('bar-visible').textContent).toBe('false');
  });

  it('barVisible is true once joined and off the session\'s own show page', async () => {
    pathname = '/stations';
    renderHarness();
    fireEvent.click(screen.getByTestId('join'));
    await waitFor(() => expect(screen.getByTestId('session').textContent).toContain('sp1'));
    expect(screen.getByTestId('bar-visible').textContent).toBe('true');
  });

  it('barVisible is false on the session\'s own show page', async () => {
    pathname = '/show/sp1';
    renderHarness();
    fireEvent.click(screen.getByTestId('join'));
    await waitFor(() => expect(screen.getByTestId('session').textContent).toContain('sp1'));
    expect(screen.getByTestId('bar-visible').textContent).toBe('false');
  });

  it('barVisible is false while the connect attempt has failed', async () => {
    boundary.failNextConnect();
    pathname = '/stations';
    renderHarness();
    fireEvent.click(screen.getByTestId('join'));
    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('bad token'));
    expect(screen.getByTestId('bar-visible').textContent).toBe('false');
  });
});
