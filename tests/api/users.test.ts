// tests/api/users.test.ts — GET /api/users

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetCurrentUser, mockGetUsersByDid } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockGetUsersByDid: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getCurrentUser: mockGetCurrentUser }));
vi.mock('@/lib/users', () => ({ getUsersByDid: mockGetUsersByDid }));

import { GET } from '@/app/api/users/route';

const USER = { did: 'did:plc:a', handle: 'alice.test' };

function req(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/users${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(USER);
});

describe('GET /api/users', () => {
  it('requires a session', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await GET(req('?identities=did:plc:b'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('returns an empty list with no identities', async () => {
    const res = await GET(req(''));
    expect(await res.json()).toEqual({ users: [] });
    expect(mockGetUsersByDid).not.toHaveBeenCalled();
  });

  it('rejects more than 100 identities', async () => {
    const many = Array.from({ length: 101 }, (_, i) => `did:plc:${i}`).join(',');
    const res = await GET(req(`?identities=${many}`));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'validation_error',
      message: 'At most 100 identities per request.',
    });
  });

  it('resolves identities to public summaries', async () => {
    mockGetUsersByDid.mockResolvedValue([
      { did: 'did:plc:b', handle: 'bob.test', displayName: 'Bob', avatarUrl: null },
    ]);
    const res = await GET(req('?identities=did:plc:b'));
    expect(await res.json()).toEqual({
      users: [{ did: 'did:plc:b', handle: 'bob.test', displayName: 'Bob', avatarUrl: null }],
    });
  });

  it('returns a fixed message on failure, never the upstream error', async () => {
    mockGetUsersByDid.mockRejectedValue(new Error('prisma: connection refused at 10.0.0.1:5432'));
    const res = await GET(req('?identities=did:plc:b'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: 'lookup_failed',
      message: 'Failed to resolve users.',
    });
  });
});
