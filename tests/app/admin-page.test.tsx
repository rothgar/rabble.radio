// tests/app/admin-page.test.tsx

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const { mockGetCurrentUser, mockGetPlatformOverview, mockListUsersForAdmin, mockIsAdmin, mockNotFound } = vi.hoisted(
  () => ({
    mockGetCurrentUser: vi.fn(),
    mockGetPlatformOverview: vi.fn(),
    mockListUsersForAdmin: vi.fn(),
    mockIsAdmin: vi.fn(),
    mockNotFound: vi.fn(() => {
      throw new Error('NEXT_NOT_FOUND');
    }),
  })
);

vi.mock('@/lib/session', () => ({ getCurrentUser: mockGetCurrentUser }));
vi.mock('@/lib/admin', () => ({
  getPlatformOverview: mockGetPlatformOverview,
  listUsersForAdmin: mockListUsersForAdmin,
  isAdmin: mockIsAdmin,
}));
vi.mock('next/navigation', () => ({ notFound: mockNotFound }));
vi.mock('@/components/SiteHeader', () => ({ SiteHeader: () => <header data-testid="site-header" /> }));
vi.mock('@/components/AdminUserActions', () => ({
  AdminUserActions: ({ did }: { did: string }) => <div data-testid={`admin-actions-${did}`} />,
}));

import AdminPage from '@/app/admin/page';

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  mockGetCurrentUser.mockResolvedValue({ did: 'did:plc:admin', handle: 'admin.test' });
  mockGetPlatformOverview.mockResolvedValue({
    totalUsers: 5,
    bannedUsers: 1,
    totalShows: 9,
    liveNow: 2,
    totalSessions: 20,
    buildId: 'abc1234',
  });
});

describe('/admin', () => {
  it('404s for non-admins', async () => {
    mockIsAdmin.mockReturnValue(false);
    await expect(AdminPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mockListUsersForAdmin).not.toHaveBeenCalled();
  });

  it('renders the overview counts and the build id', async () => {
    mockIsAdmin.mockReturnValue(true);
    mockListUsersForAdmin.mockResolvedValue([]);
    render(await AdminPage());
    expect(screen.getByText(/abc1234/)).toBeTruthy();
    expect(screen.getByTestId('admin-stat-users').textContent).toContain('5');
    expect(screen.getByTestId('admin-stat-banned').textContent).toContain('1');
    expect(screen.getByTestId('admin-stat-live-now').textContent).toContain('2');
  });

  it('renders users with their ban state and actions', async () => {
    mockIsAdmin.mockReturnValue(true);
    mockListUsersForAdmin.mockResolvedValue([
      {
        did: 'did:plc:a',
        handle: 'alice.test',
        displayName: 'Alice',
        createdAt: new Date('2026-11-01T00:00:00Z'),
        bannedAt: new Date('2026-11-18T00:00:00Z'),
        banReason: 'spam',
      },
    ]);
    render(await AdminPage());
    expect(screen.getByTestId('admin-user-did:plc:a')).toBeTruthy();
    expect(screen.getByText('@alice.test')).toBeTruthy();
    expect(screen.getByText('banned')).toBeTruthy();
    expect(screen.getByText(/reason: spam/)).toBeTruthy();
    expect(screen.getByTestId('admin-actions-did:plc:a')).toBeTruthy();
  });

  it('shows an empty state', async () => {
    mockIsAdmin.mockReturnValue(true);
    mockListUsersForAdmin.mockResolvedValue([]);
    render(await AdminPage());
    expect(screen.getByTestId('admin-users-empty')).toBeTruthy();
  });
});
