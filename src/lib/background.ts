// src/lib/background.ts
//
// Keep a promise running after the response is sent. On Cloudflare Workers
// that needs `ctx.waitUntil`, otherwise the isolate is torn down with the
// response and the work never finishes. Outside a Worker (tests, next dev)
// the promise simply runs on its own.

import { getCloudflareContext } from '@opennextjs/cloudflare';
import { logger } from '@/lib/logger';

export function runInBackground(task: Promise<unknown>, label = 'background'): void {
  const guarded = task.catch((err: unknown) => {
    logger.warn('background.task_failed', { label, error: err instanceof Error ? err.message : String(err) });
  });
  try {
    getCloudflareContext().ctx.waitUntil(guarded);
  } catch {
    // No Workers context: nothing to attach to, the promise keeps running.
  }
}
