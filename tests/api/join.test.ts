// tests/api/join.test.ts
//
// Exercises POST /api/spaces/[id]/join with mocked session, spaces, and
// livekit modules.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSpace } from '../helpers/factories';
import { jsonRequest } from '../helpers/request';
import { mockSession, prismaStub } from '../helpers/mocks';

// The route is imported dynamically inside each test below, so these
// vi.mock factories run lazily at test time and can call the
// tests/helpers/mocks builders directly.
const mockGetCurrentUser = mockSession();
const prisma = prismaStub({ user: ['findUnique'] });

const {
  mockGetSpaceById,
  mockGetSpaceBySlug,
  mockCreateRoom,
  mockGenerateToken,
  mockGetLiveKitClient,
  mockGetIceServers,
  mockIsBlocked,
} = vi.hoisted(() => ({
  mockGetSpaceById: vi.fn(),
  mockGetSpaceBySlug: vi.fn(),
  mockCreateRoom: vi.fn(),
  mockGenerateToken: vi.fn(),
  mockGetLiveKitClient: vi.fn(),
  mockGetIceServers: vi.fn(),
  mockIsBlocked: vi.fn(async () => false),
}));

vi.mock('@/lib/stage', () => ({
  isBlocked: mockIsBlocked,
}));

vi.mock('@/lib/metrics', () => ({
  startShowSession: vi.fn(async () => undefined),
  endShowSession: vi.fn(async () => undefined),
  recordJoin: vi.fn(async () => undefined),
  recordLeave: vi.fn(async () => undefined),
  recordStageChange: vi.fn(async () => undefined),
}));

vi.mock('@/lib/turn', () => ({
  getIceServers: mockGetIceServers,
}));

