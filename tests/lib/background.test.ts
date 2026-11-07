// tests/lib/background.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ getCloudflareContext: vi.fn(), warn: vi.fn() }));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: m.getCloudflareContext }));
vi.mock('@/lib/logger', () => ({ logger: { warn: m.warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { runInBackground } from '@/lib/background';

beforeEach(() => vi.clearAllMocks());

describe('runInBackground', () => {
  it('hands the promise to waitUntil inside a Worker', async () => {
    const waitUntil = vi.fn();
    m.getCloudflareContext.mockReturnValue({ ctx: { waitUntil } });
    const task = Promise.resolve('ok');
    runInBackground(task);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await expect(waitUntil.mock.calls[0][0]).resolves.toBe('ok');
  });

  it('swallows and logs failures, with or without a Worker context', async () => {
    m.getCloudflareContext.mockImplementation(() => {
      throw new Error('no context');
    });
    runInBackground(Promise.reject(new Error('boom')), 'follows');
    await new Promise((r) => setTimeout(r, 0));
    expect(m.warn).toHaveBeenCalledWith('background.task_failed', { label: 'follows', error: 'boom' });
  });
});
