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
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockGetSpaceById: vi.fn(),
  mockGetSpaceBySlug: vi.fn(),
  mockIncrementSpaceReactions: vi.fn(),
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

async function post(id = 'sp1'): Promise<Response> {
  return POST(
    new NextRequest('http://localhost/api/spaces/' + id + '/reactions', {
      method: 'POST',
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
});
