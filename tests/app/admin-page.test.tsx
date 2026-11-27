// tests/app/admin-page.test.tsx

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const {
  mockGetCurrentUser,
  mockGetPlatformOverview,
  mockGetPlatformActivity,
  mockListUsersForAdmin,
  mockIsAdmin,
  mockNotFound,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockGetPlatformOverview: vi.fn(),
  mockGetPlatformActivity: vi.fn(),
  mockListUsersForAdmin: vi.fn(),
  mockIsAdmin: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('@/lib/session', () => ({ getCurrentUser: mockGetCurrentUser }));
vi.mock('@/lib/admin', () => ({
  getPlatformOverview: mockGetPlatformOverview,
  getPlatformActivity: mockGetPlatformActivity,
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
  mockGetPlatformActivity.mockResolvedValue({
    signUps: { current: 5, previous: 3 },
    showsHosted: { current: 4, previous: 2 },
    hoursHosted: { current: 6.5, previous: 3 },
    listenerJoins: { current: 20, previous: 15 },
    distinctListeners: { current: 8, previous: 5 },
    peakConcurrentListeners: { current: 10, previous: 6 },
    reactions: { current: 30, previous: 25 },
    likes: { current: 9, previous: 4 },
    weeklySeries: Array.from({ length: 12 }, (_, i) => ({
      weekStart: `2026-${String(9 + Math.floor(i / 4)).padStart(2, '0')}-${String((i % 4) * 7 + 1).padStart(2, '0')}`,
      signUps: i,
      showsHosted: i,
      listenerJoins: i,
    })),
  });
});

describe('/admin', () => {
  it('404s for non-admins', async () => {
    mockIsAdmin.mockReturnValue(false);
    await expect(AdminPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mockListUsersForAdmin).not.toHaveBeenCalled();
    expect(mockGetPlatformActivity).not.toHaveBeenCalled();
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

  it('renders the activity tiles with their trailing-week trend and the weekly table', async () => {
    mockIsAdmin.mockReturnValue(true);
    mockListUsersForAdmin.mockResolvedValue([]);
    render(await AdminPage());
    expect(screen.getByTestId('admin-stat-new-sign-ups').textContent).toContain('5');
    expect(screen.getByTestId('admin-stat-new-sign-ups').textContent).toContain('3');
    expect(screen.getByTestId('admin-stat-peak-concurrent-listeners').textContent).toContain('10');
    expect(screen.getByTestId('admin-stat-signed-in-listeners').textContent).toContain('8');
    const table = screen.getByTestId('admin-activity-weekly');
    expect(table.textContent).toContain('2026-09-01');
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
