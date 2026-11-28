// src/lib/db.ts
//
// Prisma client bound to the Cloudflare D1 database. The D1 binding only
// exists inside a request (or `next dev` with initOpenNextCloudflareForDev),
// so the client is created lazily on first use and cached per request.
//
// Cached per request's ExecutionContext, not per D1 binding (issue #214):
// `env.DB` is the same object on every request in an isolate, so keying the
// cache by it gave every request in that isolate one shared client. Prisma's
// DataLoader merges same-tick `findUnique` calls on one model into a single
// query, so one request's I/O could carry another's lookup; when the first
// request's context ended before the merged query settled, the second
// request awaited a promise that would never resolve, and the Workers
// runtime canceled it as hung. One client per `ctx` keeps every request's
// queries, and their DataLoader batching, within that request alone.
//
// Callers keep using `prisma.<model>` as before; the export is a proxy that
// resolves the real client on each property access.

import { PrismaClient } from '@prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { logger } from '@/lib/logger';

/** The binding type the adapter accepts, without importing the Workers globals. */
type D1Database = ConstructorParameters<typeof PrismaD1>[0];

type PrismaInstance = InstanceType<typeof PrismaClient>;

const clients = new WeakMap<object, PrismaInstance>();

function getContext(): { db: D1Database; ctx: object } {
  const { env, ctx } = getCloudflareContext();
  const db = (env as { DB?: D1Database }).DB;
  if (!db) {
    throw new Error('D1 binding "DB" is not configured; see wrangler.jsonc.');
  }
  return { db, ctx: ctx as object };
}

let queryCounter = 0;

// Logs the start and end of every D1 query so a request the Workers runtime
// cancels as "hung" (issue #128: the query's own promise never settles, so
// nothing ever throws) still leaves a `db.query.start` with no matching
// `db.query.done`/`db.query.failed` to identify which call hung. Args are
// deliberately not logged, and a failure logs only the error's name and
// code: Prisma's own `PrismaClientValidationError.message` embeds the full
// call arguments for debuggability, so logging the error as-is would leak
// the same DIDs, tokens or other viewer data args are kept out for.
//
// The hook is top-level (`query.$allOperations`), not nested under
// `$allModels`: nested under `$allModels` it only sees model methods
// (`user.findMany`, etc) and misses `$queryRaw`/`$executeRaw` (src/lib/users.ts,
// src/app/api/health/route.ts) and the statements inside `$transaction`
// (src/lib/metrics.ts, src/lib/reaction-buffer.ts) — confirmed against the
// local D1 adapter, which runs `$transaction` as individual queries anyway
// since D1 has no real transactions. Top-level catches all of these without
// double-logging the model ops a nested `$allModels` hook would also catch.
function withQueryTelemetry(client: PrismaInstance): PrismaInstance {
  return client.$extends({
    name: 'query-telemetry',
    query: {
      async $allOperations({ model, operation, args, query }) {
        const queryId = `d1q_${(++queryCounter).toString(36)}`;
        const startedAt = Date.now();
        logger.info('db.query.start', { queryId, model, operation });
        try {
          const result = await query(args);
          logger.info('db.query.done', {
            queryId,
            model,
            operation,
            durationMs: Date.now() - startedAt,
          });
          return result;
        } catch (err) {
          logger.error('db.query.failed', {
            queryId,
            model,
            operation,
            durationMs: Date.now() - startedAt,
            errorName: err instanceof Error ? err.name : typeof err,
            errorCode: (err as { code?: unknown })?.code,
          });
          throw err;
        }
      },
    },
  }) as unknown as PrismaInstance;
}

function getClient(): PrismaInstance {
  const { db, ctx } = getContext();
  let client = clients.get(ctx);
  if (!client) {
    const base = new PrismaClient({
      adapter: new PrismaD1(db),
      log: ['error', 'warn'],
    });
    client = withQueryTelemetry(base);
    clients.set(ctx, client);
  }
  return client;
}

export const prisma: PrismaInstance = new Proxy({} as PrismaInstance, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop) as unknown;
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(client) : value;
  },
});

export default prisma;
