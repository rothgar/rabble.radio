// tests/api/show-follow.test.ts — GET/POST /api/spaces/[id]/follow

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSpaceById: vi.fn(),
  getSpaceBySlug: vi.fn(),
  hasShowFollow: vi.fn(),
  setShowFollow: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getCurrentUser: m.getCurrentUser }));
vi.mock('@/lib/spaces', () => ({
  getSpaceById: m.getSpaceById,
  getSpaceBySlug: m.getSpaceBySlug,
  resolveSpace: async (id: string) => (await m.getSpaceById(id)) ?? (await m.getSpaceBySlug(id)),
}));
vi.mock('@/lib/show-follows', () => ({
  hasShowFollow: m.hasShowFollow,
  setShowFollow: m.setShowFollow,
}));

import { GET as followGet, POST as followPost } from '@/app/api/spaces/[id]/follow/route';

const ctx = { params: Promise.resolve({ id: 'sp1' }) };
const USER = { did: 'did:plc:a', handle: 'alice.test' };
const SPACE = { id: 'sp1', host: { did: 'did:plc:host' } };

beforeEach(() => {
  vi.clearAllMocks();
  m.getCurrentUser.mockResolvedValue(USER);
  m.getSpaceById.mockResolvedValue(SPACE);
});

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/spaces/sp1/follow', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('/api/spaces/[id]/follow', () => {
  it('requires a session', async () => {
    m.getCurrentUser.mockResolvedValue(null);
    expect((await followGet(new NextRequest('http://localhost/x'), ctx)).status).toBe(401);
    expect((await followPost(post({ on: true }), ctx)).status).toBe(401);
  });

  it('404s for unknown shows (after a slug fallback)', async () => {
    m.getSpaceById.mockResolvedValue(null);
    m.getSpaceBySlug.mockResolvedValue(null);
    expect((await followGet(new NextRequest('http://localhost/x'), ctx)).status).toBe(404);
    expect((await followPost(post({ on: true }), ctx)).status).toBe(404);
    expect(m.getSpaceBySlug).toHaveBeenCalledWith('sp1');
  });

  it('reports the current state', async () => {
    m.hasShowFollow.mockResolvedValue(true);
    const res = await followGet(new NextRequest('http://localhost/x'), ctx);
    expect(await res.json()).toEqual({ following: true });
    expect(m.hasShowFollow).toHaveBeenCalledWith('sp1', USER.did);
  });

  it('rejects the host following their own show', async () => {
    m.getSpaceById.mockResolvedValue({ ...SPACE, host: { did: USER.did } });
    const res = await followPost(post({ on: true }), ctx);
    expect(res.status).toBe(400);
    expect(m.setShowFollow).not.toHaveBeenCalled();
  });

  it('validates the body and toggles the follow', async () => {
    expect((await followPost(post('{nope'), ctx)).status).toBe(400);
    expect((await followPost(post({ on: 'yes' }), ctx)).status).toBe(400);
    m.setShowFollow.mockResolvedValue(true);
    const res = await followPost(post({ on: true }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ following: true });
    expect(m.setShowFollow).toHaveBeenCalledWith('sp1', USER.did, true);
  });
});
