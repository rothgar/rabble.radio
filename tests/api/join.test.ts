// tests/api/join.test.ts
//
// Exercises POST /api/spaces/[id]/join with mocked session, spaces, and
// livekit modules.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetCurrentUser,
  mockGetSpaceById,
  mockGetSpaceBySlug,
  mockCreateRoom,
  mockGenerateToken,
  mockGetLiveKitClient,
  mockFindUserByDid,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockGetSpaceById: vi.fn(),
  mockGetSpaceBySlug: vi.fn(),
  mockCreateRoom: vi.fn(),
  mockGenerateToken: vi.fn(),
  mockGetLiveKitClient: vi.fn(),
  mockFindUserByDid: vi.fn(),
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

vi.mock('@/lib/spaces', () => ({
  getSpaceById: mockGetSpaceById,
  getSpaceBySlug: mockGetSpaceBySlug,
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
  mockCreateRoom.mockResolvedValue(undefined);
  mockGetLiveKitClient.mockReturnValue({});
  mockGenerateToken.mockResolvedValue({
    token: 'jwt.token.here',
    wsUrl: 'ws://livekit:7880',
  });
  mockFindUserByDid.mockResolvedValue({
    displayName: 'Alice',
    avatarUrl: 'https://cdn.example/avatar.png',
  });
});

describe('POST /api/spaces/[id]/join', () => {
  it('requires authentication', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/spaces/[id]/join/route');
    const req = new NextRequest('http://localhost/api/spaces/sp1/join', {
      method: 'POST',
    });
    const res = await POST(req, {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(401);
    expect(mockCreateRoom).not.toHaveBeenCalled();
    expect(mockGenerateToken).not.toHaveBeenCalled();
  });

  it('returns 404 when the space does not exist', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    mockGetSpaceById.mockResolvedValueOnce(null);
    mockGetSpaceBySlug.mockResolvedValueOnce(null);

    const { POST } = await import('@/app/api/spaces/[id]/join/route');
    const req = new NextRequest('http://localhost/api/spaces/missing/join', {
      method: 'POST',
    });
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
    const req = new NextRequest('http://localhost/api/spaces/sp1/join', {
      method: 'POST',
    });
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
    });
    expect(mockFindUserByDid).toHaveBeenCalledWith({
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
    const req = new NextRequest('http://localhost/api/spaces/sp1/join', {
      method: 'POST',
    });
    const res = await POST(req, {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('audience');
    expect(body.identity).toBe('did:plc:listener');
    expect(body.handle).toBe('bob.bsky.social');
    expect(mockGenerateToken).toHaveBeenCalledWith({
      room: 'space-sp1',
      identity: 'did:plc:listener',
      role: 'audience',
      name: 'bob.bsky.social',
    });
  });

  it('falls back to slug lookup when id does not match', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    mockGetSpaceById.mockResolvedValueOnce(null);
    mockGetSpaceBySlug.mockResolvedValueOnce(makeSpace());

    const { POST } = await import('@/app/api/spaces/[id]/join/route');
    const req = new NextRequest(
      'http://localhost/api/spaces/my-room-abc12345/join',
      { method: 'POST' }
    );
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
    const req = new NextRequest('http://localhost/api/spaces/sp1/join', {
      method: 'POST',
    });
    const res = await POST(req, {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('livekit_unavailable');
    expect(mockGenerateToken).not.toHaveBeenCalled();
  });
});
