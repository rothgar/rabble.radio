// tests/api/reactions.test.ts
//
// Exercises POST /api/spaces/[id]/reactions with mocked session and spaces.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetCurrentUser,
  mockGetSpaceById,
  mockGetSpaceBySlug,
  mockIncrementSpaceReactions,
  mockRecordReaction,
  mockBroadcast,
  mockFindUser,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockGetSpaceById: vi.fn(),
  mockGetSpaceBySlug: vi.fn(),
  mockIncrementSpaceReactions: vi.fn(),
  mockRecordReaction: vi.fn(async () => undefined),
  mockBroadcast: vi.fn(async () => true),
  mockFindUser: vi.fn<() => Promise<{ handle: string; displayName: string | null; avatarUrl: string | null } | null>>(async () => null),
}));

vi.mock('@/lib/metrics', () => ({
  startShowSession: vi.fn(async () => undefined),
  endShowSession: vi.fn(async () => undefined),
  recordJoin: vi.fn(async () => undefined),
  recordLeave: vi.fn(async () => undefined),
  recordStageChange: vi.fn(async () => undefined),
  recordReaction: mockRecordReaction,
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
  incrementSpaceReactions: mockIncrementSpaceReactions,
}));

import { POST } from '@/app/api/spaces/[id]/reactions/route';

const USER = { did: 'did:plc:user1', handle: 'alice.bsky.social' };

function makeSpace(overrides: Record<string, unknown> = {}) {
  return { id: 'sp1', hostId: 'did:plc:host123', ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(USER);
  mockGetSpaceById.mockResolvedValue(makeSpace());
});

async function post(id = 'sp1', body?: unknown): Promise<Response> {
  return POST(
    new NextRequest('http://localhost/api/spaces/' + id + '/reactions', {
      method: 'POST',
      ...(body !== undefined
        ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
        : {}),
    }),
    { params: Promise.resolve({ id }) }
  );
}

describe('POST /api/spaces/[id]/reactions', () => {
  it('requires an authenticated session', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await post();
    expect(res.status).toBe(401);
    expect(mockIncrementSpaceReactions).not.toHaveBeenCalled();
  });

  it('returns 404 when the space does not exist', async () => {
    mockGetSpaceById.mockResolvedValue(null);
    mockGetSpaceBySlug.mockResolvedValue(null);
    const res = await post();
    expect(res.status).toBe(404);
  });

  it('increments reactions and returns the new count', async () => {
    mockIncrementSpaceReactions.mockResolvedValue(7);
    const res = await post();
    expect(res.status).toBe(200);
    expect(mockIncrementSpaceReactions).toHaveBeenCalledWith('sp1');
    await expect(res.json()).resolves.toEqual({ reactionCount: 7 });
  });

  it('falls back to slug lookup when id does not match', async () => {
    mockGetSpaceById.mockResolvedValue(null);
    mockGetSpaceBySlug.mockResolvedValue(makeSpace({ id: 'sp-slug' }));
    mockIncrementSpaceReactions.mockResolvedValue(1);
    await post('some-slug');
    expect(mockGetSpaceBySlug).toHaveBeenCalledWith('some-slug');
    expect(mockIncrementSpaceReactions).toHaveBeenCalledWith('sp-slug');
  });

  it('returns 500 when recording the reaction fails', async () => {
    mockIncrementSpaceReactions.mockResolvedValue(null);
    const res = await post();
    expect(res.status).toBe(500);
  });

  it('records the chosen emoji and broadcasts it with the sender profile', async () => {
    mockIncrementSpaceReactions.mockResolvedValue(1);
    mockFindUser.mockResolvedValueOnce({
      handle: 'alice.bsky.social',
      displayName: 'Alice',
      avatarUrl: 'https://cdn/alice.jpg',
    });
    const res = await post('sp1', { emoji: '🎉' });
    expect(res.status).toBe(200);
    expect(mockRecordReaction).toHaveBeenCalledWith(
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
    mockIncrementSpaceReactions.mockResolvedValue(1);
    await post('sp1', { emoji: '🐍' });
    expect(mockBroadcast).toHaveBeenLastCalledWith('space-sp1', expect.objectContaining({ emoji: '❤️' }));
    await post('sp1');
    expect(mockBroadcast).toHaveBeenLastCalledWith('space-sp1', expect.objectContaining({ emoji: '❤️' }));
  });
});
