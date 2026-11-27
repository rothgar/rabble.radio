// tests/lib/stage.test.ts
//
// Unit tests for the stage service. Mocks LiveKit and spaces modules so we
// can focus on permission checks, in-memory state, and token re-issuance.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserSummary } from '@/lib/users';

const {
  mockGetLiveKitClient,
  mockGenerateToken,
  mockMuteParticipant,
  mockGetSpaceById,
  mockGetSpaceBySlug,
  mockPushHostFollowersOnAir,
  mockGetUserByDid,
} = vi.hoisted(() => ({
  mockGetLiveKitClient: vi.fn(),
  mockGenerateToken: vi.fn(),
  mockMuteParticipant: vi.fn(async () => true),
  mockGetSpaceById: vi.fn(),
  mockGetSpaceBySlug: vi.fn(),
  mockPushHostFollowersOnAir: vi.fn(async () => ({ users: 0, delivered: 0 })),
  mockGetUserByDid: vi.fn(async (): Promise<UserSummary | null> => null),
}));

vi.mock('@/lib/metrics', () => ({
  startShowSession: vi.fn(async () => undefined),
  endShowSession: vi.fn(async () => undefined),
  recordJoin: vi.fn(async () => undefined),
  recordLeave: vi.fn(async () => undefined),
  recordStageChange: vi.fn(async () => undefined),
}));

vi.mock('@/lib/push', () => ({
  pushHostFollowersOnAir: mockPushHostFollowersOnAir,
}));

vi.mock('@/lib/users', () => ({
  getUserByDid: mockGetUserByDid,
}));


// In-memory stand-in for the D1 tables that hold stage state.
const fakeDb = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const tables: Record<string, Row[]> = { stageInvite: [], stageSpeaker: [], stageBlock: [] };
  const keyFields: Record<string, [string, string]> = {
    stageInvite: ['spaceId', 'targetIdentity'],
    stageSpeaker: ['spaceId', 'identity'],
    stageBlock: ['spaceId', 'identity'],
  };
  const matches = (row: Row, where: Row) =>
    Object.entries(where).every(([k, v]) => row[k] === v);
  const keyOf = (table: string, where: Row): Row => {
    const [a, b] = keyFields[table];
    const nested = (where[`${a}_${b}`] as Row | undefined) ?? where;
    return { [a]: nested[a], [b]: nested[b] };
  };
  const model = (table: string) => ({
    upsert: async ({ where, create, update }: { where: Row; create: Row; update: Row }) => {
      const key = keyOf(table, where);
      const existing = tables[table].find((r) => matches(r, key));
      if (existing) Object.assign(existing, update);
      else tables[table].push({ createdAt: new Date(), ...create });
      return existing ?? create;
    },
    findUnique: async ({ where }: { where: Row }) =>
      tables[table].find((r) => matches(r, keyOf(table, where))) ?? null,
    findMany: async ({ where }: { where: Row }) => tables[table].filter((r) => matches(r, where)),
    deleteMany: async ({ where }: { where: Row }) => {
      const before = tables[table].length;
      tables[table] = tables[table].filter((r) => !matches(r, where));
      return { count: before - tables[table].length };
    },
  });
  return {
    prisma: { stageInvite: model('stageInvite'), stageSpeaker: model('stageSpeaker'), stageBlock: model('stageBlock') },
    reset: () => {
      for (const t of Object.keys(tables)) tables[t] = [];
    },
  };
});

vi.mock('@/lib/db', () => ({ prisma: fakeDb.prisma }));

vi.mock('@/lib/livekit', () => ({
  getLiveKitClient: mockGetLiveKitClient,
  generateToken: mockGenerateToken,
  muteParticipant: mockMuteParticipant,
  removeParticipant: vi.fn(async () => undefined),
  roomNameForSpace: (id: string) => `space-${id}`,
}));

vi.mock('@/lib/spaces', () => ({
  getSpaceById: mockGetSpaceById,
  getSpaceBySlug: mockGetSpaceBySlug,
}));

