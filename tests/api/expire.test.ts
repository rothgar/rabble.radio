// tests/api/expire.test.ts — POST /api/spaces/expire and /api/spaces/recording/expire

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockExpireStaleSpaces, mockExpireOldRecordings } = vi.hoisted(() => ({
  mockExpireStaleSpaces: vi.fn(),
  mockExpireOldRecordings: vi.fn(),
}));

vi.mock('@/lib/spaces', () => ({ expireStaleSpaces: mockExpireStaleSpaces }));
vi.mock('@/lib/recording', () => ({ expireOldRecordings: mockExpireOldRecordings }));

import { POST as spacesExpire } from '@/app/api/spaces/expire/route';
import { POST as recordingExpire } from '@/app/api/spaces/recording/expire/route';

function cronRequest(path: string): NextRequest {
  return new NextRequest(`https://rabble.test${path}`, { method: 'POST' });
}

const g = globalThis as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete g.__rabbleCronToken;
});

describe('POST /api/spaces/expire', () => {
  it('rejects non-cron callers in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = await spacesExpire(cronRequest('/api/spaces/expire'));
    expect(res.status).toBe(403);
  });

  it('returns the expired count', async () => {
    mockExpireStaleSpaces.mockResolvedValue(3);
    const res = await spacesExpire(cronRequest('/api/spaces/expire'));
    expect(await res.json()).toEqual({ expired: 3 });
  });

  it('returns a fixed message on failure, never the upstream error', async () => {
    mockExpireStaleSpaces.mockRejectedValue(new Error('D1_ERROR: table spaces locked'));
    const res = await spacesExpire(cronRequest('/api/spaces/expire'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: 'expire_failed',
      message: 'Failed to expire spaces.',
    });
  });
});

describe('POST /api/spaces/recording/expire', () => {
  it('rejects non-cron callers in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = await recordingExpire(cronRequest('/api/spaces/recording/expire'));
    expect(res.status).toBe(403);
  });

  it('returns the expired count', async () => {
    mockExpireOldRecordings.mockResolvedValue(2);
    const res = await recordingExpire(cronRequest('/api/spaces/recording/expire'));
    expect(await res.json()).toEqual({ expired: 2 });
  });

  it('returns a fixed message on failure, never the upstream error', async () => {
    mockExpireOldRecordings.mockRejectedValue(new Error('S3 bucket unreachable at 10.0.0.1'));
    const res = await recordingExpire(cronRequest('/api/spaces/recording/expire'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: 'expire_failed',
      message: 'Failed to expire recordings.',
    });
  });
});
