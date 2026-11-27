// tests/api/reactions.test.ts
//
// Exercises POST /api/spaces/[id]/reactions with mocked session and spaces.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSpace } from '../helpers/factories';
import { jsonRequest } from '../helpers/request';

// `POST` is imported statically below, so its dependency chain (and the
// vi.mock factories for '@/lib/session' and '@/lib/db') resolves before any
// other top-level code in this file runs. That rules out tests/helpers/mocks:
// its builders are plain imports, and a vi.mock factory can only reference
// vi.hoisted() output at that point (see tests/api/join.test.ts for a file
// where the route import is dynamic and the builders apply cleanly).
const {
  mockGetCurrentUser,
  mockGetSpaceById,
  mockGetSpaceBySlug,
  mockBufferReaction,
  mockBroadcast,
  mockFindUser,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockGetSpaceById: vi.fn(),
  mockGetSpaceBySlug: vi.fn(),
  mockBufferReaction: vi.fn(async () => 1),
  mockBroadcast: vi.fn(async () => true),
  mockFindUser: vi.fn<() => Promise<{ handle: string; displayName: string | null; avatarUrl: string | null } | null>>(async () => null),
}));

vi.mock('@/lib/reaction-buffer', () => ({
  bufferReaction: mockBufferReaction,
}));

vi.mock('@/lib/livekit', () => ({
  broadcastRoomData: mockBroadcast,
  roomNameForSpace: (id: string) => `space-${id}`,
}));

vi.mock('@/lib/db', () => ({
  prisma: { user: { findUnique: mockFindUser } },
}));

vi.mock('@/lib/session', () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock('@/lib/spaces', () => ({
  getSpaceById: mockGetSpaceById,
  getSpaceBySlug: mockGetSpaceBySlug,
  resolveSpace: async (id: string) => (await mockGetSpaceById(id)) ?? (await mockGetSpaceBySlug(id)),
}));

import { POST } from '@/app/api/spaces/[id]/reactions/route';

const USER = { did: 'did:plc:user1', handle: 'alice.bsky.social' };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(USER);
  mockGetSpaceById.mockResolvedValue(makeSpace());
  mockBufferReaction.mockResolvedValue(1);
});

async function post(id = 'sp1', body?: unknown): Promise<Response> {
  return POST(jsonRequest('POST', 'http://localhost/api/spaces/' + id + '/reactions', body), {
    params: Promise.resolve({ id }),
  });
}

describe('POST /api/spaces/[id]/reactions', () => {
  it('requires an authenticated session', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await post();
    expect(res.status).toBe(401);
    expect(mockBufferReaction).not.toHaveBeenCalled();
  });

  it('returns 404 when the space does not exist', async () => {
    mockGetSpaceById.mockResolvedValue(null);
    mockGetSpaceBySlug.mockResolvedValue(null);
    const res = await post();
    expect(res.status).toBe(404);
  });

  it('buffers the reaction and returns the running count', async () => {
    mockBufferReaction.mockResolvedValue(7);
    const res = await post();
    expect(res.status).toBe(200);
    expect(mockBufferReaction).toHaveBeenCalledWith({ spaceId: 'sp1', did: USER.did, kind: '❤️' });
    await expect(res.json()).resolves.toEqual({ reactionCount: 7 });
  });

  it('falls back to slug lookup when id does not match', async () => {
    mockGetSpaceById.mockResolvedValue(null);
    mockGetSpaceBySlug.mockResolvedValue(makeSpace({ id: 'sp-slug' }));
    mockBufferReaction.mockResolvedValue(1);
    await post('some-slug');
    expect(mockGetSpaceBySlug).toHaveBeenCalledWith('some-slug');
    expect(mockBufferReaction).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 'sp-slug' })
    );
  });

  it('records the chosen emoji and broadcasts it with the sender profile', async () => {
    mockFindUser.mockResolvedValueOnce({
      handle: 'alice.bsky.social',
      displayName: 'Alice',
      avatarUrl: 'https://cdn/alice.jpg',
    });
    const res = await post('sp1', { emoji: '🎉' });
    expect(res.status).toBe(200);
    expect(mockBufferReaction).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 'sp1', did: USER.did, kind: '🎉' })
    );
    expect(mockBroadcast).toHaveBeenCalledWith('space-sp1', {
      type: 'reaction',
      spaceId: 'sp1',
      emoji: '🎉',
      did: USER.did,
      handle: 'alice.bsky.social',
      displayName: 'Alice',
      avatarUrl: 'https://cdn/alice.jpg',
    });
  });

  it('falls back to a heart for unknown emoji and an empty body', async () => {
    await post('sp1', { emoji: '🐍' });
    expect(mockBroadcast).toHaveBeenLastCalledWith('space-sp1', expect.objectContaining({ emoji: '❤️' }));
    await post('sp1');
    expect(mockBroadcast).toHaveBeenLastCalledWith('space-sp1', expect.objectContaining({ emoji: '❤️' }));
  });
});
