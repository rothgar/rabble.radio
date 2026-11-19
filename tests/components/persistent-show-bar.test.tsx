// tests/components/persistent-show-bar.test.tsx
//
// PersistentShowBar is the sticky "you're still live" footer for issue #7:
// it must stay hidden on the joined show's own page (SpaceRoom already has
// full controls there) and show a way back everywhere else. Visibility
// itself is decided by ActiveRoomProvider's `barVisible` flag (shared with
// ReminderToasts and the page-padding reservation), so this component just
// reads it.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ActiveRoomSession } from '@/components/ActiveRoomProvider';

const leaveMock = vi.fn();
let session: ActiveRoomSession | null = null;
let barVisible = false;

vi.mock('@/components/ActiveRoomProvider', () => ({
  useActiveRoom: () => ({ session, barVisible, leave: leaveMock }),
}));

import { PersistentShowBar } from '@/components/PersistentShowBar';

function baseSession(overrides: Partial<ActiveRoomSession> = {}): ActiveRoomSession {
  return {
    spaceId: 'sp1',
    identity: 'did:plc:host1',
    role: 'host',
    isHost: true,
    handle: 'host.bsky.social',
    displayName: 'Host',
    avatarUrl: null,
    anonymous: false,
    title: 'Test show',
    host: { handle: 'host.bsky.social', displayName: 'Host', avatarUrl: null },
    shareableUrl: 'https://rabble.example/show/sp1',
    isLive: true,
    ...overrides,
  };
}

beforeEach(() => {
  session = null;
  barVisible = false;
  leaveMock.mockReset();
});

describe('<PersistentShowBar />', () => {
  it('renders nothing when there is no active session', () => {
    render(<PersistentShowBar />);
    expect(screen.queryByTestId('persistent-show-bar')).not.toBeInTheDocument();
  });

  it('renders nothing when the provider says the bar is not visible (e.g. the show\'s own page)', () => {
    session = baseSession();
    barVisible = false;
    render(<PersistentShowBar />);
    expect(screen.queryByTestId('persistent-show-bar')).not.toBeInTheDocument();
  });

  it('shows the bar with a way back when the provider says it is visible', () => {
    session = baseSession();
    barVisible = true;
    render(<PersistentShowBar />);

    expect(screen.getByTestId('persistent-show-bar')).toBeInTheDocument();
    expect(screen.getByText('Test show')).toBeInTheDocument();
    expect(screen.getByTestId('persistent-show-bar-return')).toHaveAttribute(
      'href',
      '/show/sp1'
    );
    expect(screen.getByTestId('persistent-show-bar-return').textContent).toMatch(
      /back to studio/i
    );
  });

  it('shows the off-air status and a listener-facing return label', () => {
    session = baseSession({ isHost: false, isLive: false });
    barVisible = true;
    render(<PersistentShowBar />);

    expect(screen.getByText(/off air/i)).toBeInTheDocument();
    expect(screen.getByTestId('persistent-show-bar-return').textContent).toMatch(
      /return to show/i
    );
  });

  it('leaves the room when Leave is clicked', () => {
    session = baseSession();
    barVisible = true;
    render(<PersistentShowBar />);

    fireEvent.click(screen.getByTestId('persistent-show-bar-leave'));
    expect(leaveMock).toHaveBeenCalledTimes(1);
  });
});
