// tests/components/room-sidebar.test.tsx
//
// The host-only "Close station" button: hidden while the show is live
// (the footer's Go off air / Leave already cover that), shown pre-show
// and off-air since it's the only way to delete a station.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoomSidebar } from '@/components/RoomSidebar';

const baseProps = {
  spaceId: 'space-1',
  title: 'Show',
  posts: [],
  postsError: null,
  onPostAdded: vi.fn(),
  recording: null,
};

describe('<RoomSidebar />', () => {
  it('shows the close-station button for a host when off air', () => {
    render(<RoomSidebar {...baseProps} isHost isLive={false} />);
    expect(screen.getByTestId('delete-space')).toBeInTheDocument();
  });

  it('hides the close-station button for a host while live', () => {
    render(<RoomSidebar {...baseProps} isHost isLive />);
    expect(screen.queryByTestId('delete-space')).not.toBeInTheDocument();
  });

  it('never shows the close-station button for a non-host', () => {
    render(<RoomSidebar {...baseProps} isHost={false} isLive={false} />);
    expect(screen.queryByTestId('delete-space')).not.toBeInTheDocument();
  });
});
