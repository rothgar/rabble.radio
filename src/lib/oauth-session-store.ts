// src/lib/oauth-session-store.ts
//
// Prisma-backed ATProto OAuth session store. Replaces the in-memory Map
// so OAuth sessions survive server restarts and can be shared across
// replicas. The store shape matches NodeSavedSessionStore from
// @atproto/oauth-client-node.

import type { NodeSavedSession, NodeSavedSessionStore } from '@atproto/oauth-client-node';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export function createPrismaSessionStore(): NodeSavedSessionStore {
  return {
    async get(key: string): Promise<NodeSavedSession | undefined> {
      try {
        const row = await prisma.oAuthSession.findUnique({
          where: { did: key },
        });
        logger.info('oauth.session_store.get', { key, found: !!row });
        if (!row) return undefined;
        return row.data as unknown as NodeSavedSession;
      } catch (error) {
        logger.error('oauth.session_store.get', {
          key,
          found: false,
          error,
        });
        return undefined;
      }
    },
    async set(key: string, value: NodeSavedSession): Promise<void> {
      try {
        await prisma.oAuthSession.upsert({
          where: { did: key },
          create: {
            did: key,
            data: value as unknown as Prisma.InputJsonValue,
          },
          update: {
            data: value as unknown as Prisma.InputJsonValue,
          },
        });
        logger.info('oauth.session_store.set', { key, success: true });
      } catch (error) {
        logger.error('oauth.session_store.set', { key, error });
        // Do not swallow — the OAuth client uses del() to signal revocation.
        throw error;
      }
    },
    async del(key: string): Promise<void> {
      try {
        await prisma.oAuthSession.deleteMany({
          where: { did: key },
        });
      } catch (error) {
        logger.error('oauth.session_store.del', { key, error });
        throw error;
      }
    },
    async clear(): Promise<void> {
      try {
        await prisma.oAuthSession.deleteMany({});
      } catch (error) {
        logger.error('oauth.session_store.clear', { error });
        throw error;
      }
    },
  };
}

