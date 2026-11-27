// Worker entrypoint: the OpenNext fetch handler plus a cron trigger that runs
// the expire sweep (stale shows and old recordings) through the app's own
// route, so the sweep shares the app's database and LiveKit configuration.
// @ts-expect-error generated at build time by `opennextjs-cloudflare build`
import { default as handler } from './.open-next/worker.js';
import { withSecurityHeaders } from './src/lib/security-headers';
import { downloadFileFromPath, serveDownload, type R2BucketLike } from './src/lib/downloads';

// Minimal local types: this file is excluded from the app's tsconfig so the
// Workers global types do not leak into the Next.js program.
interface Env {
  PUBLIC_URL?: string;
  RECORDINGS?: R2BucketLike;
}
interface Ctx {
  waitUntil(promise: Promise<unknown>): void;
}

export default {
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    // Mobile builds go straight from R2 to the client, outside Next.js, so
    // the response keeps its content-length (src/lib/downloads.ts).
    if (request.method === 'GET' || request.method === 'HEAD') {
      const file = downloadFileFromPath(new URL(request.url).pathname);
      if (file !== null) {
        return withSecurityHeaders(await serveDownload(file, request.method, env.RECORDINGS));
      }
    }
    return withSecurityHeaders(await handler.fetch(request, env, ctx));
  },

  async scheduled(_event: unknown, env: Env, ctx: Ctx) {
    const base = env.PUBLIC_URL ?? 'https://rabble.rodeo';
    // Per-isolate token checked by src/lib/cron.ts: the sweep routes accept
    // only requests this handler makes in-process, never outside callers.
    const g = globalThis as Record<string, unknown>;
    if (typeof g.__rabbleCronToken !== 'string') g.__rabbleCronToken = crypto.randomUUID();
    const headers = { 'x-rabble-cron': g.__rabbleCronToken as string };
    for (const path of ['/api/spaces/expire', '/api/spaces/recording/expire']) {
      const request = new Request(`${base}${path}`, { method: 'POST', headers });
      ctx.waitUntil(handler.fetch(request, env, ctx));
    }
  },
};

// @ts-expect-error generated at build time
export { DOQueueHandler, DOShardedTagCache } from './.open-next/worker.js';
