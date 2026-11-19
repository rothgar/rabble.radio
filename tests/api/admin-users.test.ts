// tests/api/admin-users.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetCurrentUser, mockIsAdmin, mockBanUser, mockUnbanUser, mockKickFromPlatform } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockIsAdmin: vi.fn(),
  mockBanUser: vi.fn(),
  mockUnbanUser: vi.fn(),
  mockKickFromPlatform: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getCurrentUser: mockGetCurrentUser }));
vi.mock('@/lib/admin', async () => {
  const actual = await vi.importActual<typeof import('@/lib/admin')>('@/lib/admin');
  return {
    ...actual,
    isAdmin: mockIsAdmin,
    banUser: mockBanUser,
    unbanUser: mockUnbanUser,
    kickFromPlatform: mockKickFromPlatform,
  };
});

import { POST } from '@/app/api/admin/users/route';

function post(body: unknown): Promise<Response> {
  return POST(
    new NextRequest('http://localhost/api/admin/users', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue({ did: 'did:plc:admin', handle: 'admin.test' });
  mockIsAdmin.mockReturnValue(true);
});

describe('POST /api/admin/users', () => {
  it('403s for non-admins', async () => {
    mockIsAdmin.mockReturnValue(false);
    const res = await post({ did: 'did:plc:a', action: 'ban' });
    expect(res.status).toBe(403);
    expect(mockBanUser).not.toHaveBeenCalled();
  });

  it('bans a user', async () => {
    mockBanUser.mockResolvedValueOnce({
      did: 'did:plc:a',
      handle: 'alice.test',
      displayName: null,
      createdAt: new Date('2026-11-01T00:00:00Z'),
      bannedAt: new Date('2026-11-19T00:00:00Z'),
      banReason: 'spam',
    });
    const res = await post({ did: 'did:plc:a', action: 'ban', reason: 'spam' });
    expect(res.status).toBe(200);
    expect(mockBanUser).toHaveBeenCalledWith('did:plc:a', 'spam');
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.user.did).toBe('did:plc:a');
  });

  it('rejects banning yourself', async () => {
    const res = await post({ did: 'did:plc:admin', action: 'ban' });
    expect(res.status).toBe(400);
    expect(mockBanUser).not.toHaveBeenCalled();
  });

  it('unbans a user', async () => {
    mockUnbanUser.mockResolvedValueOnce({
      did: 'did:plc:a',
      handle: 'alice.test',
      displayName: null,
      createdAt: new Date('2026-11-01T00:00:00Z'),
      bannedAt: null,
      banReason: null,
    });
    const res = await post({ did: 'did:plc:a', action: 'unban' });
    expect(res.status).toBe(200);
    expect(mockUnbanUser).toHaveBeenCalledWith('did:plc:a');
  });

  it('kicks a user without banning them', async () => {
    mockKickFromPlatform.mockResolvedValueOnce(2);
    const res = await post({ did: 'did:plc:a', action: 'kick' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, kicked: 2 });
    expect(mockBanUser).not.toHaveBeenCalled();
  });

  it('validates did and action', async () => {
    const res = await post({ did: 'did:plc:a', action: 'nope' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the user does not exist', async () => {
    const { AdminActionError } = await import('@/lib/admin');
    mockBanUser.mockRejectedValueOnce(new AdminActionError('user_not_found'));
    const res = await post({ did: 'did:plc:ghost', action: 'ban' });
    expect(res.status).toBe(404);
  });

  it('rejects a non-JSON body', async () => {
    const res = await post('not json');
    expect(res.status).toBe(400);
  });
});
