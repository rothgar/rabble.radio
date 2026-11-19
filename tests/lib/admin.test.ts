// tests/lib/admin.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCount,
  mockFindMany,
  mockFindUnique,
  mockUpdate,
  mockParticipationFindMany,
  mockSpaceFindMany,
  mockRemoveParticipant,
  mockRecordLeave,
  mockEndLiveShow,
} = vi.hoisted(() => ({
  mockCount: vi.fn(),
  mockFindMany: vi.fn(),
  mockFindUnique: vi.fn(),
  mockUpdate: vi.fn(),
  mockParticipationFindMany: vi.fn(),
  mockSpaceFindMany: vi.fn(),
  mockRemoveParticipant: vi.fn(),
  mockRecordLeave: vi.fn(),
  mockEndLiveShow: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { count: mockCount, findMany: mockFindMany, findUnique: mockFindUnique, update: mockUpdate },
    space: { count: mockCount, findMany: mockSpaceFindMany },
    showSession: { count: mockCount },
    showParticipation: { findMany: mockParticipationFindMany },
  },
}));

vi.mock('@/lib/livekit', () => ({
  removeParticipant: mockRemoveParticipant,
  roomNameForSpace: (id: string) => `space-${id}`,
}));

vi.mock('@/lib/metrics', () => ({ recordLeave: mockRecordLeave }));
vi.mock('@/lib/live', () => ({ endLiveShow: mockEndLiveShow }));

import {
  AdminActionError,
  adminDids,
  banUser,
  getPlatformOverview,
  isAdmin,
  kickFromPlatform,
  listUsersForAdmin,
  unbanUser,
} from '@/lib/admin';

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    did: 'did:plc:a',
    handle: 'alice.test',
    displayName: null,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    bannedAt: null,
    banReason: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSpaceFindMany.mockResolvedValue([]);
});

describe('isAdmin', () => {
  it('matches DIDs and handles from ADMIN_DIDS, case-insensitively', () => {
    const env = { ADMIN_DIDS: 'did:plc:admin, @Justin.Test' };
    expect(isAdmin({ did: 'did:plc:admin', handle: 'x' }, env)).toBe(true);
    expect(isAdmin({ did: 'did:plc:other', handle: 'justin.test' }, env)).toBe(true);
    expect(isAdmin({ did: 'did:plc:other', handle: 'bob' }, env)).toBe(false);
    expect(isAdmin(null, env)).toBe(false);
    expect(isAdmin({ did: 'did:plc:admin', handle: 'x' }, {})).toBe(false);
  });

  it('adminDids trims and lowercases entries', () => {
    expect(adminDids({ ADMIN_DIDS: ' DID:PLC:A , @Bob ' })).toEqual(new Set(['did:plc:a', 'bob']));
  });
});

describe('getPlatformOverview', () => {
  it('counts users, bans, shows, live-now and sessions, and reports the build id', async () => {
    mockCount.mockResolvedValue(3);
    const prev = process.env.NEXT_PUBLIC_BUILD_ID;
    process.env.NEXT_PUBLIC_BUILD_ID = 'abc1234';
    const out = await getPlatformOverview();
    process.env.NEXT_PUBLIC_BUILD_ID = prev;
    expect(out).toEqual({
      totalUsers: 3,
      bannedUsers: 3,
      totalShows: 3,
      liveNow: 3,
      totalSessions: 3,
      buildId: 'abc1234',
    });
  });
});

describe('listUsersForAdmin', () => {
  it('returns newest first and clamps the limit', async () => {
    mockFindMany.mockResolvedValue([userRow()]);
    const out = await listUsersForAdmin(10000);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' }, take: 500 })
    );
    expect(out).toHaveLength(1);
  });
});

