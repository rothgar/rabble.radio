// tests/api/space-patch.test.ts
//
// PATCH /api/spaces/[id]: hosts rename the show and pick station topics
// from inside the room.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  resolveSpaceForUser: vi.fn(),
  updateSpace: vi.fn(),
  publishLiveStatus: vi.fn(async () => ({ ok: true })),
  broadcastRoomData: vi.fn(async () => true),
}));

vi.mock('@/lib/session', () => ({ getCurrentUser: m.getCurrentUser }));
vi.mock('@/lib/spaces', () => ({
  getSpaceById: vi.fn(),
  getSpaceBySlug: vi.fn(),
  resolveSpaceForUser: m.resolveSpaceForUser,
  setSpaceLive: vi.fn(),
  updateSpace: m.updateSpace,
  toPublicSpace: (s: Record<string, unknown>) => ({ ...s, shareableUrl: 'x' }),
}));
vi.mock('@/lib/atproto', () => ({
  publishLiveStatus: m.publishLiveStatus,
  deleteLiveStatus: vi.fn(),
}));
vi.mock('@/lib/livekit', () => ({
  broadcastRoomData: m.broadcastRoomData,
  roomNameForSpace: (id: string) => `space-${id}`,
}));
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function space(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sp1',
    title: 'Old title',
    description: null,
    hostId: 'did:plc:host',
    isLive: false,
    tags: [],
    host: { did: 'did:plc:host', handle: 'alice.bsky.social' },
    ...overrides,
  };
}

function patch(body: unknown) {
  return new NextRequest('http://localhost/api/spaces/sp1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: 'sp1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  m.getCurrentUser.mockResolvedValue({ did: 'did:plc:host', handle: 'alice.bsky.social' });
  m.resolveSpaceForUser.mockResolvedValue({ space: space(), isHost: true });
  m.updateSpace.mockImplementation(async (_id: string, input: Record<string, unknown>) =>
    space({ ...input, tags: (input.tags as string[]) ?? [] })
  );
});

describe('PATCH /api/spaces/[id]', () => {
  it('requires a session', async () => {
    m.getCurrentUser.mockResolvedValueOnce(null);
    const { PATCH } = await import('@/app/api/spaces/[id]/route');
    const res = await PATCH(patch({ title: 'x' }), ctx);
    expect(res.status).toBe(401);
  });

  it('only the host may edit', async () => {
    m.resolveSpaceForUser.mockResolvedValueOnce({ space: space(), isHost: false });
    const { PATCH } = await import('@/app/api/spaces/[id]/route');
    const res = await PATCH(patch({ title: 'x' }), ctx);
    expect(res.status).toBe(403);
    expect(m.updateSpace).not.toHaveBeenCalled();
  });

  it('validates the body', async () => {
    const { PATCH } = await import('@/app/api/spaces/[id]/route');
    expect((await PATCH(patch({}), ctx)).status).toBe(400);
    expect((await PATCH(patch({ title: '   ' }), ctx)).status).toBe(400);
    expect((await PATCH(patch({ tags: 'Music' }), ctx)).status).toBe(400);
    expect((await PATCH(patch({ tags: ['Nonsense'] }), ctx)).status).toBe(400);
    expect(m.updateSpace).not.toHaveBeenCalled();
  });

  it('updates title, description and tags and tells the room', async () => {
    const { PATCH } = await import('@/app/api/spaces/[id]/route');
    const res = await PATCH(
      patch({ title: 'Morning show', description: 'Coffee talk', tags: ['Music', 'Comedy'] }),
      ctx
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.space.title).toBe('Morning show');
    expect(m.updateSpace).toHaveBeenCalledWith('sp1', {
      title: 'Morning show',
      description: 'Coffee talk',
      tags: ['Music', 'Comedy'],
    });
    expect(m.broadcastRoomData).toHaveBeenCalledWith('space-sp1', {
      type: 'space_updated',
      spaceId: 'sp1',
      title: 'Morning show',
      description: 'Coffee talk',
      tags: ['Music', 'Comedy'],
      musicMood: null,
    });
    // Off air: nothing is republished to Bluesky.
    expect(m.publishLiveStatus).not.toHaveBeenCalled();
  });

  it('saves a music mood, clears it with null, and rejects unknown moods', async () => {
    const { PATCH } = await import('@/app/api/spaces/[id]/route');
    const ok = await PATCH(patch({ musicMood: 'lounge' }), ctx);
    expect(ok.status).toBe(200);
    expect(m.updateSpace).toHaveBeenCalledWith('sp1', { musicMood: 'lounge' });
    expect(m.broadcastRoomData).toHaveBeenLastCalledWith('space-sp1', expect.objectContaining({ musicMood: 'lounge' }));
    expect((await ok.json()).space.musicMood).toBe('lounge');

    const cleared = await PATCH(patch({ musicMood: null }), ctx);
    expect(cleared.status).toBe(200);
    expect(m.updateSpace).toHaveBeenLastCalledWith('sp1', { musicMood: null });

    const bad = await PATCH(patch({ musicMood: 'death-metal' }), ctx);
    expect(bad.status).toBe(400);
    expect((await bad.json()).message).toMatch(/mood/i);
  });

  it('republishes the Bluesky live status when renaming an on-air show', async () => {
    m.updateSpace.mockResolvedValueOnce(space({ title: 'Renamed', isLive: true }));
    const { PATCH } = await import('@/app/api/spaces/[id]/route');
    const res = await PATCH(patch({ title: 'Renamed' }), ctx);
    expect(res.status).toBe(200);
    expect(m.publishLiveStatus).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Renamed', spaceUrl: 'http://localhost/show/sp1' })
    );
  });
});
