// tests/api/like.test.ts
//
// GET / POST / DELETE /api/spaces/[id]/like with mocked session, spaces and
// metrics modules.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetCurrentUser,
  mockGetSpaceById,
  mockGetSpaceBySlug,
  mockLikeShow,
  mockUnlikeShow,
  mockHasLiked,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockGetSpaceById: vi.fn(),
  mockGetSpaceBySlug: vi.fn(),
  mockLikeShow: vi.fn(),
  mockUnlikeShow: vi.fn(),
  mockHasLiked: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getCurrentUser: mockGetCurrentUser }));
vi.mock('@/lib/spaces', () => ({
  getSpaceById: mockGetSpaceById,
  getSpaceBySlug: mockGetSpaceBySlug,
  resolveSpace: async (id: string) => (await mockGetSpaceById(id)) ?? (await mockGetSpaceBySlug(id)),
}));
vi.mock('@/lib/metrics', () => ({
  likeShow: mockLikeShow,
  unlikeShow: mockUnlikeShow,
  hasLiked: mockHasLiked,
}));
vi.mock('@/lib/db', () => ({ prisma: {} }));

const space = { id: 'sp1', slug: 'my-show-abc', hostId: 'did:plc:host', likeCount: 3, tags: [] };
const params = { params: Promise.resolve({ id: 'sp1' }) };
const req = (method: string) => new NextRequest('http://localhost/api/spaces/sp1/like', { method });

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSpaceById.mockResolvedValue(space);
  mockGetSpaceBySlug.mockResolvedValue(null);
});

describe('/api/spaces/[id]/like', () => {
  it('GET reports the count and liked=false for signed-out callers', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/spaces/[id]/like/route');
    const res = await GET(req('GET'), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ likeCount: 3, liked: false });
    expect(mockHasLiked).not.toHaveBeenCalled();
  });

  it('GET reports liked for a signed-in user who liked', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({ did: 'did:plc:bob', handle: 'bob' });
    mockHasLiked.mockResolvedValueOnce(true);
    const { GET } = await import('@/app/api/spaces/[id]/like/route');
    const res = await GET(req('GET'), params);
    expect(await res.json()).toEqual({ likeCount: 3, liked: true });
    expect(mockHasLiked).toHaveBeenCalledWith('sp1', 'did:plc:bob');
  });

  it('GET resolves slugs and 404s unknown shows', async () => {
    mockGetSpaceById.mockResolvedValueOnce(null);
    mockGetSpaceBySlug.mockResolvedValueOnce(space);
    mockGetCurrentUser.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/spaces/[id]/like/route');
    const ok = await GET(req('GET'), { params: Promise.resolve({ id: 'my-show-abc' }) });
    expect(ok.status).toBe(200);

    mockGetSpaceById.mockResolvedValueOnce(null);
    const missing = await GET(req('GET'), { params: Promise.resolve({ id: 'nope' }) });
    expect(missing.status).toBe(404);
  });

  it('POST requires a session', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/spaces/[id]/like/route');
    const res = await POST(req('POST'), params);
    expect(res.status).toBe(401);
    expect(mockLikeShow).not.toHaveBeenCalled();
  });

  it('POST likes on behalf of the signed-in user', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({ did: 'did:plc:bob', handle: 'bob' });
    mockLikeShow.mockResolvedValueOnce({ liked: true, likeCount: 4 });
    const { POST } = await import('@/app/api/spaces/[id]/like/route');
    const res = await POST(req('POST'), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ liked: true, likeCount: 4 });
    expect(mockLikeShow).toHaveBeenCalledWith({ spaceId: 'sp1', did: 'did:plc:bob' });
  });

  it('DELETE removes the like', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({ did: 'did:plc:bob', handle: 'bob' });
    mockUnlikeShow.mockResolvedValueOnce({ liked: false, likeCount: 2 });
    const { DELETE } = await import('@/app/api/spaces/[id]/like/route');
    const res = await DELETE(req('DELETE'), params);
    expect(await res.json()).toEqual({ liked: false, likeCount: 2 });
    expect(mockUnlikeShow).toHaveBeenCalledWith({ spaceId: 'sp1', did: 'did:plc:bob' });
  });

  it('returns 500 when the write fails', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({ did: 'did:plc:bob', handle: 'bob' });
    mockLikeShow.mockRejectedValueOnce(new Error('db down'));
    const { POST } = await import('@/app/api/spaces/[id]/like/route');
    const res = await POST(req('POST'), params);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('like_failed');
  });
});
