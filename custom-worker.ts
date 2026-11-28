// Worker entrypoint: the OpenNext fetch handler plus a cron trigger that runs
// the expire sweep (stale shows and old recordings) and the popular-show
// watcher (issue #175) through the app's own routes, so they share the
// app's database and LiveKit configuration.
// @ts-expect-error generated at build time by `opennextjs-cloudflare build`
import { default as handler } from './.open-next/worker.js';
import { withSecurityHeaders } from './src/lib/security-headers';
import { downloadFileFromPath, serveDownload, type R2ObjectLike as DownloadObjectLike } from './src/lib/downloads';
import { musicFileFromPath, serveMusic } from './src/lib/music';

// Minimal local types: this file is excluded from the app's tsconfig so the
// Workers global types do not leak into the Next.js program. The binding
// covers both src/lib/downloads.ts and src/lib/music.ts, which each need a
// different slice of R2Bucket.
interface Env {
  PUBLIC_URL?: string;
  RECORDINGS?: {
    get(key: string, options?: { range?: { offset: number; length: number } }): Promise<DownloadObjectLike | null>;
    head(key: string): Promise<{ size: number } | null>;
  };
}
interface Ctx {
  waitUntil(promise: Promise<unknown>): void;
}

export default {
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    // Mobile builds and pre-show music go straight from R2 to the client,
    // outside Next.js, so the response keeps its content-length
    // (src/lib/downloads.ts, src/lib/music.ts).
    if (request.method === 'GET' || request.method === 'HEAD') {
      const pathname = new URL(request.url).pathname;
      const downloadFile = downloadFileFromPath(pathname);
      if (downloadFile !== null) {
        return withSecurityHeaders(await serveDownload(downloadFile, request.method, env.RECORDINGS));
      }
      const musicFile = musicFileFromPath(pathname);
      if (musicFile !== null) {
        const range = request.headers.get('range');
        return withSecurityHeaders(await serveMusic(musicFile, request.method, range, env.RECORDINGS));
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
    for (const path of [
      '/api/spaces/expire',
      '/api/spaces/recording/expire',
      '/api/spaces/announce-popular',
    ]) {
      const request = new Request(`${base}${path}`, { method: 'POST', headers });
      ctx.waitUntil(handler.fetch(request, env, ctx));
    }
  },
};

// @ts-expect-error generated at build time
export { DOQueueHandler, DOShardedTagCache } from './.open-next/worker.js';
