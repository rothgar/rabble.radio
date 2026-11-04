// tests/lib/oauth-session-store.test.ts
//
// Targeted unit tests for the Prisma-backed ATProto OAuth session store.
// Mocks Prisma so this runs without a real database.

import type { NodeSavedSession } from '@atproto/oauth-client-node';
import { JoseKey } from '@atproto/jwk-jose';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPrismaSessionStore, withDpopKey, type SimpleStore } from '@/lib/oauth-session-store';

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

const sampleSession: NodeSavedSession = {
  authMethod: { method: 'none' },
  dpopJwk: { kty: 'EC', crv: 'P-256', x: 'abc', y: 'def' } as const,
  tokenSet: {
    access_token: 'at',
    refresh_token: 'rt',
    token_type: 'DPoP',
    iss: 'https://pds.local',
    aud: 'did:web:pds.local',
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
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
    const { dpopJwk: _ignored, ...plain } = sampleSession;
    mockFindUnique.mockResolvedValue({
      did: 'did:plc:abc123',
      data: JSON.stringify(plain),
    });

    const store = createPrismaSessionStore();
    const result = await store.get('did:plc:abc123');

    expect(result).toEqual(plain);
  });

  it('upserts session data keyed by DID', async () => {
    mockUpsert.mockResolvedValue({});
    const { dpopJwk: _ignored, ...plain } = sampleSession;

    const store = createPrismaSessionStore();
    await store.set('did:plc:abc123', plain);

    expect(mockUpsert).toHaveBeenCalledWith({
      where: { did: 'did:plc:abc123' },
      create: { did: 'did:plc:abc123', data: JSON.stringify(plain) },
      update: { data: JSON.stringify(plain) },
    });
  });

  it('stores the DPoP key as a JWK and rebuilds a Key on read', async () => {
    mockUpsert.mockResolvedValue({});
    const dpopKey = await JoseKey.generate(['ES256']);
    const store = createPrismaSessionStore<Record<string, unknown>>();
    await store.set('did:plc:abc123', { ...sampleSession, dpopJwk: undefined, dpopKey });

    const written = JSON.parse(mockUpsert.mock.calls[0][0].create.data as string);
    expect(written.dpopKey).toBeUndefined();
    expect(written.dpopJwk).toEqual(JSON.parse(JSON.stringify(dpopKey.privateJwk)));

    mockFindUnique.mockResolvedValue({ did: 'did:plc:abc123', data: JSON.stringify(written) });
    const read = (await store.get('did:plc:abc123')) as { dpopKey?: JoseKey; dpopJwk?: unknown };
    expect(read.dpopJwk).toBeUndefined();
    expect(read.dpopKey).toBeInstanceOf(JoseKey);
    // The rebuilt key can sign DPoP proofs, which is what the callback needs.
    expect(read.dpopKey?.algorithms).toContain('ES256');
    expect((read.dpopKey?.privateJwk as { d?: string }).d).toBe((dpopKey.privateJwk as { d?: string }).d);
  });

  it('deletes rows by DID', async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 });

    const store = createPrismaSessionStore();
    await store.del('did:plc:abc123');

    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { did: 'did:plc:abc123' } });
  });
});

describe('withDpopKey', () => {
  it('passes values without a key straight through', async () => {
    const backing = new Map<string, unknown>();
    const raw: SimpleStore<unknown> = {
      get: async (k) => backing.get(k),
      set: async (k, v) => void backing.set(k, v),
      del: async (k) => void backing.delete(k),
      clear: async () => backing.clear(),
    };
    const store = withDpopKey(raw);
    await store.set('a', { plain: true });
    expect(await store.get('a')).toEqual({ plain: true });
    await store.del('a');
    expect(await store.get('a')).toBeUndefined();
  });

  it('refuses to persist a key without private material', async () => {
    const store = withDpopKey<unknown>({
      get: async () => undefined,
      set: async () => undefined,
      del: async () => undefined,
      clear: async () => undefined,
    });
    await expect(store.set('a', { dpopKey: { publicJwk: {} } })).rejects.toThrow(/Private DPoP JWK/);
  });
});
