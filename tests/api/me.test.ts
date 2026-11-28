// tests/api/me.test.ts — GET /api/me

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: m.getSession }));
vi.mock('@/lib/db', () => ({ prisma: { user: { findUnique: m.findUnique } } }));

import { GET } from '@/app/api/me/route';

const row = {
  id: 'u1',
  did: 'did:plc:admin',
  handle: 'admin.test',
  displayName: 'Admin',
  avatarUrl: null,
  bannedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  m.getSession.mockResolvedValue({ bluesky: { did: 'did:plc:admin' } });
  m.findUnique.mockResolvedValue({ ...row });
  process.env.ADMIN_DIDS = 'did:plc:admin';
});

afterEach(() => {
  delete process.env.ADMIN_DIDS;
});

describe('GET /api/me', () => {
  it('tells an admin that they are one', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      did: 'did:plc:admin',
      isAdmin: true,
    });
  });

  it('says everyone else is not an admin', async () => {
    m.getSession.mockResolvedValue({ bluesky: { did: 'did:plc:guest' } });
    m.findUnique.mockResolvedValue({ ...row, did: 'did:plc:guest', handle: 'guest.test' });
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ isAdmin: false });
  });
});
