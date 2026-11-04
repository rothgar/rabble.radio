// src/lib/oauth-session-store.ts
//
// Prisma-backed stores for the atproto OAuth client. D1 has no JSON column,
// so both the session (keyed by DID) and the in-flight authorization state
// (keyed by the `state` parameter) are stored as JSON text.
//
// Both stores must be shared storage: Workers isolates do not share memory,
// so the callback can land on a different isolate than the one that started
// the authorization.

import { JoseKey } from '@atproto/jwk-jose';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

/** The store shape the atproto OAuth client expects. */
export interface SimpleStore<V> {
  get(key: string): Promise<V | undefined>;
  set(key: string, value: V): Promise<void>;
  del(key: string): Promise<void>;
  clear(): Promise<void>;
}

function parse<V>(raw: string, key: string, what: string): V | undefined {
  try {
    return JSON.parse(raw) as V;
  } catch (error) {
    logger.error(`oauth.${what}.parse_failed`, { key, error });
    return undefined;
  }
}

/**
 * The OAuth client keeps a live `Key` instance (`dpopKey`) in both the
 * authorization state and the session. JSON.stringify turns it into a plain
 * object, and the client then crashes on the callback ("Cannot read
 * properties of undefined (reading 'includes')" from the DPoP signer). This
 * mirrors `toDpopKeyStore` from @atproto/oauth-client-node: persist the
 * private JWK and rebuild the key on read.
 */
export function withDpopKey<V>(store: SimpleStore<V>): SimpleStore<V> {
  return {
    async get(key) {
      const value = (await store.get(key)) as (Record<string, unknown> & { dpopJwk?: unknown }) | undefined;
      if (!value || typeof value !== 'object' || !value.dpopJwk) return value as V | undefined;
      const { dpopJwk, ...rest } = value;
      const dpopKey = await JoseKey.fromJWK(dpopJwk as Parameters<typeof JoseKey.fromJWK>[0]);
      return { ...rest, dpopKey } as V;
    },
    async set(key, value) {
      const v = value as Record<string, unknown> & { dpopKey?: { privateJwk?: unknown } };
      if (v && typeof v === 'object' && v.dpopKey && typeof v.dpopKey === 'object') {
        const { dpopKey, ...rest } = v;
        if (!dpopKey.privateJwk) throw new Error('Private DPoP JWK is missing.');
        await store.set(key, { ...rest, dpopJwk: dpopKey.privateJwk } as V);
        return;
      }
      await store.set(key, value);
    },
    del: (key) => store.del(key),
    clear: () => store.clear(),
  };
}

export function createPrismaSessionStore<V>(): SimpleStore<V> {
  return withDpopKey(createRawSessionStore<V>());
}

function createRawSessionStore<V>(): SimpleStore<V> {
  return {
    async get(key) {
      try {
        const row = await prisma.oAuthSession.findUnique({ where: { did: key } });
        logger.info('oauth.session_store.get', { key, found: !!row });
        if (!row) return undefined;
        return parse<V>(row.data, key, 'session_store');
      } catch (error) {
        logger.error('oauth.session_store.get', { key, found: false, error });
        return undefined;
      }
    },
    async set(key, value) {
      const data = JSON.stringify(value);
      try {
        await prisma.oAuthSession.upsert({
          where: { did: key },
          create: { did: key, data },
          update: { data },
        });
        logger.info('oauth.session_store.set', { key, success: true });
      } catch (error) {
        logger.error('oauth.session_store.set', { key, error });
        throw error;
      }
    },
    async del(key) {
      try {
        await prisma.oAuthSession.deleteMany({ where: { did: key } });
      } catch (error) {
        logger.error('oauth.session_store.del', { key, error });
        throw error;
      }
    },
    async clear() {
      try {
        await prisma.oAuthSession.deleteMany({});
      } catch (error) {
        logger.error('oauth.session_store.clear', { error });
        throw error;
      }
    },
  };
}

/** Authorization state lives for the duration of one login attempt. */
export const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

export function createPrismaStateStore<V>(): SimpleStore<V> {
  return withDpopKey(createRawStateStore<V>());
}

function createRawStateStore<V>(): SimpleStore<V> {
  return {
    async get(key) {
      const row = await prisma.oAuthState.findUnique({ where: { key } });
      if (!row) return undefined;
      if (Date.now() - row.createdAt.getTime() > OAUTH_STATE_TTL_MS) {
        await prisma.oAuthState.deleteMany({ where: { key } });
        return undefined;
      }
      return parse<V>(row.data, key, 'state_store');
    },
    async set(key, value) {
      const data = JSON.stringify(value);
      await prisma.oAuthState.upsert({
        where: { key },
        create: { key, data },
        update: { data, createdAt: new Date() },
      });
    },
    async del(key) {
      await prisma.oAuthState.deleteMany({ where: { key } });
    },
    async clear() {
      await prisma.oAuthState.deleteMany({});
    },
  };
}