function makeSpace(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sp1',
    slug: 'my-room-abc12345',
    title: 'My room',
    description: null,
    hostId: 'did:plc:host123',
    isLive: false,
    createdAt: new Date('2025-01-02T00:00:00Z'),
    updatedAt: new Date('2025-01-02T00:00:00Z'),
    host: {
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
      displayName: 'Alice',
      avatarUrl: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // LiveKit client is unreachable for these tests — we exercise the
  // best-effort path which gracefully degrades.
  mockGetLiveKitClient.mockImplementation(() => {
    throw new Error('not configured');
  });
  mockGenerateToken.mockResolvedValue({
    token: 'jwt.signed',
    wsUrl: 'ws://livekit:7880',
  });
  mockGetSpaceById.mockImplementation(async (id: string) => makeSpace({ id }));
  mockGetSpaceBySlug.mockResolvedValue(null);
});

describe('inviteToStage', () => {
  it('puts the target on stage immediately, muted, when the caller is the host', async () => {
    const stage = await import('@/lib/stage');
    fakeDb.reset();

    const result = await stage.inviteToStage({
      spaceId: 'sp1',
      hostDid: 'did:plc:host123',
      targetIdentity: 'did:plc:listener',
    });
    expect(result.ok).toBe(true);
    // No accept step: they're a speaker right away, with no pending invite.
    expect(await stage.listActiveSpeakers('sp1')).toContain('did:plc:listener');
    expect(await stage.getPendingInvite('sp1', 'did:plc:listener')).toBeNull();
    // Granted publish rights live so their already-connected client can
    // unmute without a new token; muted=false here only lifts the gate —
    // it does not turn their microphone on.
    expect(mockMuteParticipant).toHaveBeenCalledWith('space-sp1', 'did:plc:listener', false);
    // No origin given, so the best-effort push to the new speaker's own
    // followers is skipped, same as the equivalent acceptStageInvite tests.
    expect(mockPushHostFollowersOnAir).not.toHaveBeenCalled();
  });

  it('refuses to invite an identity the host has blocked', async () => {
    const stage = await import('@/lib/stage');
    fakeDb.reset();
    await stage.blockFromSpace({
      spaceId: 'sp1',
      hostDid: 'did:plc:host123',
      targetIdentity: 'did:plc:listener',
    });
    await expect(
      stage.inviteToStage({
        spaceId: 'sp1',
        hostDid: 'did:plc:host123',
        targetIdentity: 'did:plc:listener',
      })
    ).rejects.toMatchObject({ code: 'blocked', status: 403 });
    expect(await stage.listActiveSpeakers('sp1')).not.toContain('did:plc:listener');
  });

  it("notifies the invited guest's own followers that they are on air, not just the host's", async () => {
    const stage = await import('@/lib/stage');
    fakeDb.reset();
    mockGetSpaceById.mockImplementation(async (id: string) => makeSpace({ id, isLive: true }));
    mockGetUserByDid.mockResolvedValueOnce({
      did: 'did:plc:listener',
      handle: 'listener.bsky.social',
      displayName: 'Listener',
      avatarUrl: null,
    });

    await stage.inviteToStage({
      spaceId: 'sp1',
      hostDid: 'did:plc:host123',
      targetIdentity: 'did:plc:listener',
      origin: 'https://rabble.rodeo',
    });

    expect(mockGetUserByDid).toHaveBeenCalledWith('did:plc:listener');
    expect(mockPushHostFollowersOnAir).toHaveBeenCalledWith(
      {
        id: 'sp1',
        title: 'My room',
        host: { did: 'did:plc:listener', handle: 'listener.bsky.social', displayName: 'Listener' },
      },
      'https://rabble.rodeo'
    );
  });

  it('does not push when the guest is invited before the show is live (pre-show hold)', async () => {
    const stage = await import('@/lib/stage');
    fakeDb.reset();
    // Default makeSpace() fixture is isLive: false — a host can bring a
    // guest on stage during the pre-show hold, before going live. isLive
    // gates the lookup itself, so getUserByDid should not even be called.
    await stage.inviteToStage({
      spaceId: 'sp1',
      hostDid: 'did:plc:host123',
      targetIdentity: 'did:plc:listener',
      origin: 'https://rabble.rodeo',
    });

    expect(mockGetUserByDid).not.toHaveBeenCalled();
    expect(mockPushHostFollowersOnAir).not.toHaveBeenCalled();
  });

  it('does not push when the target has never signed into Rabble', async () => {
    const stage = await import('@/lib/stage');
    fakeDb.reset();
    mockGetSpaceById.mockImplementation(async (id: string) => makeSpace({ id, isLive: true }));
    mockGetUserByDid.mockResolvedValueOnce(null);

    await stage.inviteToStage({
      spaceId: 'sp1',
      hostDid: 'did:plc:host123',
      targetIdentity: 'did:plc:listener',
      origin: 'https://rabble.rodeo',
    });

    expect(mockPushHostFollowersOnAir).not.toHaveBeenCalled();
  });

  it('throws 403 when the caller is not the host', async () => {
    const stage = await import('@/lib/stage');
    fakeDb.reset();

    await expect(
      stage.inviteToStage({
        spaceId: 'sp1',
        hostDid: 'did:plc:not-host',
        targetIdentity: 'did:plc:listener',
      })
    ).rejects.toMatchObject({ code: 'forbidden', status: 403 });
  });

  it('throws 404 when the space does not exist', async () => {
    const stage = await import('@/lib/stage');
    fakeDb.reset();
    mockGetSpaceById.mockResolvedValueOnce(null);
    mockGetSpaceBySlug.mockResolvedValueOnce(null);

    await expect(
      stage.inviteToStage({
        spaceId: 'missing',
        hostDid: 'did:plc:host123',
        targetIdentity: 'did:plc:listener',
      })
    ).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });

  it('throws 400 when targetIdentity is missing', async () => {
    const stage = await import('@/lib/stage');
    fakeDb.reset();

    await expect(
      stage.inviteToStage({
        spaceId: 'sp1',
        hostDid: 'did:plc:host123',
        targetIdentity: '',
      })
    ).rejects.toMatchObject({ code: 'validation_error', status: 400 });
  });
});

