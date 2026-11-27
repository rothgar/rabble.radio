// src/lib/r2-timeout.ts
//
// Bounds an R2 call so a stalled bucket.get()/head() answers with a
// handled error instead of leaving the request's promise unsettled until
// the Workers runtime kills it as a hang — the same unbounded-await shape
// as issue #128's D1 case, but an R2 call (unlike a D1 query) can be raced
// against a plain timer.

import { logger } from '@/lib/logger';

export const R2_TIMEOUT_MS = 10_000;

export class R2TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'R2TimeoutError';
  }
}

const TIMED_OUT = Symbol('r2-timeout');

/**
 * Race an R2 call against a timer. Logs `event` through `log.error` and
 * throws `R2TimeoutError` when the timer wins instead of the call.
 */
export async function withR2Timeout<T>(
  promise: Promise<T>,
  event: string,
  fields: Record<string, unknown> = {},
  timeoutMs: number = R2_TIMEOUT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
  });
  try {
    const result = await Promise.race([promise, timeout]);
    if (result === TIMED_OUT) {
      logger.error(event, { ...fields, timeoutMs });
      throw new R2TimeoutError(`${event} timed out after ${timeoutMs}ms`);
    }
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
