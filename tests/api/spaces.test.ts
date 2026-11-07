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
  mockFindDefaultHostedSpace,
  mockReopenSpace,
  mockResolveSpaceForUser,
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
  mockFindDefaultHostedSpace: vi.fn(),
  mockReopenSpace: vi.fn(),
  mockResolveSpaceForUser: vi.fn(),
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
  defaultShowTitle: (handle: string) => `@${handle}'s show`,
  getSpaces: mockGetSpaces,
  getSpacesForUser: mockGetSpacesForUser,
  getSpaceById: mockGetSpaceById,
  getSpaceBySlug: mockGetSpaceBySlug,
  tryExpireStaleSpaces: mockTryExpireStaleSpaces,
  setSpaceLive: mockSetSpaceLive,
  toPublicSpace: mockToPublicSpace,
  findDefaultHostedSpace: mockFindDefaultHostedSpace,
  reopenSpace: mockReopenSpace,
  resolveSpaceForUser: mockResolveSpaceForUser,
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
  getLatestAvailableRecordings: vi.fn(async () => new Map()),
  recordingDurationSeconds: vi.fn(() => null),
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
    shareableUrl: `http://localhost/show/${space.id}`,
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
    expect(body.spaces[0].shareableUrl).toBe('http://localhost/show/sp2');
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
    expect(body.space.shareableUrl).toBe('http://localhost/show/sp1');
    expect(mockCreateSpace).toHaveBeenCalledWith({
      title: 'New room',
      description: 'Talking about things',
      tags: [],
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
      tags: [],
      hostId: 'did:plc:host123',
      scheduledAt: scheduled,
    });
  });

  it('startNow: true creates an off-air space and returns the host token', async () => {
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
    expect(body.onAir).toBe(false);
    expect(body.token).toBe('jwt.host.token');
    expect(body.wsUrl).toBe('ws://livekit:7880');
    expect(body.role).toBe('host');
    expect(body.roomName).toBe('space-sp1');
    expect(body.identity).toBe('did:plc:host123');
    expect(body.handle).toBe('alice.bsky.social');
    expect(body.displayName).toBe('Alice');
    expect(body.avatarUrl).toBe('https://cdn.example/avatar.png');
    expect(body.space.status).toBe('active');

    // createSpace must be called with scheduledAt: null.
    expect(mockCreateSpace).toHaveBeenCalledWith({
      title: 'Now',
      description: null,
      tags: [],
      hostId: 'did:plc:host123',
      scheduledAt: null,
    });
    expect(mockCreateHostToken).toHaveBeenCalledWith('sp1', {
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    expect(mockFindUserByDid).toHaveBeenCalledWith({
      where: { did: 'did:plc:host123' },
      select: { displayName: true, avatarUrl: true },
    });
    // Going on air is a separate step (POST /api/spaces/[id]/live): the
    // instant start publishes nothing and records nothing.
    expect(mockSetSpaceLive).not.toHaveBeenCalled();
    expect(mockPublishLiveStatus).not.toHaveBeenCalled();
    expect(mockStartRecording).not.toHaveBeenCalled();
  });

  it('startNow: true without a title uses a default built from the handle', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    mockCreateSpace.mockResolvedValueOnce(
      makeSpaceRow({ status: 'active', isLive: false, title: "@alice.bsky.social's show" })
    );
    mockCreateHostToken.mockResolvedValueOnce({
      token: 'jwt.host.token',
      wsUrl: 'ws://livekit:7880',
      roomName: 'space-sp1',
      identity: 'did:plc:host123',
    });

    const { POST } = await import('@/app/api/spaces/route');
    const req = new NextRequest('http://localhost/api/spaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ startNow: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(mockCreateSpace).toHaveBeenCalledWith(
      expect.objectContaining({ title: "@alice.bsky.social's show", hostId: 'did:plc:host123' })
    );
  });

  it('startNow without a title reopens the existing default show instead of creating one', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({ did: 'did:plc:host123', handle: 'alice.bsky.social' });
    mockFindDefaultHostedSpace.mockResolvedValueOnce(makeSpaceRow({ id: 'sp-old', status: 'expired' }));
    mockReopenSpace.mockResolvedValueOnce(makeSpaceRow({ id: 'sp-old', status: 'active', isLive: false }));
    mockCreateHostToken.mockResolvedValueOnce({
      token: 'jwt.host.token',
      wsUrl: 'ws://livekit:7880',
      roomName: 'space-sp-old',
      identity: 'did:plc:host123',
    });

    const { POST } = await import('@/app/api/spaces/route');
    const req = new NextRequest('http://localhost/api/spaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ startNow: true }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(mockFindDefaultHostedSpace).toHaveBeenCalledWith('did:plc:host123', 'alice.bsky.social');
    expect(mockReopenSpace).toHaveBeenCalledWith('sp-old');
    expect(mockCreateSpace).not.toHaveBeenCalled();
    expect(body.reopened).toBe(true);
    expect(mockCreateHostToken).toHaveBeenCalledWith('sp-old', expect.anything());
  });

  it('startNow with a title always creates a new show', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({ did: 'did:plc:host123', handle: 'alice.bsky.social' });
    mockCreateSpace.mockResolvedValueOnce(makeSpaceRow({ id: 'sp-new', title: 'Second show' }));
    mockCreateHostToken.mockResolvedValueOnce({
      token: 't',
      wsUrl: 'ws://livekit:7880',
      roomName: 'space-sp-new',
      identity: 'did:plc:host123',
    });
    const { POST } = await import('@/app/api/spaces/route');
    const req = new NextRequest('http://localhost/api/spaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ startNow: true, title: 'Second show' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(mockFindDefaultHostedSpace).not.toHaveBeenCalled();
    expect(mockCreateSpace).toHaveBeenCalledWith(expect.objectContaining({ title: 'Second show' }));
    expect((await res.json()).reopened).toBe(false);
  });

  it('startNow with spaceId reopens that show for its host and 404s for anyone else', async () => {
    mockGetCurrentUser.mockResolvedValue({ did: 'did:plc:host123', handle: 'alice.bsky.social' });
    mockResolveSpaceForUser.mockResolvedValueOnce({ space: makeSpaceRow({ id: 'sp2' }), isHost: true });
    mockReopenSpace.mockResolvedValueOnce(makeSpaceRow({ id: 'sp2', status: 'active' }));
    mockCreateHostToken.mockResolvedValue({
      token: 't',
      wsUrl: 'ws://livekit:7880',
      roomName: 'space-sp2',
      identity: 'did:plc:host123',
    });
    const { POST } = await import('@/app/api/spaces/route');
    const make = () =>
      new NextRequest('http://localhost/api/spaces', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ startNow: true, spaceId: 'sp2' }),
      });
    const ok = await POST(make());
    expect(ok.status).toBe(201);
    expect(mockResolveSpaceForUser).toHaveBeenCalledWith('sp2', 'did:plc:host123');
    expect(mockReopenSpace).toHaveBeenCalledWith('sp2');

    mockResolveSpaceForUser.mockResolvedValueOnce({ space: makeSpaceRow({ id: 'sp2' }), isHost: false });
    const denied = await POST(make());
    expect(denied.status).toBe(404);
    expect(mockReopenSpace).toHaveBeenCalledTimes(1);
    expect(mockCreateSpace).not.toHaveBeenCalled();
  });

  it('a title is still required when not starting now', async () => {
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
    expect(mockCreateSpace).not.toHaveBeenCalled();
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
