// tests/lib/users.test.ts
//
// Exercises findMigratedHostDid and reassignHostIdentity, the Bluesky DID
// migration helpers, against a mocked Prisma client and a mocked PLC
// directory resolver.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindFirst, mockExecuteRaw, mockResolveDidMigrationTarget } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockExecuteRaw: vi.fn(),
  mockResolveDidMigrationTarget: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findFirst: mockFindFirst },
    $executeRaw: mockExecuteRaw,
  },
}));

vi.mock('@/lib/atproto-runtime', () => ({
  resolveDidMigrationTarget: mockResolveDidMigrationTarget,
}));

import { findMigratedHostDid, reassignHostIdentity } from '@/lib/users';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('findMigratedHostDid', () => {
  it('returns null when no other row claims the handle', async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    const result = await findMigratedHostDid('did:plc:new', 'alice.bsky.social');
    expect(result).toBeNull();
    expect(mockResolveDidMigrationTarget).not.toHaveBeenCalled();
  });

  it('returns the old DID when its PLC log points at the new one', async () => {
    mockFindFirst.mockResolvedValueOnce({ did: 'did:plc:old' });
    mockResolveDidMigrationTarget.mockResolvedValueOnce('did:plc:new');

    const result = await findMigratedHostDid('did:plc:new', 'alice.bsky.social');

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { handle: 'alice.bsky.social', did: { not: 'did:plc:new' } } })
    );
    expect(mockResolveDidMigrationTarget).toHaveBeenCalledWith('did:plc:old');
    expect(result).toBe('did:plc:old');
  });

  it('returns null when the old DID has no recorded migration pointer', async () => {
    mockFindFirst.mockResolvedValueOnce({ did: 'did:plc:old' });
    mockResolveDidMigrationTarget.mockResolvedValueOnce(null);

    const result = await findMigratedHostDid('did:plc:new', 'alice.bsky.social');
    expect(result).toBeNull();
  });

  it('returns null when the old DID points somewhere other than the new DID', async () => {
    // A recycled handle: the stale row's old DID migrated to some third DID,
    // not the one now claiming the handle, so it's not the same identity.
    mockFindFirst.mockResolvedValueOnce({ did: 'did:plc:old' });
    mockResolveDidMigrationTarget.mockResolvedValueOnce('did:plc:someone-else');

    const result = await findMigratedHostDid('did:plc:new', 'alice.bsky.social');
    expect(result).toBeNull();
  });
});

describe('reassignHostIdentity', () => {
  it('re-points every host-keyed table and updates User.did last', async () => {
    mockExecuteRaw.mockResolvedValue(1);

    await reassignHostIdentity('did:plc:old', 'did:plc:new');

    expect(mockExecuteRaw).toHaveBeenCalledTimes(6);
    const lastCall = mockExecuteRaw.mock.calls.at(-1)?.[0] as TemplateStringsArray;
    expect(lastCall.join('')).toContain('UPDATE "User"');
  });

  it('is a no-op when the DID did not actually change', async () => {
    await reassignHostIdentity('did:plc:same', 'did:plc:same');
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });
});
