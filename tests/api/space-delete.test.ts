// tests/api/space-delete.test.ts
//
// Exercises DELETE /api/spaces/[id]. Mocks the session/spaces/atproto/db
// modules so we can drive auth, host role, live-state cleanup, and the
// final prisma.space.delete call. Recording/S3 cleanup is intentionally
// out of scope here (handled by a separate job).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetCurrentUser,
  mockResolveSpaceForUser,
  mockSetSpaceLive,
  mockDeleteLiveStatus,
  mockPrismaSpaceDelete,
  mockLogger,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockResolveSpaceForUser: vi.fn(),
  mockSetSpaceLive: vi.fn(),
  mockDeleteLiveStatus: vi.fn(),
  mockPrismaSpaceDelete: vi.fn(),
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  },
}));

vi.mock('@/lib/session', () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock('@/lib/spaces', () => ({
  resolveSpaceForUser: mockResolveSpaceForUser,
  setSpaceLive: mockSetSpaceLive,
  toPublicSpace: vi.fn((s: unknown) => s),
}));

vi.mock('@/lib/atproto', () => ({
  deleteLiveStatus: mockDeleteLiveStatus,
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    space: {
      delete: mockPrismaSpaceDelete,
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: mockLogger,
}));

function makeSpace(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sp1',
    slug: 'my-room-abc12345',
    title: 'My room',
    description: null,
    hostId: 'did:plc:host123',
    isLive: false,
    status: 'active',
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

const HOST = {
  did: 'did:plc:host123',
  handle: 'alice.bsky.social',
};

beforeEach(() => {
  // resetAllMocks clears both call history AND queued implementations so
  // leftover mockResolvedValueOnce values from earlier tests do not leak.
  vi.resetAllMocks();
  // Space deletion always succeeds unless a test wants to simulate failure.
  mockPrismaSpaceDelete.mockResolvedValue({ id: 'sp1' });
  // External cleanup helpers succeed by default.
  mockSetSpaceLive.mockResolvedValue(undefined);
  mockDeleteLiveStatus.mockResolvedValue({ ok: true });
});

function makeRequest(id: string) {
  return new NextRequest(`http://localhost/api/spaces/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Return the global invocation index of the first call to a vi.fn(), or -1
 * if the mock was never called. Vitest shares a global counter across all
 * mocks (jest-compatible `invocationCallOrder`), so a single index is
 * enough to compare two mocks' call ordering.
 */
type MockFn = { mock: { invocationCallOrder: number[] } };
function callIndex(mockFn: MockFn): number {
  return mockFn.mock.invocationCallOrder[0] ?? -1;
}

describe('DELETE /api/spaces/[id]', () => {
  it('returns 401 when no user is signed in', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null);
    const { DELETE } = await import('@/app/api/spaces/[id]/route');
    const res = await DELETE(makeRequest('sp1'), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('unauthorized');
    expect(mockPrismaSpaceDelete).not.toHaveBeenCalled();
    expect(mockResolveSpaceForUser).not.toHaveBeenCalled();
  });

  it('returns 404 when id route param is empty', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(HOST);
    const { DELETE } = await import('@/app/api/spaces/[id]/route');
    const res = await DELETE(makeRequest(''), {
      params: Promise.resolve({ id: '' }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('not_found');
    expect(mockResolveSpaceForUser).not.toHaveBeenCalled();
    expect(mockPrismaSpaceDelete).not.toHaveBeenCalled();
  });

  it('returns 403 when user is not the host', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(HOST);
    mockResolveSpaceForUser.mockResolvedValueOnce({
      space: makeSpace(),
      isHost: false,
    });
    const { DELETE } = await import('@/app/api/spaces/[id]/route');
    const res = await DELETE(makeRequest('sp1'), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('forbidden');
    expect(mockPrismaSpaceDelete).not.toHaveBeenCalled();
    expect(mockSetSpaceLive).not.toHaveBeenCalled();
  });

  it('returns 404 when resolveSpaceForUser returns null', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(HOST);
    mockResolveSpaceForUser.mockResolvedValueOnce(null);
    const { DELETE } = await import('@/app/api/spaces/[id]/route');
    const res = await DELETE(makeRequest('missing'), {
      params: Promise.resolve({ id: 'missing' }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('not_found');
    expect(mockPrismaSpaceDelete).not.toHaveBeenCalled();
  });

  it('deletes an offline space and returns ok', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(HOST);
    mockResolveSpaceForUser.mockResolvedValueOnce({
      space: makeSpace({ isLive: false }),
      isHost: true,
    });

    const { DELETE } = await import('@/app/api/spaces/[id]/route');
    const res = await DELETE(makeRequest('sp1'), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    // Not live → live-state helpers must NOT be called.
    expect(mockSetSpaceLive).not.toHaveBeenCalled();
    expect(mockDeleteLiveStatus).not.toHaveBeenCalled();
    // The space row is removed.
    expect(mockPrismaSpaceDelete).toHaveBeenCalledTimes(1);
    expect(mockPrismaSpaceDelete).toHaveBeenCalledWith({
      where: { id: 'sp1' },
    });
  });

  it('clears live state and banner before deleting a live space', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(HOST);
    mockResolveSpaceForUser.mockResolvedValueOnce({
      space: makeSpace({ isLive: true }),
      isHost: true,
    });

    const { DELETE } = await import('@/app/api/spaces/[id]/route');
    const res = await DELETE(makeRequest('sp1'), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    // Live-state helpers fire before the row is removed.
    expect(mockSetSpaceLive).toHaveBeenCalledWith('sp1', false);
    expect(mockDeleteLiveStatus).toHaveBeenCalledTimes(1);
    expect(mockDeleteLiveStatus).toHaveBeenCalledWith({
      session: { did: HOST.did, handle: HOST.handle },
    });

    // Ordering: setSpaceLive → deleteLiveStatus → prisma.space.delete.
    expect(callIndex(mockSetSpaceLive)).toBeLessThan(callIndex(mockDeleteLiveStatus));
    expect(callIndex(mockDeleteLiveStatus)).toBeLessThan(
      callIndex(mockPrismaSpaceDelete)
    );

    expect(mockPrismaSpaceDelete).toHaveBeenCalledWith({
      where: { id: 'sp1' },
    });
  });

  it('still deletes the space when deleteLiveStatus throws', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(HOST);
    mockResolveSpaceForUser.mockResolvedValueOnce({
      space: makeSpace({ isLive: true }),
      isHost: true,
    });
    // ATProto banner removal is best-effort; if it throws, deletion must
    // continue.
    mockDeleteLiveStatus.mockRejectedValueOnce(
      new Error('PDS unavailable')
    );

    const { DELETE } = await import('@/app/api/spaces/[id]/route');
    const res = await DELETE(makeRequest('sp1'), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    expect(mockSetSpaceLive).toHaveBeenCalledWith('sp1', false);
    expect(mockDeleteLiveStatus).toHaveBeenCalledTimes(1);
    // The route should log a warning rather than propagate the error.
    expect(mockLogger.warn).toHaveBeenCalled();
    expect(mockPrismaSpaceDelete).toHaveBeenCalledWith({
      where: { id: 'sp1' },
    });
  });
});
