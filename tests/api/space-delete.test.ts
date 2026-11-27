// tests/api/space-delete.test.ts
//
// Exercises DELETE /api/spaces/[id]. Mocks the session/spaces/atproto/db
// modules so we can drive auth, host role, live-state cleanup, and the
// final prisma.space.delete call. Recording/S3 cleanup is intentionally
// out of scope here (handled by a separate job).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSpace } from '../helpers/factories';
import { jsonRequest } from '../helpers/request';
import { mockSession, prismaStub } from '../helpers/mocks';

// The route is imported dynamically inside each test below, so (unlike
// tests/api/reactions.test.ts, which imports it statically) these vi.mock
// factories run lazily at test time: they can call the tests/helpers/mocks
// builders directly, since by then the rest of this file's top level has
// already executed.
const mockGetCurrentUser = mockSession();
const prisma = prismaStub({ space: ['delete'] });

const {
  mockResolveSpaceForUser,
  mockSetSpaceLive,
  mockDeleteLiveStatus,
  mockUpdateCalendarEventStatus,
  mockLogger,
} = vi.hoisted(() => ({
  mockResolveSpaceForUser: vi.fn(),
  mockSetSpaceLive: vi.fn(),
  mockDeleteLiveStatus: vi.fn(),
  mockUpdateCalendarEventStatus: vi.fn(),
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
  originFromRequest: (request: Request) => new URL(request.url).origin,
  defaultPublicOrigin: () => 'https://rabble.invalid',
}));

vi.mock('@/lib/atproto', () => ({
  deleteLiveStatus: mockDeleteLiveStatus,
  updateCalendarEventStatus: mockUpdateCalendarEventStatus,
  CALENDAR_EVENT_STATUS: {
    scheduled: 'community.lexicon.calendar.event#scheduled',
    cancelled: 'community.lexicon.calendar.event#cancelled',
  },
}));

vi.mock('@/lib/db', () => ({ prisma }));

vi.mock('@/lib/logger', () => ({
  logger: mockLogger,
}));

const HOST = {
  did: 'did:plc:host123',
  handle: 'alice.bsky.social',
};

beforeEach(() => {
  // resetAllMocks clears both call history AND queued implementations so
  // leftover mockResolvedValueOnce values from earlier tests do not leak.
  vi.resetAllMocks();
  // Space deletion always succeeds unless a test wants to simulate failure.
  prisma.space.delete.mockResolvedValue({ id: 'sp1' });
  // External cleanup helpers succeed by default.
  mockSetSpaceLive.mockResolvedValue(undefined);
  mockDeleteLiveStatus.mockResolvedValue({ ok: true });
  mockUpdateCalendarEventStatus.mockResolvedValue({ ok: true });
});

function makeRequest(id: string) {
  return jsonRequest('DELETE', `http://localhost/api/spaces/${id}`);
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
    expect(prisma.space.delete).not.toHaveBeenCalled();
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
    expect(prisma.space.delete).not.toHaveBeenCalled();
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
    expect(prisma.space.delete).not.toHaveBeenCalled();
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
    expect(prisma.space.delete).not.toHaveBeenCalled();
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
    expect(prisma.space.delete).toHaveBeenCalledTimes(1);
    expect(prisma.space.delete).toHaveBeenCalledWith({
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
    expect(callIndex(mockDeleteLiveStatus)).toBeLessThan(callIndex(prisma.space.delete));

    expect(prisma.space.delete).toHaveBeenCalledWith({
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
    expect(prisma.space.delete).toHaveBeenCalledWith({
      where: { id: 'sp1' },
    });
  });

  it('does not touch the calendar event when none was published', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(HOST);
    mockResolveSpaceForUser.mockResolvedValueOnce({
      space: makeSpace({ calendarEventUri: null }),
      isHost: true,
    });

    const { DELETE } = await import('@/app/api/spaces/[id]/route');
    const res = await DELETE(makeRequest('sp1'), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(200);
    expect(mockUpdateCalendarEventStatus).not.toHaveBeenCalled();
    expect(prisma.space.delete).toHaveBeenCalledWith({
      where: { id: 'sp1' },
    });
  });

  it('cancels the calendar event for a scheduled show before deleting it', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(HOST);
    const scheduledAt = new Date('2026-02-01T18:00:00.000Z');
    mockResolveSpaceForUser.mockResolvedValueOnce({
      space: makeSpace({
        status: 'scheduled',
        scheduledAt,
        calendarEventUri: 'at://did:plc:host123/community.lexicon.calendar.event/sp1',
      }),
      isHost: true,
    });

    const { DELETE } = await import('@/app/api/spaces/[id]/route');
    const res = await DELETE(makeRequest('sp1'), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    expect(mockUpdateCalendarEventStatus).toHaveBeenCalledWith({
      session: { did: HOST.did, handle: HOST.handle },
      rkey: 'sp1',
      title: 'My room',
      description: null,
      spaceUrl: 'https://rabble.invalid/show/sp1',
      startsAt: scheduledAt.toISOString(),
      status: 'community.lexicon.calendar.event#cancelled',
    });
    expect(callIndex(mockUpdateCalendarEventStatus)).toBeLessThan(
      callIndex(prisma.space.delete)
    );
    expect(prisma.space.delete).toHaveBeenCalledWith({
      where: { id: 'sp1' },
    });
  });

  it('still deletes the space when updateCalendarEventStatus fails', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(HOST);
    mockResolveSpaceForUser.mockResolvedValueOnce({
      space: makeSpace({
        status: 'scheduled',
        scheduledAt: new Date('2026-02-01T18:00:00.000Z'),
        calendarEventUri: 'at://did:plc:host123/community.lexicon.calendar.event/sp1',
      }),
      isHost: true,
    });
    mockUpdateCalendarEventStatus.mockResolvedValueOnce({ ok: false, error: 'PDS unavailable' });

    const { DELETE } = await import('@/app/api/spaces/[id]/route');
    const res = await DELETE(makeRequest('sp1'), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(mockLogger.warn).toHaveBeenCalled();
    expect(prisma.space.delete).toHaveBeenCalledWith({
      where: { id: 'sp1' },
    });
  });
});
