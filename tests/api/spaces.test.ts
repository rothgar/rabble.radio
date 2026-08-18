// tests/api/spaces.test.ts
//
// Exercises /api/spaces (GET + POST) and /api/spaces/[id] (GET) with mocked
// Prisma, session, LiveKit, ATProto, and recording helpers.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockCreateSpace,
  mockGetSpaces,
  mockGetSpacesForUser,
  mockGetSpaceById,
  mockGetSpaceBySlug,
  mockTryExpireStaleSpaces,
  mockSetSpaceLive,
  mockToPublicSpace,
  mockGetCurrentUser,
  mockFindUserByDid,
  mockPublishLiveStatus,
  mockCreateHostToken,
  mockRoomNameForSpace,
  mockStartRecording,
  mockCreateRecording,
  mockFindActiveRecordingForSpace,
  mockBuildRecordingKey,
  mockLogger,
} = vi.hoisted(() => ({
  mockCreateSpace: vi.fn(),
  mockGetSpaces: vi.fn(),
  mockGetSpacesForUser: vi.fn(),
  mockGetSpaceById: vi.fn(),
  mockGetSpaceBySlug: vi.fn(),
  mockTryExpireStaleSpaces: vi.fn(),
  mockSetSpaceLive: vi.fn(),
  mockToPublicSpace: vi.fn(),
  mockGetCurrentUser: vi.fn(),
  mockFindUserByDid: vi.fn(),
  mockPublishLiveStatus: vi.fn(),
  mockCreateHostToken: vi.fn(),
  mockRoomNameForSpace: vi.fn(),
  mockStartRecording: vi.fn(),
  mockCreateRecording: vi.fn(),
  mockFindActiveRecordingForSpace: vi.fn(),
  mockBuildRecordingKey: vi.fn(),
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  },
}));

vi.mock('@/lib/spaces', () => ({
  createSpace: mockCreateSpace,
  getSpaces: mockGetSpaces,
  getSpacesForUser: mockGetSpacesForUser,
  getSpaceById: mockGetSpaceById,
  getSpaceBySlug: mockGetSpaceBySlug,
  tryExpireStaleSpaces: mockTryExpireStaleSpaces,
  setSpaceLive: mockSetSpaceLive,
  toPublicSpace: mockToPublicSpace,
}));

vi.mock('@/lib/session', () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: mockFindUserByDid,
    },
  },
}));

vi.mock('@/lib/atproto', () => ({
  publishLiveStatus: mockPublishLiveStatus,
}));

vi.mock('@/lib/recording', () => ({
  createRecording: mockCreateRecording,
  findActiveRecordingForSpace: mockFindActiveRecordingForSpace,
  buildRecordingKey: mockBuildRecordingKey,
}));

vi.mock('@/lib/livekit', () => ({
  createHostToken: mockCreateHostToken,
  roomNameForSpace: mockRoomNameForSpace,
  startRecording: mockStartRecording,
}));

vi.mock('@/lib/logger', () => ({
  logger: mockLogger,
}));

function makeSpaceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sp1',
    slug: 'my-room-abc12345',
    title: 'My room',
    description: null,
    hostId: 'did:plc:host123',
    isLive: false,
    scheduledAt: null,
    expiresAt: null,
    createdAt: new Date('2025-01-02T00:00:00Z'),
    updatedAt: new Date('2025-01-02T00:00:00Z'),
    host: {
      id: 'u1',
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
      displayName: 'Alice',
      avatarUrl: null,
    },
    ...overrides,
  };
}

function publicSpaceFromRow(space: Record<string, unknown>) {
  return {
    id: space.id,
    slug: space.slug,
    title: space.title,
    description: space.description ?? null,
    isLive: space.isLive,
    status: space.status ?? 'active',
    scheduledAt: space.scheduledAt ?? null,
    expiresAt: space.expiresAt ?? null,
    createdAt: '2025-01-02T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
    host: {
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
      displayName: 'Alice',
      avatarUrl: null,
    },
    shareableUrl: `http://localhost/space/${space.id}`,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default toPublicSpace implementation: pull fields straight off the row.
  mockToPublicSpace.mockImplementation(
    (space: Record<string, unknown>) => publicSpaceFromRow(space)
  );
  // Default recording helpers to "no recording yet, Egress unavailable".
  mockFindActiveRecordingForSpace.mockResolvedValue(null);
  mockStartRecording.mockResolvedValue(null);
  mockBuildRecordingKey.mockImplementation(
    (roomName: string, startedAt: Date) =>
      `recordings/${roomName}-${startedAt.getTime()}.mp4`
  );
  mockRoomNameForSpace.mockImplementation(
    (spaceId: string) => `space-${spaceId}`
  );
  // Default user profile lookup for the start-now flow.
  mockFindUserByDid.mockResolvedValue({
    displayName: 'Alice',
    avatarUrl: 'https://cdn.example/avatar.png',
  });
});

