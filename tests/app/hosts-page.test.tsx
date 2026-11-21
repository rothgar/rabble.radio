// tests/app/hosts-page.test.tsx
//
// Renders the /hosts server component with mocked data access and checks
// the empty state and that the footer's privacy link is wired in (#95).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { mockGetTopHosts, mockGetFollowedHostDids, mockGetBlockedDids, mockGetCurrentUser } = vi.hoisted(() => ({
  mockGetTopHosts: vi.fn(),
  mockGetFollowedHostDids: vi.fn(),
  mockGetBlockedDids: vi.fn(),
  mockGetCurrentUser: vi.fn(),
}));

vi.mock('@/lib/hosts', () => ({ getTopHosts: mockGetTopHosts }));
vi.mock('@/lib/host-follows', () => ({ getFollowedHostDids: mockGetFollowedHostDids }));
vi.mock('@/lib/blocks', () => ({ getBlockedDids: mockGetBlockedDids }));
vi.mock('@/lib/session', () => ({ getCurrentUser: mockGetCurrentUser }));
vi.mock('@/components/SiteHeader', () => ({ SiteHeader: () => <header data-testid="site-header" /> }));
vi.mock('@/components/HostCard', () => ({ HostCard: () => <div data-testid="host-card" /> }));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(null);
  mockGetTopHosts.mockResolvedValue([]);
  mockGetFollowedHostDids.mockResolvedValue(new Set());
  mockGetBlockedDids.mockResolvedValue(new Set());
});

describe('/hosts page', () => {
  it('renders the empty state when there are no hosts', async () => {
    const { default: HostsPage } = await import('@/app/hosts/page');
    render(await HostsPage());
    expect(screen.getByTestId('hosts-empty')).toBeInTheDocument();
  });

  it('links to the privacy policy from the footer', async () => {
    const { default: HostsPage } = await import('@/app/hosts/page');
    render(await HostsPage());
    expect(screen.getByTestId('footer-privacy-link')).toBeInTheDocument();
  });
});
