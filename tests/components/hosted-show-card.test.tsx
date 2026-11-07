// tests/components/hosted-show-card.test.tsx
//
// Account-page card for a hosted station and its publish toggles.

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HostedShowCard, formatHosted } from '@/components/HostedShowCard';
import type { PublicSpace } from '@/types';

function space(overrides: Partial<PublicSpace> = {}): PublicSpace {
  return {
    id: 'sp1',
    slug: 'sp1',
    title: 'Friday jams',
    description: null,
    isLive: false,
    status: 'active',
    scheduledAt: null,
    expiresAt: null,
    listenerCount: 0,
    speakerCount: 0,
    reactionCount: 0,
    likeCount: 1,
    sessionCount: 1,
    totalListeners: 1,
    hostedSeconds: 90,
    lastLiveAt: null,
    tags: ['Music'],
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    host: { did: 'did:plc:me', handle: 'me.bsky.social', displayName: null, avatarUrl: null },
    shareableUrl: 'https://rabble.rodeo/show/sp1',
    replay: null,
    reminded: false,
    ...overrides,
  };
}

const available = {
  id: 'rec1',
  status: 'available' as const,
  startedAt: '2026-11-01T10:00:00.000Z',
  endedAt: '2026-11-01T11:00:00.000Z',
  sizeBytes: 2048,
  published: false,
  publishedAt: null,
};

describe('formatHosted', () => {
  it('formats seconds compactly', () => {
    expect(formatHosted(45)).toBe('45s');
    expect(formatHosted(90)).toBe('2m');
    expect(formatHosted(5400)).toBe('1h 30m');
    expect(formatHosted(7200)).toBe('2h');
  });
});

describe('<HostedShowCard />', () => {
  it('shows the off-air status, stats and the open link', () => {
    render(<HostedShowCard space={space()} recordings={[]} />);
    expect(screen.getByTestId('hosted-show-status')).toHaveTextContent('Off air');
    expect(screen.getByTestId('hosted-show-stats')).toHaveTextContent('1 show · 1 listener · 1 like · 2m on air');
    expect(screen.getByTestId('hosted-show-open')).toHaveAttribute('href', '/show/sp1');
    expect(screen.getByText('No recordings yet.')).toBeInTheDocument();
  });

  it('publishes a recording through the API and updates in place', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ recording: { ...available, published: true, publishedAt: '2026-11-02T00:00:00.000Z' } }),
    }) as unknown as typeof fetch;

    render(<HostedShowCard space={space({ status: 'expired' })} recordings={[available]} />);
    const toggle = screen.getByTestId('recording-publish-toggle');
    expect(toggle).toHaveTextContent('Publish episode');
    fireEvent.click(toggle);

    await waitFor(() =>
      expect(screen.getByTestId('recording-rec1')).toHaveAttribute('data-published', 'true')
    );
    expect(screen.getByTestId('recording-publish-toggle')).toHaveTextContent('Unpublish');
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/recordings/rec1/publish');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ published: true });
    expect(screen.getByTestId('recording-download')).toHaveAttribute('href', '/api/recordings/rec1/audio');
  });

  it('disables publishing while a recording is still processing', () => {
    render(
      <HostedShowCard
        space={space()}
        recordings={[{ ...available, status: 'starting', sizeBytes: null }]}
      />
    );
    expect(screen.getByTestId('recording-publish-toggle')).toBeDisabled();
    expect(screen.queryByTestId('recording-download')).toBeNull();
  });
});
