// tests/lib/atproto-runtime.test.ts
//
// Exercises resolveDidMigrationTarget: the PLC audit log lookup that proves
// (rather than infers) a did:plc identity migrated to a new DID.

import { describe, it, expect, vi } from 'vitest';
import { didAuditLogUrl, resolveDidMigrationTarget } from '@/lib/atproto-runtime';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function op(alsoKnownAs: string[], overrides: Record<string, unknown> = {}) {
  return {
    did: 'did:plc:old',
    operation: { type: 'plc_operation', alsoKnownAs },
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('didAuditLogUrl', () => {
  it('builds the PLC directory audit log URL for a did:plc', () => {
    expect(didAuditLogUrl('did:plc:old')).toBe('https://plc.directory/did%3Aplc%3Aold/log/audit');
  });

  it('throws for a non-did:plc identity', () => {
    expect(() => didAuditLogUrl('did:web:example.com')).toThrow();
  });
});

describe('resolveDidMigrationTarget', () => {
  it('returns the new DID named in the log\'s last entry', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse([
        op(['at://alice.bsky.social']),
        op(['at://alice.bsky.social', 'did:plc:new']),
      ])
    );

    const result = await resolveDidMigrationTarget('did:plc:old', { fetchImpl });
    expect(result).toBe('did:plc:new');
  });

  it('skips a nullified entry when looking for the pointer', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse([
        op(['at://alice.bsky.social', 'did:plc:genuine']),
        op(['at://alice.bsky.social', 'did:plc:rolled-back'], { nullified: true }),
      ])
    );

    const result = await resolveDidMigrationTarget('did:plc:old', { fetchImpl });
    expect(result).toBe('did:plc:genuine');
  });

  it('returns null when nothing in the log points anywhere', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse([op(['at://alice.bsky.social'])]));
    const result = await resolveDidMigrationTarget('did:plc:old', { fetchImpl });
    expect(result).toBeNull();
  });

  it('returns null on a non-200 response rather than treating it as a migration', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 }));
    const result = await resolveDidMigrationTarget('did:plc:old', { fetchImpl });
    expect(result).toBeNull();
  });

  it('returns null when the fetch itself throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error('network down'));
    const result = await resolveDidMigrationTarget('did:plc:old', { fetchImpl });
    expect(result).toBeNull();
  });

  it('returns null immediately for a non-did:plc identity, without fetching', async () => {
    const fetchImpl = vi.fn();
    const result = await resolveDidMigrationTarget('did:web:example.com', { fetchImpl });
    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
