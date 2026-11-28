// tests/api/admin-overview.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetCurrentUser, mockIsAdmin, mockGetPlatformOverview, mockListUsersForAdmin } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockIsAdmin: vi.fn(),
  mockGetPlatformOverview: vi.fn(),
  mockListUsersForAdmin: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getCurrentUser: mockGetCurrentUser }));
vi.mock('@/lib/admin', async () => {
  const actual = await vi.importActual<typeof import('@/lib/admin')>('@/lib/admin');
  return {
    ...actual,
    isAdmin: mockIsAdmin,
    getPlatformOverview: mockGetPlatformOverview,
    listUsersForAdmin: mockListUsersForAdmin,
  };
});

import { GET } from '@/app/api/admin/overview/route';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue({ did: 'did:plc:admin', handle: 'admin.test' });
  mockIsAdmin.mockReturnValue(true);
  mockGetPlatformOverview.mockResolvedValue({
    totalUsers: 10,
    bannedUsers: 1,
    totalShows: 5,
    liveNow: 2,
    totalSessions: 20,
    buildId: 'abc123',
  });
  mockListUsersForAdmin.mockResolvedValue([
    {
      did: 'did:plc:a',
      handle: 'alice.test',
      displayName: 'Alice',
      createdAt: new Date('2026-11-01T00:00:00Z'),
      bannedAt: null,
      banReason: null,
    },
    {
      did: 'did:plc:b',
      handle: 'bob.test',
      displayName: null,
      createdAt: new Date('2026-11-02T00:00:00Z'),
      bannedAt: new Date('2026-11-19T00:00:00Z'),
      banReason: 'spam',
    },
  ]);
});

describe('GET /api/admin/overview', () => {
  it('404s for non-admins, same as /admin', async () => {
    mockIsAdmin.mockReturnValue(false);
    const res = await GET();
    expect(res.status).toBe(404);
    expect(mockGetPlatformOverview).not.toHaveBeenCalled();
  });

  it('404s when signed out', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    mockIsAdmin.mockReturnValue(false);
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('returns the overview counts and the user list for admins', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.overview).toMatchObject({ totalUsers: 10, bannedUsers: 1, liveNow: 2 });
    expect(body.users).toHaveLength(2);
    expect(body.users[0]).toMatchObject({ did: 'did:plc:a', createdAt: '2026-11-01T00:00:00.000Z', bannedAt: null });
    expect(body.users[1]).toMatchObject({ did: 'did:plc:b', bannedAt: '2026-11-19T00:00:00.000Z', banReason: 'spam' });
  });
});
