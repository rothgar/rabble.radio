// src/lib/db.ts
//
// Prisma client bound to the Cloudflare D1 database. The D1 binding only
// exists inside a request (or `next dev` with initOpenNextCloudflareForDev),
// so the client is created lazily on first use and cached per binding.
//
// Callers keep using `prisma.<model>` as before; the export is a proxy that
// resolves the real client on each property access.

import { PrismaClient } from '@prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';
import { getCloudflareContext } from '@opennextjs/cloudflare';

/** The binding type the adapter accepts, without importing the Workers globals. */
type D1Database = ConstructorParameters<typeof PrismaD1>[0];

type PrismaInstance = InstanceType<typeof PrismaClient>;

const clients = new WeakMap<object, PrismaInstance>();

function getBinding(): D1Database {
  const { env } = getCloudflareContext();
  const db = (env as { DB?: D1Database }).DB;
  if (!db) {
    throw new Error('D1 binding "DB" is not configured; see wrangler.jsonc.');
  }
  return db;
}

function getClient(): PrismaInstance {
  const db = getBinding();
  let client = clients.get(db);
  if (!client) {
    client = new PrismaClient({
      adapter: new PrismaD1(db),
      log: ['error', 'warn'],
    });
    clients.set(db, client);
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
