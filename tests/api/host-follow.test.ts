// tests/api/host-follow.test.ts — GET/POST /api/hosts/[did]/follow

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getUserByDid: vi.fn(),
  hasHostFollow: vi.fn(),
  setHostFollow: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getCurrentUser: m.getCurrentUser }));
vi.mock('@/lib/users', () => ({ getUserByDid: m.getUserByDid }));
vi.mock('@/lib/host-follows', () => ({
  hasHostFollow: m.hasHostFollow,
  setHostFollow: m.setHostFollow,
}));

import { GET as followGet, POST as followPost } from '@/app/api/hosts/[did]/follow/route';

const ctx = { params: Promise.resolve({ did: 'did:plc:host' }) };
const USER = { did: 'did:plc:a', handle: 'alice.test' };
const HOST = { did: 'did:plc:host', handle: 'host.test', displayName: null, avatarUrl: null };

beforeEach(() => {
  vi.clearAllMocks();
  m.getCurrentUser.mockResolvedValue(USER);
  m.getUserByDid.mockResolvedValue(HOST);
});

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/hosts/did:plc:host/follow', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('/api/hosts/[did]/follow', () => {
  it('requires a session', async () => {
    m.getCurrentUser.mockResolvedValue(null);
    expect((await followGet(new NextRequest('http://localhost/x'), ctx)).status).toBe(401);
    expect((await followPost(post({ on: true }), ctx)).status).toBe(401);
  });

  it('404s for an unknown host', async () => {
    m.getUserByDid.mockResolvedValue(null);
    expect((await followGet(new NextRequest('http://localhost/x'), ctx)).status).toBe(404);
    expect((await followPost(post({ on: true }), ctx)).status).toBe(404);
  });

  it('reports the current state', async () => {
    m.hasHostFollow.mockResolvedValue(true);
    const res = await followGet(new NextRequest('http://localhost/x'), ctx);
    expect(await res.json()).toEqual({ following: true });
    expect(m.hasHostFollow).toHaveBeenCalledWith('did:plc:host', USER.did);
  });

  it('rejects following yourself', async () => {
    m.getUserByDid.mockResolvedValue({ ...HOST, did: USER.did });
    const res = await followPost(post({ on: true }), ctx);
    expect(res.status).toBe(400);
    expect(m.setHostFollow).not.toHaveBeenCalled();
  });

  it('validates the body and toggles the follow', async () => {
    expect((await followPost(post('{nope'), ctx)).status).toBe(400);
    expect((await followPost(post({ on: 'yes' }), ctx)).status).toBe(400);
    m.setHostFollow.mockResolvedValue(true);
    const res = await followPost(post({ on: true }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ following: true });
    expect(m.setHostFollow).toHaveBeenCalledWith('did:plc:host', USER.did, true);
  });
});
