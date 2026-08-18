// tests/api/posts.test.ts
//
// Exercises POST and GET /api/spaces/[id]/posts. Mocks Prisma access via
// the spaces/posts/session/bsky modules.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetCurrentUser,
  mockGetSpaceById,
  mockGetSpaceBySlug,
  mockResolveSpaceForUser,
  mockResolvePostUrl,
  mockFetchPostView,
  mockCreateSpacePost,
  mockListSpacePosts,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockGetSpaceById: vi.fn(),
  mockGetSpaceBySlug: vi.fn(),
  mockResolveSpaceForUser: vi.fn(),
  mockResolvePostUrl: vi.fn(),
  mockFetchPostView: vi.fn(),
  mockCreateSpacePost: vi.fn(),
  mockListSpacePosts: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock('@/lib/spaces', () => ({
  getSpaceById: mockGetSpaceById,
  getSpaceBySlug: mockGetSpaceBySlug,
  resolveSpaceForUser: mockResolveSpaceForUser,
}));

vi.mock('@/lib/bsky', () => ({
  resolvePostUrl: mockResolvePostUrl,
  fetchPostView: mockFetchPostView,
}));

vi.mock('@/lib/posts', () => ({
  createSpacePost: mockCreateSpacePost,
  listSpacePosts: mockListSpacePosts,
}));

function makeSpace(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sp1',
    slug: 'room',
    title: 'Room',
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
  // resetAllMocks clears both call history AND queued implementations so
  // leftover mockResolvedValueOnce values from earlier tests do not leak.
  vi.resetAllMocks();
});

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/spaces/sp1/posts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/spaces/[id]/posts', () => {
  it('requires auth', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/spaces/[id]/posts/route');
    const res = await POST(makeRequest({ postUrl: 'https://bsky.app/x' }), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 when audience tries to share', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:listener',
      handle: 'bob.bsky.social',
    });
    mockResolveSpaceForUser.mockResolvedValueOnce({
      space: makeSpace(),
      isHost: false,
    });
    const { POST } = await import('@/app/api/spaces/[id]/posts/route');
    const res = await POST(makeRequest({ postUrl: 'https://bsky.app/x' }), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(403);
    expect(mockCreateSpacePost).not.toHaveBeenCalled();
  });

  it('rejects invalid URL', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    mockResolveSpaceForUser.mockResolvedValueOnce({
      space: makeSpace(),
      isHost: true,
    });
    mockResolvePostUrl.mockImplementationOnce(() => {
      throw new Error('Could not find a profile segment');
    });
    const { POST } = await import('@/app/api/spaces/[id]/posts/route');
    const res = await POST(
      makeRequest({ postUrl: 'https://example.com/no-profile' }),
      { params: Promise.resolve({ id: 'sp1' }) }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_url');
  });

  it('rejects missing postUrl', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    mockResolveSpaceForUser.mockResolvedValueOnce({
      space: makeSpace(),
      isHost: true,
    });
    const { POST } = await import('@/app/api/spaces/[id]/posts/route');
    const res = await POST(makeRequest({}), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(400);
    expect(mockResolvePostUrl).not.toHaveBeenCalled();
  });

  it('returns 502 when AppView fails', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    mockResolveSpaceForUser.mockResolvedValueOnce({
      space: makeSpace(),
      isHost: true,
    });
    mockResolvePostUrl.mockReturnValueOnce({
      atUri: 'at://did:plc:abc/app.bsky.feed.post/abc',
      handle: 'did:plc:abc',
      postId: 'abc',
    });
    mockFetchPostView.mockRejectedValueOnce(new Error('appview 500'));
    const { POST } = await import('@/app/api/spaces/[id]/posts/route');
    const res = await POST(
      makeRequest({ postUrl: 'https://bsky.app/profile/foo/post/abc' }),
      { params: Promise.resolve({ id: 'sp1' }) }
    );
    expect(res.status).toBe(502);
    expect(mockCreateSpacePost).not.toHaveBeenCalled();
  });

  it('stores the post and returns 201 for host', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    mockResolveSpaceForUser.mockResolvedValueOnce({
      space: makeSpace(),
      isHost: true,
    });
    mockResolvePostUrl.mockReturnValueOnce({
      atUri: 'at://did:plc:abc/app.bsky.feed.post/abc',
      handle: 'did:plc:abc',
      postId: 'abc',
    });
    mockFetchPostView.mockResolvedValueOnce({
      uri: 'at://did:plc:abc/app.bsky.feed.post/abc',
      cid: 'cid123',
      indexedAt: '2025-02-01T00:00:00.000Z',
      author: { did: 'did:plc:abc', handle: 'carol.bsky.social' },
      record: { text: 'hello', createdAt: '2025-02-01T00:00:00Z' },
      embed: { $type: 'app.bsky.embed.external' },
    });
    mockCreateSpacePost.mockResolvedValueOnce({
      id: 'sppost1',
      spaceId: 'sp1',
      atUri: 'at://did:plc:abc/app.bsky.feed.post/abc',
      cid: 'cid123',
      indexedAt: '2025-02-01T00:00:00.000Z',
      authorDid: 'did:plc:abc',
      embed: { $type: 'app.bsky.embed.external' },
      view: {
        uri: 'at://did:plc:abc/app.bsky.feed.post/abc',
        cid: 'cid123',
        record: { text: 'hello' },
        author: { did: 'did:plc:abc', handle: 'carol.bsky.social' },
      },
      createdAt: '2025-02-01T00:00:01.000Z',
    });

    const { POST } = await import('@/app/api/spaces/[id]/posts/route');
    const res = await POST(
      makeRequest({ postUrl: 'https://bsky.app/profile/carol.bsky.social/post/abc' }),
      { params: Promise.resolve({ id: 'sp1' }) }
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.post.id).toBe('sppost1');
    expect(mockCreateSpacePost).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: 'sp1',
        atUri: 'at://did:plc:abc/app.bsky.feed.post/abc',
        cid: 'cid123',
        authorDid: 'did:plc:abc',
      }),
      expect.objectContaining({ cid: 'cid123' })
    );
  });
});

describe('GET /api/spaces/[id]/posts', () => {
  it('returns the list of posts', async () => {
    mockGetSpaceById.mockResolvedValueOnce(makeSpace());
    mockGetSpaceBySlug.mockResolvedValueOnce(null);
    mockListSpacePosts.mockResolvedValueOnce([
      {
        id: 'sppost1',
        spaceId: 'sp1',
        atUri: 'at://did:plc:abc/app.bsky.feed.post/abc',
        cid: 'cid',
        indexedAt: '2025-02-01T00:00:00.000Z',
        authorDid: 'did:plc:abc',
        embed: null,
        view: {
          uri: 'at://did:plc:abc/app.bsky.feed.post/abc',
          cid: 'cid',
          record: { text: 'hi' },
        },
        createdAt: '2025-02-01T00:00:01.000Z',
      },
    ]);

    const { GET } = await import('@/app/api/spaces/[id]/posts/route');
    const res = await GET(new NextRequest('http://localhost/api/spaces/sp1/posts'), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.posts).toHaveLength(1);
    expect(body.posts[0].id).toBe('sppost1');
  });

  it('returns 404 when space missing', async () => {
    mockGetSpaceById.mockResolvedValueOnce(null);
    mockGetSpaceBySlug.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/spaces/[id]/posts/route');
    const res = await GET(new NextRequest('http://localhost/api/spaces/missing/posts'), {
      params: Promise.resolve({ id: 'missing' }),
    });
    expect(res.status).toBe(404);
  });
});