// acceptStageInvite is dormant now that inviteToStage puts the target on
// stage directly: nothing in this codebase creates a pending invite
// anymore. These tests seed one straight into the fake D1 table (bypassing
// inviteToStage) to cover the back-compat path an unupdated client might
// still hit.
async function seedPendingInvite(overrides: Record<string, unknown> = {}): Promise<void> {
  const row = {
    spaceId: 'sp1',
    targetIdentity: 'did:plc:listener',
    hostDid: 'did:plc:host123',
    roomName: 'space-sp1',
    createdAt: new Date(),
    ...overrides,
  };
  await fakeDb.prisma.stageInvite.upsert({
    where: { spaceId_targetIdentity: { spaceId: row.spaceId, targetIdentity: row.targetIdentity } },
    create: row,
    update: row,
  });
}

describe('acceptStageInvite', () => {
  it('mints a speaker token when there is a pending invite', async () => {
    const stage = await import('@/lib/stage');
    fakeDb.reset();
    await seedPendingInvite();

    const result = await stage.acceptStageInvite({
      spaceId: 'sp1',
      userDid: 'did:plc:listener',
    });
    expect(result.role).toBe('speaker');
    expect(result.token).toBe('jwt.signed');
    expect(result.identity).toBe('did:plc:listener');
    expect(mockGenerateToken).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'speaker', identity: 'did:plc:listener' })
    );
    // Invite consumed.
    expect(await stage.getPendingInvite('sp1', 'did:plc:listener')).toBeNull();
    // Speaker tracked.
    expect(await stage.listActiveSpeakers('sp1')).toContain('did:plc:listener');
    // No handle/origin given, so the best-effort push to the new speaker's
    // own followers (issue #37) is skipped, same as tests above it.
    expect(mockPushHostFollowersOnAir).not.toHaveBeenCalled();
  });

  it('notifies the new speaker\'s own followers that they are on air, not just the host\'s', async () => {
    const stage = await import('@/lib/stage');
    fakeDb.reset();
    mockGetSpaceById.mockImplementation(async (id: string) => makeSpace({ id, isLive: true }));
    await seedPendingInvite();

    await stage.acceptStageInvite({
      spaceId: 'sp1',
      userDid: 'did:plc:listener',
      handle: 'listener.bsky.social',
      profileDisplayName: 'Listener',
      origin: 'https://rabble.rodeo',
    });

    expect(mockPushHostFollowersOnAir).toHaveBeenCalledWith(
      {
        id: 'sp1',
        title: 'My room',
        host: { did: 'did:plc:listener', handle: 'listener.bsky.social', displayName: 'Listener' },
      },
      'https://rabble.rodeo'
    );
  });

  it('does not push when the guest accepts before the show is live (pre-show hold)', async () => {
    const stage = await import('@/lib/stage');
    fakeDb.reset();
    // Default makeSpace() fixture is isLive: false — a guest can accept an
    // invite during the pre-show hold, before the host has gone live.
    await seedPendingInvite();

    await stage.acceptStageInvite({
      spaceId: 'sp1',
      userDid: 'did:plc:listener',
      handle: 'listener.bsky.social',
      profileDisplayName: 'Listener',
      origin: 'https://rabble.rodeo',
    });

    expect(mockPushHostFollowersOnAir).not.toHaveBeenCalled();
  });

  it('throws 404 when there is no pending invite', async () => {
    const stage = await import('@/lib/stage');
    fakeDb.reset();

    await expect(
      stage.acceptStageInvite({
        spaceId: 'sp1',
        userDid: 'did:plc:nobody',
      })
    ).rejects.toMatchObject({ code: 'no_pending_invite', status: 404 });
    expect(mockGenerateToken).not.toHaveBeenCalled();
  });
});

