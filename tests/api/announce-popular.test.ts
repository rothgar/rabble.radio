// tests/api/announce-popular.test.ts — POST /api/spaces/announce-popular

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockAnnouncePopularShow } = vi.hoisted(() => ({
  mockAnnouncePopularShow: vi.fn(),
}));

vi.mock('@/lib/popular-shows', () => ({ announcePopularShow: mockAnnouncePopularShow }));

import { POST as announcePopular } from '@/app/api/spaces/announce-popular/route';

function cronRequest(): NextRequest {
  return new NextRequest('https://rabble.test/api/spaces/announce-popular', { method: 'POST' });
}

const g = globalThis as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete g.__rabbleCronToken;
});

describe('POST /api/spaces/announce-popular', () => {
  it('rejects non-cron callers in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = await announcePopular(cronRequest());
    expect(res.status).toBe(403);
    expect(mockAnnouncePopularShow).not.toHaveBeenCalled();
  });

  it('returns whether a show was announced', async () => {
    mockAnnouncePopularShow.mockResolvedValue({ announced: true, spaceId: 'sp1' });
    const res = await announcePopular(cronRequest());
    expect(await res.json()).toEqual({ announced: true, spaceId: 'sp1' });
  });

  it('returns a fixed message on failure, never the upstream error', async () => {
    mockAnnouncePopularShow.mockRejectedValue(new Error('D1_ERROR: table spaces locked'));
    const res = await announcePopular(cronRequest());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: 'announce_failed',
      message: 'Failed to run the popular-show watcher.',
    });
  });
});