vi.mock('@/lib/session', () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock('@/lib/db', () => ({ prisma }));

vi.mock('@/lib/spaces', () => ({
  getSpaceById: mockGetSpaceById,
  getSpaceBySlug: mockGetSpaceBySlug,
  resolveSpace: async (id: string) => (await mockGetSpaceById(id)) ?? (await mockGetSpaceBySlug(id)),
}));

vi.mock('@/lib/livekit', () => ({
  createRoom: mockCreateRoom,
  generateToken: mockGenerateToken,
  getLiveKitClient: mockGetLiveKitClient,
  roomNameForSpace: (id: string) => `space-${id}`,
  LiveKitConfigError: class LiveKitConfigError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'LiveKitConfigError';
    }
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateRoom.mockResolvedValue(undefined);
  mockGetLiveKitClient.mockReturnValue({});
  mockGenerateToken.mockResolvedValue({
    token: 'jwt.token.here',
    wsUrl: 'ws://livekit:7880',
  });
  prisma.user.findUnique.mockResolvedValue({
    displayName: 'Alice',
    avatarUrl: 'https://cdn.example/avatar.png',
  });
  mockGetIceServers.mockResolvedValue(null);
});

describe('POST /api/spaces/[id]/join', () => {
  it('refuses a signed-in listener the host blocked from the show', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({ did: 'did:plc:blocked', handle: 'blocked.test' });
    mockGetSpaceById.mockResolvedValueOnce(makeSpace());
    mockIsBlocked.mockResolvedValueOnce(true);
    const { POST } = await import('@/app/api/spaces/[id]/join/route');
    const res = await POST(jsonRequest('POST', 'http://localhost/api/spaces/sp1/join'), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('blocked');
    expect(mockIsBlocked).toHaveBeenCalledWith('sp1', 'did:plc:blocked');
    expect(mockGenerateToken).not.toHaveBeenCalled();
  });

  it('omits iceServers when no TURN relay is configured', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null);
    mockGetSpaceById.mockResolvedValueOnce(makeSpace());
    const { POST } = await import('@/app/api/spaces/[id]/join/route');
    const res = await POST(jsonRequest('POST', 'http://localhost/api/spaces/sp1/join'), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect('iceServers' in body).toBe(false);
    expect(mockGetIceServers).toHaveBeenCalledTimes(1);
  });

  it('returns per-join TURN credentials when the relay is configured', async () => {
    const iceServers = [
      { urls: ['stun:stun.cloudflare.com:3478'] },
      {
        urls: ['turns:turn.cloudflare.com:443?transport=tcp'],
        username: 'u',
        credential: 'p',
      },
    ];
    mockGetIceServers.mockResolvedValueOnce(iceServers);
    mockGetCurrentUser.mockResolvedValueOnce(null);
    mockGetSpaceById.mockResolvedValueOnce(makeSpace());
    const { POST } = await import('@/app/api/spaces/[id]/join/route');
    const res = await POST(jsonRequest('POST', 'http://localhost/api/spaces/sp1/join'), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.iceServers).toEqual(iceServers);
    expect(body.token).toBe('jwt.token.here');
  });

  it('still joins when the TURN credential request fails', async () => {
    mockGetIceServers.mockRejectedValueOnce(new Error('cloudflare down'));
    mockGetCurrentUser.mockResolvedValueOnce(null);
    mockGetSpaceById.mockResolvedValueOnce(makeSpace());
    const { POST } = await import('@/app/api/spaces/[id]/join/route');
    const res = await POST(jsonRequest('POST', 'http://localhost/api/spaces/sp1/join'), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe('jwt.token.here');
    expect('iceServers' in body).toBe(false);
  });

  it('issues an anonymous listen-only token without a session', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null);
    mockGetSpaceById.mockResolvedValueOnce(makeSpace());
    const { POST } = await import('@/app/api/spaces/[id]/join/route');
    const req = jsonRequest('POST', 'http://localhost/api/spaces/sp1/join');
    const res = await POST(req, {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.anonymous).toBe(true);
    expect(body.role).toBe('audience');
    expect(body.identity).toMatch(/^anon:/);
    expect(body.handle).toBe('');
    expect(body.displayName).toBeNull();
    expect(mockCreateRoom).toHaveBeenCalledWith('sp1');
    expect(mockGenerateToken).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'audience',
        name: 'Listener',
        identity: expect.stringMatching(/^anon:/),
      })
    );
    // No profile lookup for anonymous listeners.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('never grants host to an anonymous caller even if the host DID were guessable', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null);
    mockGetSpaceById.mockResolvedValueOnce(makeSpace({ hostId: 'anon:spoof' }));
    const { POST } = await import('@/app/api/spaces/[id]/join/route');
    const res = await POST(jsonRequest('POST', 'http://localhost/api/spaces/sp1/join'), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    const body = await res.json();
    expect(body.role).toBe('audience');
    expect(body.anonymous).toBe(true);
  });

  it('returns 404 when the space does not exist', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    mockGetSpaceById.mockResolvedValueOnce(null);
    mockGetSpaceBySlug.mockResolvedValueOnce(null);

    const { POST } = await import('@/app/api/spaces/[id]/join/route');
    const req = jsonRequest('POST', 'http://localhost/api/spaces/missing/join');
    const res = await POST(req, {
      params: Promise.resolve({ id: 'missing' }),
    });
    expect(res.status).toBe(404);
    expect(mockCreateRoom).not.toHaveBeenCalled();
  });

  it('issues a host token when the session DID matches the hostId', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    mockGetSpaceById.mockResolvedValueOnce(makeSpace());

    const { POST } = await import('@/app/api/spaces/[id]/join/route');
    const req = jsonRequest('POST', 'http://localhost/api/spaces/sp1/join');
    const res = await POST(req, {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      token: 'jwt.token.here',
      wsUrl: 'ws://livekit:7880',
      role: 'host',
      roomName: 'space-sp1',
      identity: 'did:plc:host123',
      handle: 'alice.bsky.social',
      displayName: 'Alice',
      avatarUrl: 'https://cdn.example/avatar.png',
    });
    expect(mockCreateRoom).toHaveBeenCalledWith('sp1');
    expect(mockGenerateToken).toHaveBeenCalledWith({
      room: 'space-sp1',
      identity: 'did:plc:host123',
      role: 'host',
      name: 'alice.bsky.social',
      canSubscribe: true,
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { did: 'did:plc:host123' },
      select: { displayName: true, avatarUrl: true },
    });
  });

  it('issues an audience token for non-host users', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:listener',
      handle: 'bob.bsky.social',
    });
    mockGetSpaceById.mockResolvedValueOnce(makeSpace());

    const { POST } = await import('@/app/api/spaces/[id]/join/route');
    const req = jsonRequest('POST', 'http://localhost/api/spaces/sp1/join');
    const res = await POST(req, {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('audience');
    expect(body.identity).toBe('did:plc:listener');
    expect(body.handle).toBe('bob.bsky.social');
    // The fixture space is off air, so the listener may not subscribe yet.
    expect(mockGenerateToken).toHaveBeenCalledWith({
      room: 'space-sp1',
      identity: 'did:plc:listener',
      role: 'audience',
      name: 'bob.bsky.social',
      canSubscribe: false,
    });
    expect(body.onAir).toBe(false);
  });

  it('lets the audience subscribe once the show is on air', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:listener',
      handle: 'bob.bsky.social',
    });
    mockGetSpaceById.mockResolvedValueOnce(makeSpace({ isLive: true, status: 'live' }));

    const { POST } = await import('@/app/api/spaces/[id]/join/route');
    const res = await POST(jsonRequest('POST', 'http://localhost/api/spaces/sp1/join'), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.onAir).toBe(true);
    expect(mockGenerateToken).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'audience', canSubscribe: true })
    );
  });

  it('falls back to slug lookup when id does not match', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    mockGetSpaceById.mockResolvedValueOnce(null);
    mockGetSpaceBySlug.mockResolvedValueOnce(makeSpace());

    const { POST } = await import('@/app/api/spaces/[id]/join/route');
    const req = jsonRequest('POST', 'http://localhost/api/spaces/my-room-abc12345/join');
    const res = await POST(req, {
      params: Promise.resolve({ id: 'my-room-abc12345' }),
    });
    expect(res.status).toBe(200);
    expect(mockGetSpaceBySlug).toHaveBeenCalledWith('my-room-abc12345');
  });

  it('returns 503 when createRoom throws', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    mockGetSpaceById.mockResolvedValueOnce(makeSpace());
    mockCreateRoom.mockRejectedValueOnce(new Error('connection refused'));

    const { POST } = await import('@/app/api/spaces/[id]/join/route');
    const req = jsonRequest('POST', 'http://localhost/api/spaces/sp1/join');
    const res = await POST(req, {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('livekit_unavailable');
    expect(mockGenerateToken).not.toHaveBeenCalled();
  });
});
