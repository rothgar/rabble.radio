// tests/lib/cron.test.ts

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CRON_HEADER, isCronRequest } from '@/lib/cron';

const g = globalThis as Record<string, unknown>;

function request(token?: string): Request {
  return new Request('https://rabble.test/api/spaces/expire', {
    method: 'POST',
    headers: token === undefined ? {} : { [CRON_HEADER]: token },
  });
}

describe('isCronRequest', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete g.__rabbleCronToken;
  });

  it('is open outside production so next dev and tests can call the sweeps', () => {
    vi.stubEnv('NODE_ENV', 'test');
    expect(isCronRequest(request())).toBe(true);
  });

  it('rejects requests without the isolate token in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    g.__rabbleCronToken = 'secret-token';
    expect(isCronRequest(request())).toBe(false);
    expect(isCronRequest(request('1'))).toBe(false);
    expect(isCronRequest(request('secret-token'))).toBe(true);
  });

  it('rejects everything in production when the scheduled handler never ran', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(isCronRequest(request(''))).toBe(false);
    expect(isCronRequest(request('anything'))).toBe(false);
  });
});
