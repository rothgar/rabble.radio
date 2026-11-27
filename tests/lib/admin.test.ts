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
  mockQueryRaw,
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
  mockQueryRaw: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { count: mockCount, findMany: mockFindMany, findUnique: mockFindUnique, update: mockUpdate },
    space: { count: mockCount, findMany: mockSpaceFindMany },
    showSession: { count: mockCount },
    showParticipation: { findMany: mockParticipationFindMany },
    $queryRaw: mockQueryRaw,
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
  getPlatformActivity,
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
  it('matches DIDs from ADMIN_DIDS case-insensitively, never handles', () => {
    const env = { ADMIN_DIDS: 'DID:plc:Admin, @Justin.Test' };
    expect(isAdmin({ did: 'did:plc:admin', handle: 'x' }, env)).toBe(true);
    // Handles are reassignable on Bluesky, so a listed handle grants nothing.
    expect(isAdmin({ did: 'did:plc:other', handle: 'justin.test' }, env)).toBe(false);
    expect(isAdmin({ did: 'did:plc:other', handle: 'bob' }, env)).toBe(false);
    expect(isAdmin(null, env)).toBe(false);
    expect(isAdmin({ did: 'did:plc:admin', handle: 'x' }, {})).toBe(false);
  });

  it('adminDids trims and lowercases entries and drops anything that is not a DID', () => {
    expect(adminDids({ ADMIN_DIDS: ' DID:PLC:A , @Bob ' })).toEqual(new Set(['did:plc:a']));
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

describe('getPlatformActivity', () => {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const now = new Date('2026-11-27T12:00:00.000Z');
  const toSqliteIso = (d: Date) => d.toISOString().replace('Z', '+00:00');
  const nowIso = toSqliteIso(now);
  const last7Iso = toSqliteIso(new Date(now.getTime() - WEEK_MS));
  const prev7Iso = toSqliteIso(new Date(now.getTime() - 2 * WEEK_MS));
  const seriesStartIso = toSqliteIso(new Date(now.getTime() - 12 * WEEK_MS));

  function valuesOf(call: unknown[]): unknown[] {
    return call.slice(1);
  }
  function sqlOf(call: unknown[]): string {
    return (call[0] as string[]).join('');
  }

  function queueHappyPath(): void {
    mockQueryRaw
      .mockResolvedValueOnce([{ current: 5, previous: 3 }]) // User sign-ups
      .mockResolvedValueOnce([
        { showsCurrent: 4, showsPrevious: 2, secondsCurrent: 7200, secondsPrevious: 3600, peakCurrent: 10, peakPrevious: 6 },
      ]) // ShowSession
      .mockResolvedValueOnce([{ joinsCurrent: 20, joinsPrevious: 15, distinctCurrent: 8, distinctPrevious: 5 }]) // ShowParticipation
      .mockResolvedValueOnce([{ current: 30, previous: 25 }]) // ShowReaction
      .mockResolvedValueOnce([{ current: 9, previous: 4 }]) // ShowLike
      .mockResolvedValueOnce([
        { week: 0, count: 5 },
        { week: 5, count: 2 },
      ]) // sign-up weeks
      .mockResolvedValueOnce([
        { week: 0, count: 4 },
        { week: 11, count: 1 },
      ]) // show weeks
      .mockResolvedValueOnce([{ week: 0, count: 20 }]); // listener-join weeks
  }

  it('reports each window and rolls durationSeconds up into hours', async () => {
    queueHappyPath();
    const out = await getPlatformActivity(now);
    expect(out.signUps).toEqual({ current: 5, previous: 3 });
    expect(out.showsHosted).toEqual({ current: 4, previous: 2 });
    expect(out.hoursHosted).toEqual({ current: 2, previous: 1 });
    expect(out.listenerJoins).toEqual({ current: 20, previous: 15 });
    expect(out.distinctListeners).toEqual({ current: 8, previous: 5 });
    expect(out.peakConcurrentListeners).toEqual({ current: 10, previous: 6 });
    expect(out.reactions).toEqual({ current: 30, previous: 25 });
    expect(out.likes).toEqual({ current: 9, previous: 4 });
  });

  it('zero-fills weeks the DB returned no bucket for, newest first', async () => {
    queueHappyPath();
    const out = await getPlatformActivity(now);
    expect(out.weeklySeries).toHaveLength(12);
    expect(out.weeklySeries[0]).toEqual({
      weekStart: new Date(now.getTime() - WEEK_MS).toISOString().slice(0, 10),
      signUps: 5,
      showsHosted: 4,
      listenerJoins: 20,
    });
    expect(out.weeklySeries[5].signUps).toBe(2);
    expect(out.weeklySeries[5].showsHosted).toBe(0);
    expect(out.weeklySeries[11].showsHosted).toBe(1);
    expect(out.weeklySeries[11].signUps).toBe(0);
    expect(out.weeklySeries[11].weekStart).toBe(new Date(now.getTime() - 12 * WEEK_MS).toISOString().slice(0, 10));
  });

  it('windows every query on the same last-7/previous-7/now boundaries', async () => {
    queueHappyPath();
    await getPlatformActivity(now);
    expect(valuesOf(mockQueryRaw.mock.calls[0])).toEqual([last7Iso, last7Iso, prev7Iso, nowIso]);
    expect(valuesOf(mockQueryRaw.mock.calls[3])).toEqual([last7Iso, last7Iso, prev7Iso, nowIso]); // ShowReaction
    expect(valuesOf(mockQueryRaw.mock.calls[4])).toEqual([last7Iso, last7Iso, prev7Iso, nowIso]); // ShowLike
    expect(valuesOf(mockQueryRaw.mock.calls[5])).toEqual([nowIso, seriesStartIso, nowIso]); // sign-up weeks
  });

  it('counts only listener-role rows, distinct on non-anonymous identity', async () => {
    queueHappyPath();
    await getPlatformActivity(now);
    const participationCall = mockQueryRaw.mock.calls[2];
    expect(sqlOf(participationCall)).toContain(`"role" = 'listener'`);
    expect(sqlOf(participationCall)).toContain('"anonymous" = 0 THEN "identity"');
    expect(valuesOf(participationCall)).toEqual([last7Iso, last7Iso, last7Iso, last7Iso, prev7Iso, nowIso]);

    const joinWeeksCall = mockQueryRaw.mock.calls[7];
    expect(sqlOf(joinWeeksCall)).toContain(`"role" = 'listener'`);
  });

  it('defaults every window and the series to zero when nothing matches', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const out = await getPlatformActivity(now);
    expect(out.signUps).toEqual({ current: 0, previous: 0 });
    expect(out.hoursHosted).toEqual({ current: 0, previous: 0 });
    expect(out.peakConcurrentListeners).toEqual({ current: 0, previous: 0 });
    expect(out.weeklySeries.every((w) => w.signUps === 0 && w.showsHosted === 0 && w.listenerJoins === 0)).toBe(true);
  });
});
