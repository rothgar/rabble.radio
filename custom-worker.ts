// Worker entrypoint: the OpenNext fetch handler plus a cron trigger that runs
// the expire sweep (stale shows and old recordings) through the app's own
// route, so the sweep shares the app's database and LiveKit configuration.
// @ts-expect-error generated at build time by `opennextjs-cloudflare build`
import { default as handler } from './.open-next/worker.js';

// Minimal local types: this file is excluded from the app's tsconfig so the
// Workers global types do not leak into the Next.js program.
interface Env {
  PUBLIC_URL?: string;
}
interface Ctx {
  waitUntil(promise: Promise<unknown>): void;
}

export default {
  fetch: handler.fetch,

  async scheduled(_event: unknown, env: Env, ctx: Ctx) {
    const base = env.PUBLIC_URL ?? 'https://rabble.rodeo';
    const request = new Request(`${base}/api/spaces/expire`, {
      method: 'POST',
      headers: { 'x-rabble-cron': '1' },
    });
    ctx.waitUntil(handler.fetch(request, env, ctx));
  },
};

// @ts-expect-error generated at build time
export { DOQueueHandler, DOShardedTagCache } from './.open-next/worker.js';
