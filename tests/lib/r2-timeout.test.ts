// tests/lib/r2-timeout.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: m.error } }));

import { withR2Timeout, R2TimeoutError } from '@/lib/r2-timeout';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('withR2Timeout', () => {
  it('resolves with the call result when it settles before the timeout', async () => {
    await expect(withR2Timeout(Promise.resolve('object'), 'test.timeout', {}, 50)).resolves.toBe('object');
    expect(m.error).not.toHaveBeenCalled();
  });

  it('throws R2TimeoutError and logs when the call never settles', async () => {
    vi.useFakeTimers();
    try {
      const never = new Promise(() => undefined);
      const pending = withR2Timeout(never, 'test.timeout', { file: 'x.mp3' }, 1000);
      const assertion = expect(pending).rejects.toBeInstanceOf(R2TimeoutError);
      await vi.advanceTimersByTimeAsync(1000);
      await assertion;
      expect(m.error).toHaveBeenCalledWith('test.timeout', { file: 'x.mp3', timeoutMs: 1000 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('propagates a rejection from the call itself', async () => {
    await expect(withR2Timeout(Promise.reject(new Error('r2 down')), 'test.timeout', {}, 50)).rejects.toThrow(
      'r2 down'
    );
    expect(m.error).not.toHaveBeenCalled();
  });
});
