// tests/components/host-card.test.tsx

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { HostCard } from '@/components/HostCard';
import type { TopHost } from '@/lib/hosts';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function topHost(overrides: Partial<TopHost> = {}): TopHost {
  return {
    host: { did: 'did:h', handle: 'host.test', displayName: 'Host', avatarUrl: null },
    popularity: 5,
    upcoming: [],
    ...overrides,
  };
}

describe('HostCard', () => {
  it('shows a follow button for signed-out visitors that links to login', () => {
    render(<HostCard host={topHost()} rank={1} isAuthenticated={false} following={false} />);
    const link = screen.getByTestId('follow-host-signin') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/login?next=%2Fhosts');
  });

  it('shows the current follow state for signed-in viewers', () => {
    render(<HostCard host={topHost()} rank={1} isAuthenticated following />);
    expect(screen.getByTestId('follow-host-button').textContent).toMatch(/following host/i);
  });
});
