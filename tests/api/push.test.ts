// tests/api/push.test.ts — /api/push/vapid and /api/push/subscribe

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  saveSubscription: vi.fn(),
  removeSubscription: vi.fn(),
  countSubscriptions: vi.fn(),
  vapidPublicKey: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getCurrentUser: m.getCurrentUser }));
vi.mock('@/lib/push', async () => {
  const actual = await vi.importActual<typeof import('@/lib/push')>('@/lib/push');
  return {
    ...actual,
    saveSubscription: m.saveSubscription,
    removeSubscription: m.removeSubscription,
    countSubscriptions: m.countSubscriptions,
    vapidPublicKey: m.vapidPublicKey,
  };
});
vi.mock('@/lib/db', () => ({ prisma: {} }));

import { GET as vapidGet } from '@/app/api/push/vapid/route';
import { DELETE, GET, POST } from '@/app/api/push/subscribe/route';

const USER = { did: 'did:plc:a', handle: 'alice.test' };
const SUB = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' }, expirationTime: null };

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/push/subscribe', {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'user-agent': 'UA' } } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.getCurrentUser.mockResolvedValue(USER);
  m.vapidPublicKey.mockReturnValue('pub');
  m.countSubscriptions.mockResolvedValue(1);
  m.saveSubscription.mockResolvedValue({ id: 's1' });
});

describe('GET /api/push/vapid', () => {
  it('returns the public key, or 404 when unconfigured', async () => {
    expect(await (await vapidGet()).json()).toEqual({ publicKey: 'pub' });
    m.vapidPublicKey.mockReturnValue(null);
    expect((await vapidGet()).status).toBe(404);
  });
});

describe('/api/push/subscribe', () => {
  it('requires a session on every method', async () => {
    m.getCurrentUser.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await POST(req('POST', { subscription: SUB }))).status).toBe(401);
    expect((await DELETE(req('DELETE', { endpoint: SUB.endpoint }))).status).toBe(401);
  });

  it('stores a valid subscription with the user agent', async () => {
    const res = await POST(req('POST', { subscription: SUB }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 's1', count: 1 });
    expect(m.saveSubscription).toHaveBeenCalledWith(USER.did, SUB, 'UA');
  });

  it('rejects bad bodies', async () => {
    expect((await POST(req('POST', { subscription: { endpoint: 'nope' } }))).status).toBe(400);
    expect((await POST(new NextRequest('http://localhost/x', { method: 'POST', body: '{' }))).status).toBe(400);
    expect((await DELETE(req('DELETE', {}))).status).toBe(400);
  });

  it('404s on subscribe when push is not configured', async () => {
    m.vapidPublicKey.mockReturnValue(null);
    expect((await POST(req('POST', { subscription: SUB }))).status).toBe(404);
  });

  it('removes a subscription and reports the count', async () => {
    m.removeSubscription.mockResolvedValue(1);
    expect(await (await DELETE(req('DELETE', { endpoint: SUB.endpoint }))).json()).toEqual({ removed: 1 });
    expect(await (await GET()).json()).toEqual({ count: 1 });
  });
});
