// tests/api/live.test.ts
//
// Exercises POST /api/spaces/[id]/live. Mocks the spaces/session/atproto
// modules so we can drive auth, host role, and start/end actions.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetCurrentUser,
  mockResolveSpaceForUser,
  mockSetSpaceLive,
  mockPublishLiveStatus,
  mockDeleteLiveStatus,
  mockToPublicSpace,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockResolveSpaceForUser: vi.fn(),
  mockSetSpaceLive: vi.fn(),
  mockPublishLiveStatus: vi.fn(),
  mockDeleteLiveStatus: vi.fn(),
  mockToPublicSpace: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock('@/lib/spaces', () => ({
  resolveSpaceForUser: mockResolveSpaceForUser,
  setSpaceLive: mockSetSpaceLive,
  toPublicSpace: mockToPublicSpace,
}));

vi.mock('@/lib/atproto', () => ({
  publishLiveStatus: mockPublishLiveStatus,
  deleteLiveStatus: mockDeleteLiveStatus,
}));

function makeSpace(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sp1',
    slug: 'room',
    title: 'My room',
    description: null,
    hostId: 'did:plc:host123',
    isLive: false,
    createdAt: new Date('2025-01-02T00:00:00Z'),
    updatedAt: new Date('2025-01-02T00:00:00Z'),
    host: {
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
      displayName: null,
      avatarUrl: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  // resetAllMocks clears both call history AND queued implementations so
  // leftover mockResolvedValueOnce values from earlier tests do not leak.
  vi.resetAllMocks();
  mockToPublicSpace.mockImplementation((space: Record<string, unknown>) => ({
    id: space.id,
    isLive: space.isLive,
    title: space.title,
  }));
});

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/spaces/sp1/live', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/spaces/[id]/live', () => {
  it('requires authentication', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/spaces/[id]/live/route');
    const res = await POST(makeRequest({ action: 'start' }), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(401);
    expect(mockPublishLiveStatus).not.toHaveBeenCalled();
  });

  it('rejects non-host with 403', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:listener',
      handle: 'bob.bsky.social',
    });
    mockResolveSpaceForUser.mockResolvedValueOnce({
      space: makeSpace(),
      isHost: false,
    });
    const { POST } = await import('@/app/api/spaces/[id]/live/route');
    const res = await POST(makeRequest({ action: 'start' }), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('forbidden');
    expect(mockPublishLiveStatus).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid action', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    mockResolveSpaceForUser.mockResolvedValueOnce({
      space: makeSpace(),
      isHost: true,
    });
    const { POST } = await import('@/app/api/spaces/[id]/live/route');
    const res = await POST(makeRequest({ action: 'pause' }), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(400);
    expect(mockPublishLiveStatus).not.toHaveBeenCalled();
  });

  it('returns 404 when space not found', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    mockResolveSpaceForUser.mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/spaces/[id]/live/route');
    const res = await POST(makeRequest({ action: 'start' }), {
      params: Promise.resolve({ id: 'missing' }),
    });
    expect(res.status).toBe(404);
  });

  it('start: flips isLive and publishes record', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    mockResolveSpaceForUser.mockResolvedValueOnce({
      space: makeSpace({ isLive: false }),
      isHost: true,
    });
    mockSetSpaceLive.mockResolvedValueOnce(makeSpace({ isLive: true }));
    mockPublishLiveStatus.mockResolvedValueOnce({
      ok: true,
      uri: 'at://did:plc:host123/app.bsky.actor.status/self',
      record: { status: 'live' },
    });

    const { POST } = await import('@/app/api/spaces/[id]/live/route');
    const res = await POST(makeRequest({ action: 'start' }), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.uri).toBe(
      'at://did:plc:host123/app.bsky.actor.status/self'
    );
    expect(mockSetSpaceLive).toHaveBeenCalledWith('sp1', true);
    expect(mockPublishLiveStatus).toHaveBeenCalledTimes(1);
    expect(mockPublishLiveStatus.mock.calls[0][0].spaceUrl).toBe(
      'http://localhost/spaces/sp1'
    );
  });

  it('start: rolls back isLive when publish fails', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    mockResolveSpaceForUser.mockResolvedValueOnce({
      space: makeSpace(),
      isHost: true,
    });
    mockSetSpaceLive
      .mockResolvedValueOnce(makeSpace({ isLive: true }))
      .mockResolvedValueOnce(makeSpace({ isLive: false }));
    mockPublishLiveStatus.mockResolvedValueOnce({
      ok: false,
      error: 'PDS unavailable',
    });

    const { POST } = await import('@/app/api/spaces/[id]/live/route');
    const res = await POST(makeRequest({ action: 'start' }), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('atproto_failed');
    // Rollback called
    expect(mockSetSpaceLive).toHaveBeenNthCalledWith(2, 'sp1', false);
  });

  it('end: flips isLive and deletes record', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
    });
    mockResolveSpaceForUser.mockResolvedValueOnce({
      space: makeSpace({ isLive: true }),
      isHost: true,
    });
    mockSetSpaceLive.mockResolvedValueOnce(makeSpace({ isLive: false }));
    mockDeleteLiveStatus.mockResolvedValueOnce({ ok: true });

    const { POST } = await import('@/app/api/spaces/[id]/live/route');
    const res = await POST(makeRequest({ action: 'end' }), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.atproto).toBe(true);
    expect(mockSetSpaceLive).toHaveBeenCalledWith('sp1', false);
    expect(mockDeleteLiveStatus).toHaveBeenCalledWith({
      session: {
        did: 'did:plc:host123',
        handle: 'alice.bsky.social',
      },
    });
  });
});
