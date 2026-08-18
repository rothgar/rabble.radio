// tests/api/health.test.ts
//
// Exercises GET /api/health. Mocks prisma.$queryRaw and global fetch so we
// can drive the db/livekit check results deterministically.

import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockQueryRaw = vi.fn();
const mockFetch = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: { $queryRaw: mockQueryRaw },
}));

const realFetch = global.fetch;

describe('GET /api/health', () => {
  it('returns ok when both db and livekit checks pass', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    mockFetch.mockResolvedValueOnce({ status: 200 } as Response);
    global.fetch = mockFetch as unknown as typeof fetch;
    process.env.LIVEKIT_URL = 'ws://livekit:7880';
    try {
      const { GET } = await import('@/app/api/health/route');
      const res = await GET(new NextRequest('http://localhost/api/health'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.checks).toEqual({ db: true, livekit: true });
      expect(body.timestamp).toBeTruthy();
      expect(body.uptime).toBeGreaterThanOrEqual(0);
      expect(body.service).toBe('rabble');
    } finally {
      global.fetch = realFetch;
    }
  });

  it('returns degraded when only livekit is unreachable', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    mockFetch.mockRejectedValueOnce(new Error('econnrefused'));
    global.fetch = mockFetch as unknown as typeof fetch;
    process.env.LIVEKIT_URL = 'ws://livekit:7880';
    try {
      const { GET } = await import('@/app/api/health/route');
      const res = await GET(new NextRequest('http://localhost/api/health'));
      const body = await res.json();
      expect(body.status).toBe('degraded');
      expect(body.checks.db).toBe(true);
      expect(body.checks.livekit).toBe(false);
    } finally {
      global.fetch = realFetch;
    }
  });

  it('returns down when db fails and livekit unreachable', async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error('db down'));
    mockFetch.mockRejectedValueOnce(new Error('econnrefused'));
    global.fetch = mockFetch as unknown as typeof fetch;
    process.env.LIVEKIT_URL = 'ws://livekit:7880';
    try {
      const { GET } = await import('@/app/api/health/route');
      const res = await GET(new NextRequest('http://localhost/api/health'));
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.status).toBe('down');
      expect(body.checks.db).toBe(false);
      expect(body.checks.livekit).toBe(false);
    } finally {
      global.fetch = realFetch;
    }
  });

  it('reports degraded when LIVEKIT_URL is unset', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    delete process.env.LIVEKIT_URL;
    try {
      const { GET } = await import('@/app/api/health/route');
      const res = await GET(new NextRequest('http://localhost/api/health'));
      const body = await res.json();
      expect(body.checks.db).toBe(true);
      expect(body.checks.livekit).toBe(false);
    } finally {
      process.env.LIVEKIT_URL = 'ws://livekit:7880';
    }
  });
});
