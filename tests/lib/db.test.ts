// tests/lib/db.test.ts
//
// The Prisma export is a proxy that binds to the D1 database from the
// Cloudflare request context on first use.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetCloudflareContext, mockPrismaClient, mockAdapter } = vi.hoisted(() => ({
  mockGetCloudflareContext: vi.fn(),
  mockPrismaClient: vi.fn(),
  mockAdapter: vi.fn(),
}));

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: mockGetCloudflareContext }));
vi.mock('@prisma/adapter-d1', () => ({
  PrismaD1: class {
    constructor(db: unknown) {
      mockAdapter(db);
    }
  },
}));
vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    user = { findMany: vi.fn(async () => ['row']) };
    constructor(opts: unknown) {
      mockPrismaClient(opts);
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
});