describe('GET /api/spaces', () => {
  it('returns the list of spaces', async () => {
    mockTryExpireStaleSpaces.mockResolvedValueOnce(0);
    mockGetCurrentUser.mockResolvedValueOnce(null);
    mockGetSpacesForUser.mockResolvedValueOnce([
      makeSpaceRow({ id: 'sp2' }),
      makeSpaceRow({ id: 'sp1' }),
    ]);
    const { GET } = await import('@/app/api/spaces/route');
    const res = await GET(new NextRequest('http://localhost/api/spaces'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.spaces).toHaveLength(2);
    expect(body.spaces[0].id).toBe('sp2');
    expect(body.spaces[0].shareableUrl).toBe('http://localhost/space/sp2');
  });
});

describe('POST /api/spaces', () => {
  it('requires auth', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/spaces/route');
    const req = new NextRequest('http://localhost/api/spaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Hi' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(mockCreateSpace).not.toHaveBeenCalled();
  });

  it('validates the title', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    const { POST } = await import('@/app/api/spaces/route');
    const req = new NextRequest('http://localhost/api/spaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '   ' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
    expect(mockCreateSpace).not.toHaveBeenCalled();
  });

  it('creates a space and returns 201 with shareableUrl', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    mockCreateSpace.mockResolvedValueOnce(makeSpaceRow({ title: 'New room' }));

    const { POST } = await import('@/app/api/spaces/route');
    const req = new NextRequest('http://localhost/api/spaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'New room',
        description: 'Talking about things',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.space.id).toBe('sp1');
    expect(body.space.title).toBe('New room');
    expect(body.space.shareableUrl).toBe('http://localhost/space/sp1');
    expect(mockCreateSpace).toHaveBeenCalledWith({
      title: 'New room',
      description: 'Talking about things',
      hostId: 'did:plc:host123',
      scheduledAt: null,
    });
  });

  it('returns 500 when createSpace throws', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    mockCreateSpace.mockRejectedValueOnce(new Error('db exploded'));

    const { POST } = await import('@/app/api/spaces/route');
    const req = new NextRequest('http://localhost/api/spaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Hi' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('create_failed');
  });

  it('rejects startNow that is not a boolean', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    const { POST } = await import('@/app/api/spaces/route');
    const req = new NextRequest('http://localhost/api/spaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Hi', startNow: 'yes' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
    expect(mockCreateSpace).not.toHaveBeenCalled();
  });

  it('startNow: true + scheduledAt returns 400', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    const { POST } = await import('@/app/api/spaces/route');
    const future = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    );
    // Snap to a valid 15-minute boundary so we exercise the combination
    // rule, not the boundary rule.
    future.setUTCMinutes(0, 0, 0);
    const req = new NextRequest('http://localhost/api/spaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Hi',
        startNow: true,
        scheduledAt: future.toISOString(),
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
    expect(body.message).toMatch(/startNow/i);
    expect(mockCreateSpace).not.toHaveBeenCalled();
  });

  it('scheduledAt in the past returns 400', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    const { POST } = await import('@/app/api/spaces/route');
    const past = new Date(Date.now() - 60 * 60 * 1000);
    past.setUTCMinutes(0, 0, 0);
    const req = new NextRequest('http://localhost/api/spaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Hi',
        scheduledAt: past.toISOString(),
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
    expect(body.message).toMatch(/future/i);
    expect(mockCreateSpace).not.toHaveBeenCalled();
  });

  it('scheduledAt more than 30 days in the future returns 400', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    const { POST } = await import('@/app/api/spaces/route');
    const farFuture = new Date(
      Date.now() + 31 * 24 * 60 * 60 * 1000
    );
    farFuture.setUTCMinutes(0, 0, 0);
    const req = new NextRequest('http://localhost/api/spaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Hi',
        scheduledAt: farFuture.toISOString(),
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
    expect(body.message).toMatch(/30 days/i);
    expect(mockCreateSpace).not.toHaveBeenCalled();
  });

  it('scheduledAt not on a 15-minute boundary returns 400', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    const { POST } = await import('@/app/api/spaces/route');
    // 7 minutes past the hour is NOT on a 15-minute boundary.
    const offBoundary = new Date(Date.now() + 60 * 60 * 1000);
    offBoundary.setUTCMinutes(7, 0, 0);
    const req = new NextRequest('http://localhost/api/spaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Hi',
        scheduledAt: offBoundary.toISOString(),
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
    expect(body.message).toMatch(/15-minute/);
    expect(mockCreateSpace).not.toHaveBeenCalled();
  });

  it('valid scheduledAt creates a scheduled space', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    const scheduled = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    );
    scheduled.setUTCMinutes(0, 0, 0);
    mockCreateSpace.mockResolvedValueOnce(
      makeSpaceRow({
        id: 'sp_sched',
        status: 'scheduled',
        scheduledAt: scheduled,
      })
    );

    const { POST } = await import('@/app/api/spaces/route');
    const req = new NextRequest('http://localhost/api/spaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Later',
        scheduledAt: scheduled.toISOString(),
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.space.id).toBe('sp_sched');
    expect(body.space.status).toBe('scheduled');
    expect(mockCreateSpace).toHaveBeenCalledWith({
      title: 'Later',
      description: null,
      hostId: 'did:plc:host123',
      scheduledAt: scheduled,
    });
  });

  it('startNow: true creates a live space and returns token fields', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    mockCreateSpace.mockResolvedValueOnce(
      makeSpaceRow({ status: 'active', isLive: false })
    );
    mockCreateHostToken.mockResolvedValueOnce({
      token: 'jwt.host.token',
      wsUrl: 'ws://livekit:7880',
      roomName: 'space-sp1',
      identity: 'did:plc:host123',
    });
    mockSetSpaceLive.mockResolvedValueOnce(
      makeSpaceRow({ status: 'live', isLive: true })
    );
    mockPublishLiveStatus.mockResolvedValueOnce({
      ok: true,
      uri: 'at://did:plc:host123/app.bsky.actor.status/self',
    });

    const { POST } = await import('@/app/api/spaces/route');
    const req = new NextRequest('http://localhost/api/spaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Now', startNow: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.startNow).toBe(true);
    expect(body.token).toBe('jwt.host.token');
    expect(body.wsUrl).toBe('ws://livekit:7880');
    expect(body.role).toBe('host');
    expect(body.roomName).toBe('space-sp1');
    expect(body.identity).toBe('did:plc:host123');
    expect(body.handle).toBe('alice.bsky.social');
    expect(body.displayName).toBe('Alice');
    expect(body.avatarUrl).toBe('https://cdn.example/avatar.png');
    expect(body.space.status).toBe('live');

    // createSpace must be called with scheduledAt: null.
    expect(mockCreateSpace).toHaveBeenCalledWith({
      title: 'Now',
      description: null,
      hostId: 'did:plc:host123',
      scheduledAt: null,
    });
    expect(mockCreateHostToken).toHaveBeenCalledWith('sp1', {
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    expect(mockSetSpaceLive).toHaveBeenCalledWith('sp1', true);
    expect(mockFindUserByDid).toHaveBeenCalledWith({
      where: { did: 'did:plc:host123' },
      select: { displayName: true, avatarUrl: true },
    });
    expect(mockPublishLiveStatus).toHaveBeenCalledTimes(1);
    expect(mockPublishLiveStatus.mock.calls[0][0]).toMatchObject({
      spaceUrl: 'http://localhost/space/sp1',
      title: 'My room',
      session: {
        did: 'did:plc:host123',
        handle: 'alice.bsky.social',
      },
    });
  });

  it('startNow: true rolls back live when ATProto publish fails', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    mockCreateSpace.mockResolvedValueOnce(
      makeSpaceRow({ status: 'active', isLive: false })
    );
    mockCreateHostToken.mockResolvedValueOnce({
      token: 'jwt.host.token',
      wsUrl: 'ws://livekit:7880',
      roomName: 'space-sp1',
      identity: 'did:plc:host123',
    });
    mockSetSpaceLive
      .mockResolvedValueOnce(makeSpaceRow({ status: 'live', isLive: true }))
      .mockResolvedValueOnce(
        makeSpaceRow({ status: 'active', isLive: false })
      );
    mockPublishLiveStatus.mockResolvedValueOnce({
      ok: false,
      error: 'PDS unavailable',
    });

    const { POST } = await import('@/app/api/spaces/route');
    const req = new NextRequest('http://localhost/api/spaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Now', startNow: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('atproto_failed');
    // setSpaceLive(true) then setSpaceLive(false) — rollback.
    expect(mockSetSpaceLive).toHaveBeenNthCalledWith(1, 'sp1', true);
    expect(mockSetSpaceLive).toHaveBeenNthCalledWith(2, 'sp1', false);
  });

  it('startNow: true with a recording error still returns the token envelope', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    mockCreateSpace.mockResolvedValueOnce(
      makeSpaceRow({ status: 'active', isLive: false })
    );
    mockCreateHostToken.mockResolvedValueOnce({
      token: 'jwt.host.token',
      wsUrl: 'ws://livekit:7880',
      roomName: 'space-sp1',
      identity: 'did:plc:host123',
    });
    mockSetSpaceLive.mockResolvedValueOnce(
      makeSpaceRow({ status: 'live', isLive: true })
    );
    mockPublishLiveStatus.mockResolvedValueOnce({ ok: true });
    mockFindActiveRecordingForSpace.mockResolvedValueOnce(null);
    mockStartRecording.mockResolvedValueOnce({
      egressId: 'eg_start_now',
    });
    mockCreateRecording.mockRejectedValueOnce(new Error('db insert failed'));

    const { POST } = await import('@/app/api/spaces/route');
    const req = new NextRequest('http://localhost/api/spaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Now', startNow: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.startNow).toBe(true);
    expect(body.token).toBe('jwt.host.token');
    expect(body.recordingError).toBe('db insert failed');
  });

  it('startNow: token-generation failure leaves space active and returns 500', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    mockCreateSpace.mockResolvedValueOnce(
      makeSpaceRow({ status: 'active', isLive: false })
    );
    mockCreateHostToken.mockRejectedValueOnce(
      new Error('livekit credentials missing')
    );

    const { POST } = await import('@/app/api/spaces/route');
    const req = new NextRequest('http://localhost/api/spaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Now', startNow: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('token_failed');

    // createSpace was called (so the row exists in `active`) but the spec
    // says we must NOT call setSpaceLive when token minting fails.
    expect(mockCreateSpace).toHaveBeenCalledTimes(1);
    expect(mockSetSpaceLive).not.toHaveBeenCalled();
    expect(mockPublishLiveStatus).not.toHaveBeenCalled();
  });
});

describe('GET /api/spaces/[id]', () => {
  it('returns the space when found by id', async () => {
    mockGetSpaceById.mockResolvedValueOnce(makeSpaceRow());
    mockGetSpaceBySlug.mockResolvedValueOnce(null);

    const { GET } = await import('@/app/api/spaces/[id]/route');
    const res = await GET(
      new NextRequest('http://localhost/api/spaces/sp1'),
      { params: Promise.resolve({ id: 'sp1' }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.space.id).toBe('sp1');
    expect(mockGetSpaceById).toHaveBeenCalledWith('sp1');
  });

  it('falls back to slug lookup and returns 404 if missing', async () => {
    mockGetSpaceById.mockResolvedValueOnce(null);
    mockGetSpaceBySlug.mockResolvedValueOnce(null);

    const { GET } = await import('@/app/api/spaces/[id]/route');
    const res = await GET(
      new NextRequest('http://localhost/api/spaces/missing'),
      { params: Promise.resolve({ id: 'missing' }) }
    );
    expect(res.status).toBe(404);
    expect(mockGetSpaceById).toHaveBeenCalledWith('missing');
    expect(mockGetSpaceBySlug).toHaveBeenCalledWith('missing');
  });
});
