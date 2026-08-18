// tests/lib/stage.test.ts
//
// Unit tests for the stage service. Mocks LiveKit and spaces modules so we
// can focus on permission checks, in-memory state, and token re-issuance.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGetLiveKitClient,
  mockGenerateToken,
  mockGetSpaceById,
  mockGetSpaceBySlug,
} = vi.hoisted(() => ({
  mockGetLiveKitClient: vi.fn(),
  mockGenerateToken: vi.fn(),
  mockGetSpaceById: vi.fn(),
  mockGetSpaceBySlug: vi.fn(),
}));

vi.mock('@/lib/livekit', () => ({
  getLiveKitClient: mockGetLiveKitClient,
  generateToken: mockGenerateToken,
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
  it('creates a pending invite when the caller is the host', async () => {
    const stage = await import('@/lib/stage');
    stage.__resetStageStoresForTests();

    const result = await stage.inviteToStage({
      spaceId: 'sp1',
      hostDid: 'did:plc:host123',
      targetIdentity: 'did:plc:listener',
    });
    expect(result.ok).toBe(true);
    expect(result.invite.targetIdentity).toBe('did:plc:listener');
    expect(stage.getPendingInvite('sp1', 'did:plc:listener')).not.toBeNull();
  });

  it('throws 403 when the caller is not the host', async () => {
    const stage = await import('@/lib/stage');
    stage.__resetStageStoresForTests();

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
    stage.__resetStageStoresForTests();
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
    stage.__resetStageStoresForTests();

    await expect(
      stage.inviteToStage({
        spaceId: 'sp1',
        hostDid: 'did:plc:host123',
        targetIdentity: '',
      })
    ).rejects.toMatchObject({ code: 'validation_error', status: 400 });
  });
});

describe('acceptStageInvite', () => {
  it('mints a speaker token when there is a pending invite', async () => {
    const stage = await import('@/lib/stage');
    stage.__resetStageStoresForTests();
    await stage.inviteToStage({
      spaceId: 'sp1',
      hostDid: 'did:plc:host123',
      targetIdentity: 'did:plc:listener',
    });

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
    expect(stage.getPendingInvite('sp1', 'did:plc:listener')).toBeNull();
    // Speaker tracked.
    expect(stage.listActiveSpeakers('sp1')).toContain('did:plc:listener');
  });

  it('throws 404 when there is no pending invite', async () => {
    const stage = await import('@/lib/stage');
    stage.__resetStageStoresForTests();

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
    stage.__resetStageStoresForTests();
    await stage.inviteToStage({
      spaceId: 'sp1',
      hostDid: 'did:plc:host123',
      targetIdentity: 'did:plc:listener',
    });
    await stage.acceptStageInvite({
      spaceId: 'sp1',
      userDid: 'did:plc:listener',
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
    expect(stage.listActiveSpeakers('sp1')).not.toContain('did:plc:listener');
  });

  it('mints an audience token even if the caller was never on stage', async () => {
    const stage = await import('@/lib/stage');
    stage.__resetStageStoresForTests();
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
    stage.__resetStageStoresForTests();
    await stage.inviteToStage({
      spaceId: 'sp1',
      hostDid: 'did:plc:host123',
      targetIdentity: 'did:plc:listener',
    });
    await stage.acceptStageInvite({
      spaceId: 'sp1',
      userDid: 'did:plc:listener',
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
    expect(stage.listActiveSpeakers('sp1')).not.toContain('did:plc:listener');
  });

  it('throws 403 when the caller is not the host', async () => {
    const stage = await import('@/lib/stage');
    stage.__resetStageStoresForTests();
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
    stage.__resetStageStoresForTests();
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
    stage.__resetStageStoresForTests();
    // Second space.
    mockGetSpaceById.mockImplementation(async (id: string) => makeSpace({ id }));

    await stage.inviteToStage({
      spaceId: 'sp1',
      hostDid: 'did:plc:host123',
      targetIdentity: 'did:plc:listener1',
    });
    await stage.inviteToStage({
      spaceId: 'sp2',
      hostDid: 'did:plc:host123',
      targetIdentity: 'did:plc:listener2',
    });

    const sp1Invites = stage.listPendingInvites('sp1');
    expect(sp1Invites).toHaveLength(1);
    expect(sp1Invites[0].targetIdentity).toBe('did:plc:listener1');

    const sp2Invites = stage.listPendingInvites('sp2');
    expect(sp2Invites).toHaveLength(1);
    expect(sp2Invites[0].targetIdentity).toBe('did:plc:listener2');
  });
});
