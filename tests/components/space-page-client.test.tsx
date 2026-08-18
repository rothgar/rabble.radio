// tests/components/space-page-client.test.tsx
//
// Exercises the auto-join handoff: when CreateSpaceForm stores a join
// payload in sessionStorage under `rabble_join_<spaceId>`, mounting
// SpacePageClient should consume it and render SpaceRoom directly,
// removing the slot on success or invalidation.

// Heavy children are stubbed so we exercise only SpacePageClient's own
// behaviour (join-button vs SpaceRoom branch) without mounting LiveKit
// or any network code beyond a no-op fetch.
vi.mock('@/components/SpaceRoom', () => ({
  SpaceRoom: () => <div data-testid="space-room">SpaceRoom</div>,
}));
vi.mock('@/components/StageControls', () => ({
  StageControls: () => <div data-testid="stage-controls">StageControls</div>,
}));
vi.mock('@/components/LiveBannerButton', () => ({
  LiveBannerButton: () => (
    <div data-testid="live-banner-button">LiveBannerButton</div>
  ),
}));
vi.mock('@/components/AddPostForm', () => ({
  AddPostForm: () => <div data-testid="add-post-form">AddPostForm</div>,
}));
vi.mock('@/components/PostCarousel', () => ({
  PostCarousel: () => <div data-testid="post-carousel">PostCarousel</div>,
}));

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SpacePageClient } from '@/components/SpacePageClient';

const SPACE_ID = 'sp-auto-join';

function baseProps() {
  return {
    spaceId: SPACE_ID,
    isAuthenticated: true,
    isHost: true,
    isLive: true,
    status: 'live',
    scheduledAt: null,
  };
}

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  // The posts refresh fetches /api/spaces/<id>/posts on mount. Return an
  // empty list so the effect doesn't keep the component in a loading
  // state during assertions.
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
    // Missing identity: fails the non-empty string validation.
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
    // Bonus coverage for the JSON.parse catch branch: if the slot was
    // written by an older build or a third party, we still clean up.
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
