// Guard for the sweep routes the Worker's cron trigger calls.
//
// custom-worker.ts runs the OpenNext handler in-process for the scheduled
// event and stamps the request with a token it generated at isolate start
// (globalThis.__rabbleCronToken). Only requests carrying that token reach the
// sweeps, so nobody outside can trigger a full-table pass at will. Outside the
// deployed Worker (next dev, vitest) there is no token and the guard is open.

export const CRON_HEADER = 'x-rabble-cron';
const TOKEN_KEY = '__rabbleCronToken';

export function isCronRequest(request: Request): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  const token = (globalThis as Record<string, unknown>)[TOKEN_KEY];
  const sent = request.headers.get(CRON_HEADER);
  return typeof token === 'string' && token.length > 0 && sent === token;
}
