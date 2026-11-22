// tests/lib/db.test.ts
//
// The Prisma export is a proxy that binds to the D1 database from the
// Cloudflare request context on first use, and every query runs through a
// `$extends` query-telemetry wrapper (issue #128) that logs its start and
// end so a hung D1 call can be identified from logs alone.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetCloudflareContext, mockPrismaClient, mockAdapter, mockLogger, mockFindMany, mockQueryRaw } =
  vi.hoisted(() => ({
    mockGetCloudflareContext: vi.fn(),
    mockPrismaClient: vi.fn(),
    mockAdapter: vi.fn(),
    mockLogger: { info: vi.fn(), error: vi.fn() },
    mockFindMany: vi.fn(async () => ['row']),
    mockQueryRaw: vi.fn(async () => [{ one: 1 }]),
  }));

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: mockGetCloudflareContext }));
vi.mock('@/lib/logger', () => ({ logger: mockLogger }));
vi.mock('@prisma/adapter-d1', () => ({
  PrismaD1: class {
    constructor(db: unknown) {
      mockAdapter(db);
    }
  },
}));
vi.mock('@prisma/client', () => ({
  // A minimal stand-in for Prisma's real `$extends`: a top-level
  // `query.$allOperations` hook (not nested under `$allModels`) runs
  // around every model method AND `$queryRaw`, the same shape the real
  // client gives `withQueryTelemetry` — Prisma only passes `model` for
  // model-bound calls, leaving it `undefined` for a raw query.
  PrismaClient: class {
    user = { findMany: mockFindMany };
    $queryRaw = mockQueryRaw;
    constructor(opts: unknown) {
      mockPrismaClient(opts);
    }
    $extends(config: { query: { $allOperations: (ctx: unknown) => unknown } }) {
      const allOperations = config.query.$allOperations;
      const wrapped: Record<string, unknown> = {
        $queryRaw: (args: unknown) =>
          allOperations({ model: undefined, operation: '$queryRaw', args, query: () => this.$queryRaw() }),
      };
      for (const modelName of ['user'] as const) {
        const original = this[modelName] as Record<string, (...a: unknown[]) => unknown>;
        const model = modelName.charAt(0).toUpperCase() + modelName.slice(1);
        const wrappedModel: Record<string, unknown> = {};
        for (const operation of Object.keys(original)) {
          wrappedModel[operation] = (args: unknown) =>
            allOperations({ model, operation, args, query: (a: unknown) => original[operation](a) });
        }
        wrapped[modelName] = wrappedModel;
      }
      return wrapped;
    }
  },
}));

describe('db proxy', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('creates one client per D1 binding and delegates model access', async () => {
    const DB = { name: 'd1' };
    mockGetCloudflareContext.mockReturnValue({ env: { DB } });
    const { prisma } = await import('@/lib/db');
    expect(await prisma.user.findMany()).toEqual(['row']);
    await prisma.user.findMany();
    expect(mockAdapter).toHaveBeenCalledTimes(1);
    expect(mockAdapter).toHaveBeenCalledWith(DB);
    expect(mockPrismaClient).toHaveBeenCalledTimes(1);
  });

  it('fails clearly when the DB binding is missing', async () => {
    mockGetCloudflareContext.mockReturnValue({ env: {} });
    const { prisma } = await import('@/lib/db');
    expect(() => prisma.user).toThrow(/D1 binding "DB"/);
  });

  it('logs a start and a done event around every query, without the query args', async () => {
    mockGetCloudflareContext.mockReturnValue({ env: { DB: { name: 'd1' } } });
    const { prisma } = await import('@/lib/db');
    await prisma.user.findMany({ where: { did: 'did:plc:secret' } });

    expect(mockLogger.info).toHaveBeenCalledWith(
      'db.query.start',
      expect.objectContaining({ model: 'User', operation: 'findMany' })
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      'db.query.done',
      expect.objectContaining({ model: 'User', operation: 'findMany', durationMs: expect.any(Number) })
    );
    for (const call of mockLogger.info.mock.calls) {
      expect(JSON.stringify(call[1])).not.toContain('did:plc:secret');
    }
  });

  it('logs a failed event and rethrows when the query rejects, without the error message or stack', async () => {
    mockGetCloudflareContext.mockReturnValue({ env: { DB: { name: 'd1' } } });
    // Prisma embeds the full call args in a validation error's own message,
    // so the message (like the args) must never reach the log.
    const boom = new Error('Invalid `prisma.user.findMany()` invocation: did:plc:secret');
    (boom as Error & { code?: string }).code = 'P2025';
    mockFindMany.mockRejectedValueOnce(boom);
    const { prisma } = await import('@/lib/db');

    await expect(prisma.user.findMany()).rejects.toBe(boom);
    expect(mockLogger.error).toHaveBeenCalledWith(
      'db.query.failed',
      expect.objectContaining({
        model: 'User',
        operation: 'findMany',
        errorName: 'Error',
        errorCode: 'P2025',
      })
    );
    for (const call of mockLogger.error.mock.calls) {
      const fields = call[1] as Record<string, unknown>;
      expect(fields).not.toHaveProperty('message');
      expect(fields).not.toHaveProperty('stack');
      expect(fields).not.toHaveProperty('err');
      expect(JSON.stringify(fields)).not.toContain('did:plc:secret');
    }
  });

  it('also logs raw queries ($queryRaw, $executeRaw), not just model methods', async () => {
    // src/lib/users.ts and src/app/api/health/route.ts call $queryRaw /
    // $executeRaw directly; a hook nested under `$allModels` would miss them.
    mockGetCloudflareContext.mockReturnValue({ env: { DB: { name: 'd1' } } });
    const { prisma } = await import('@/lib/db');
    await (prisma as unknown as { $queryRaw: (args: unknown) => Promise<unknown> }).$queryRaw`SELECT 1`;

    expect(mockLogger.info).toHaveBeenCalledWith(
      'db.query.start',
      expect.objectContaining({ operation: '$queryRaw' })
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      'db.query.done',
      expect.objectContaining({ operation: '$queryRaw' })
    );
  });
});
