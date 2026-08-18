// tests/lib/oauth-session-store.test.ts
//
// Targeted unit tests for the Prisma-backed ATProto OAuth session store.
// Mocks Prisma so this runs without a real database.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPrismaSessionStore } from '@/lib/oauth-session-store';

const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();
const mockDeleteMany = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    oAuthSession: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  },
}));

const sampleSession = {
  dpopJwk: { kty: 'EC', crv: 'P-256', x: 'abc', y: 'def' } as const,
  tokenSet: {
    access_token: 'at',
    refresh_token: 'rt',
    token_type: 'DPoP',
    expires_at: Date.now() / 1000 + 3600,
    scope: 'atproto',
    sub: 'did:plc:abc123',
  },
};

describe('createPrismaSessionStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined when no session row exists', async () => {
    mockFindUnique.mockResolvedValue(null);

    const store = createPrismaSessionStore();
    const result = await store.get('did:plc:abc123');

    expect(result).toBeUndefined();
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { did: 'did:plc:abc123' } });
  });

  it('returns parsed session data from the database', async () => {
    mockFindUnique.mockResolvedValue({
      did: 'did:plc:abc123',
      data: sampleSession,
    });

    const store = createPrismaSessionStore();
    const result = await store.get('did:plc:abc123');

    expect(result).toEqual(sampleSession);
  });

  it('upserts session data keyed by DID', async () => {
    mockUpsert.mockResolvedValue({});

    const store = createPrismaSessionStore();
    await store.set('did:plc:abc123', sampleSession);

    expect(mockUpsert).toHaveBeenCalledWith({
      where: { did: 'did:plc:abc123' },
      create: { did: 'did:plc:abc123', data: sampleSession },
      update: { data: sampleSession },
    });
  });

  it('deletes rows by DID', async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 });

    const store = createPrismaSessionStore();
    await store.del('did:plc:abc123');

    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { did: 'did:plc:abc123' } });
  });
});