describe('banUser', () => {
  it('sets bannedAt/banReason and kicks the user from any active rooms', async () => {
    mockFindUnique.mockResolvedValueOnce({ did: 'did:plc:a' });
    mockUpdate.mockResolvedValueOnce(userRow({ bannedAt: new Date('2026-11-19T00:00:00Z'), banReason: 'spam' }));
    mockParticipationFindMany.mockResolvedValueOnce([{ spaceId: 'sp1' }]);
    mockRemoveParticipant.mockResolvedValueOnce(true);

    const out = await banUser('did:plc:a', ' spam ');

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { did: 'did:plc:a' },
        data: expect.objectContaining({ banReason: 'spam' }),
      })
    );
    expect(mockRemoveParticipant).toHaveBeenCalledWith('space-sp1', 'did:plc:a');
    expect(mockRecordLeave).toHaveBeenCalledWith({ spaceId: 'sp1', identity: 'did:plc:a' });
    expect(out.banReason).toBe('spam');
  });

  it('rejects an empty did', async () => {
    await expect(banUser('', null)).rejects.toBeInstanceOf(AdminActionError);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('throws user_not_found for an unknown did', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    await expect(banUser('did:plc:ghost', null)).rejects.toThrow('user_not_found');
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('unbanUser', () => {
  it('clears bannedAt and banReason', async () => {
    mockFindUnique.mockResolvedValueOnce({ did: 'did:plc:a' });
    mockUpdate.mockResolvedValueOnce(userRow());
    await unbanUser('did:plc:a');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { did: 'did:plc:a' },
        data: { bannedAt: null, banReason: null },
      })
    );
  });

  it('throws user_not_found for an unknown did', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    await expect(unbanUser('did:plc:ghost')).rejects.toThrow('user_not_found');
  });
});

describe('kickFromPlatform', () => {
  it('removes the identity from every room it currently holds presence in', async () => {
    mockParticipationFindMany.mockResolvedValueOnce([{ spaceId: 'sp1' }, { spaceId: 'sp2' }]);
    mockRemoveParticipant.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const kicked = await kickFromPlatform('did:plc:a');
    expect(kicked).toBe(1);
    expect(mockRemoveParticipant).toHaveBeenCalledWith('space-sp1', 'did:plc:a');
    expect(mockRemoveParticipant).toHaveBeenCalledWith('space-sp2', 'did:plc:a');
    expect(mockRecordLeave).toHaveBeenCalledTimes(2);
  });

  it('is a no-op when the user holds no active presence', async () => {
    mockParticipationFindMany.mockResolvedValueOnce([]);
    expect(await kickFromPlatform('did:plc:a')).toBe(0);
    expect(mockRemoveParticipant).not.toHaveBeenCalled();
  });

  it('ends any show the identity currently hosts live', async () => {
    mockParticipationFindMany.mockResolvedValueOnce([]);
    mockSpaceFindMany.mockResolvedValueOnce([{ id: 'sp1' }, { id: 'sp2' }]);
    mockEndLiveShow.mockResolvedValue({ space: {}, atproto: { ok: true } });
    await kickFromPlatform('did:plc:host');
    expect(mockSpaceFindMany).toHaveBeenCalledWith({
      where: { hostId: 'did:plc:host', isLive: true },
      select: { id: true },
    });
    expect(mockEndLiveShow).toHaveBeenCalledWith('sp1', { did: 'did:plc:host' });
    expect(mockEndLiveShow).toHaveBeenCalledWith('sp2', { did: 'did:plc:host' });
  });

  it('does not let one hosted show failing to end stop the others', async () => {
    mockParticipationFindMany.mockResolvedValueOnce([]);
    mockSpaceFindMany.mockResolvedValueOnce([{ id: 'sp1' }, { id: 'sp2' }]);
    mockEndLiveShow.mockRejectedValueOnce(new Error('egress down')).mockResolvedValueOnce({
      space: {},
      atproto: { ok: true },
    });
    await expect(kickFromPlatform('did:plc:host')).resolves.toBeDefined();
    expect(mockEndLiveShow).toHaveBeenCalledTimes(2);
  });
});
