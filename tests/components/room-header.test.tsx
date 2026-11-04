// tests/components/room-header.test.tsx
//
// The room header's on-air / off-air tag.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoomHeader } from '@/components/RoomHeader';

const host = { handle: 'alice.bsky.social' };

describe('<RoomHeader />', () => {
  it('shows On air while broadcasting', () => {
    render(<RoomHeader title="Show" host={host} listenerCount={3} onAir />);
    expect(screen.getByTestId('live-tag')).toHaveTextContent('On air');
    expect(screen.getByTestId('room-header')).toHaveAttribute('data-on-air', 'true');
    expect(screen.getByTestId('room-listener-count')).toHaveTextContent('3 listening');
  });

  it('shows Off air in the green room', () => {
    render(<RoomHeader title="Show" host={host} listenerCount={0} onAir={false} />);
    expect(screen.getByTestId('live-tag')).toHaveTextContent('Off air');
    expect(screen.getByTestId('room-header')).toHaveAttribute('data-on-air', 'false');
  });
});
