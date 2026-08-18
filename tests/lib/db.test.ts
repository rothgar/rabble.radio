import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the PrismaClient constructor before importing db. db.ts imports
// PrismaClient from `@prisma/client`, so we mock that module path.
const mockPrisma = {
  user: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock('@prisma/client', () => {
  return {
    PrismaClient: vi.fn().mockImplementation(() => mockPrisma),
  };
});

describe('db singleton', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('exports a prisma client', async () => {
    const { prisma } = await import('@/lib/db');
    expect(prisma).toBeDefined();
    expect(prisma).toBe(mockPrisma);
  });

  it('reuses the same instance on repeated import in dev (HMR safety)', async () => {
    const modA = await import('@/lib/db');
    const modB = await import('@/lib/db');
    expect(modA.prisma).toBe(modB.prisma);
  });

  it('default export equals named export', async () => {
    const mod = await import('@/lib/db');
    expect(mod.default).toBe(mod.prisma);
  });
});