describe('leaveStage', () => {
  it('returns an audience token for the speaker', async () => {
    const stage = await import('@/lib/stage');
    fakeDb.reset();
    await stage.inviteToStage({
      spaceId: 'sp1',
      hostDid: 'did:plc:host123',
      targetIdentity: 'did:plc:listener',
    });
    mockGenerateToken.mockClear();

    const result = await stage.leaveStage({
      spaceId: 'sp1',
      userDid: 'did:plc:listener',
    });
    expect(result.role).toBe('audience');
    expect(result.identity).toBe('did:plc:listener');
    expect(mockGenerateToken).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'audience', identity: 'did:plc:listener' })
    );
    expect(await stage.listActiveSpeakers('sp1')).not.toContain('did:plc:listener');
  });

  it('mints an audience token even if the caller was never on stage', async () => {
    const stage = await import('@/lib/stage');
    fakeDb.reset();
    const result = await stage.leaveStage({
      spaceId: 'sp1',
      userDid: 'did:plc:listener',
    });
    expect(result.role).toBe('audience');
    expect(mockGenerateToken).toHaveBeenCalled();
  });
});

describe('removeFromStage', () => {
  it('mints an audience token when the host removes a speaker', async () => {
    const stage = await import('@/lib/stage');
    fakeDb.reset();
    await stage.inviteToStage({
      spaceId: 'sp1',
      hostDid: 'did:plc:host123',
      targetIdentity: 'did:plc:listener',
    });
    mockGenerateToken.mockClear();

    const result = await stage.removeFromStage({
      spaceId: 'sp1',
      hostDid: 'did:plc:host123',
      targetIdentity: 'did:plc:listener',
    });
    expect(result.role).toBe('audience');
    expect(result.identity).toBe('did:plc:listener');
    expect(mockGenerateToken).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'audience', identity: 'did:plc:listener' })
    );
    expect(await stage.listActiveSpeakers('sp1')).not.toContain('did:plc:listener');
  });

  it('throws 403 when the caller is not the host', async () => {
    const stage = await import('@/lib/stage');
    fakeDb.reset();
    await expect(
      stage.removeFromStage({
        spaceId: 'sp1',
        hostDid: 'did:plc:not-host',
        targetIdentity: 'did:plc:listener',
      })
    ).rejects.toMatchObject({ code: 'forbidden', status: 403 });
  });

  it('throws 400 when targetIdentity is missing', async () => {
    const stage = await import('@/lib/stage');
    fakeDb.reset();
    await expect(
      stage.removeFromStage({
        spaceId: 'sp1',
        hostDid: 'did:plc:host123',
        targetIdentity: '',
      })
    ).rejects.toMatchObject({ code: 'validation_error', status: 400 });
  });
});

describe('listPendingInvites', () => {
  it('returns invites for the requested space only', async () => {
    const stage = await import('@/lib/stage');
    fakeDb.reset();

    await seedPendingInvite({ targetIdentity: 'did:plc:listener1' });
    await seedPendingInvite({ spaceId: 'sp2', targetIdentity: 'did:plc:listener2', roomName: 'space-sp2' });

    const sp1Invites = await stage.listPendingInvites('sp1');
    expect(sp1Invites).toHaveLength(1);
    expect(sp1Invites[0].targetIdentity).toBe('did:plc:listener1');

    const sp2Invites = await stage.listPendingInvites('sp2');
    expect(sp2Invites).toHaveLength(1);
    expect(sp2Invites[0].targetIdentity).toBe('did:plc:listener2');
  });
});
