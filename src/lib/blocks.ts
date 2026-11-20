// src/lib/blocks.ts
//
// Who a signed-in user has blocked on Bluesky, used to hide those people's
// hosts and shows from popular listings. Unlike follows, the block list is
// private to the caller (app.bsky.graph.getBlocks needs an authenticated
// request), so it's fetched through the OAuth session in @/lib/atproto and
// skipped entirely for anonymous listeners. Cached per user in BlockCache
// for an hour, same shape and budget-with-background-refresh as follows.ts.

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { runInBackground } from '@/lib/background';
import { fetchBlockedDids as fetchBlockedDidsFromBluesky } from '@/lib/atproto';

export const BLOCKS_TTL_MS = 60 * 60 * 1000;
/** How long a listing waits for a cold blocks fetch before falling back to the stale cache. */
export const BLOCKS_BUDGET_MS = 1200;

function toDate(v: unknown): Date {
  return v instanceof Date ? v : new Date(String(v));
}

function parseBlocks(json: string): Set<string> {
  try {
    const arr = JSON.parse(json);
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Fetch the full block list and store it. Throws when Bluesky fails. */
async function refreshBlocks(did: string, now: Date): Promise<string[]> {
  const blocks = await fetchBlockedDidsFromBluesky(did);
  const json = JSON.stringify(blocks);
  await prisma.blockCache
    .upsert({
      where: { did },
      create: { did, blocks: json, count: blocks.length, fetchedAt: now },
      update: { blocks: json, count: blocks.length, fetchedAt: now },
    })
    .catch(() => undefined);
  return blocks;
}

/**
 * Fill the block cache for a user who just signed in, without blocking the
 * response. The home and hosts pages they land on then find it warm.
 */
export function warmBlockCache(did: string): void {
  runInBackground(refreshBlocks(did, new Date()), 'blocks.warm');
}

const BUDGET_EXCEEDED = Symbol('budget');

/**
 * The DIDs the viewer has blocked. Serves the cache when fresh. Otherwise it
 * refreshes through the viewer's OAuth session, but waits at most
 * `budgetMs`: past that it answers with the stale cache and the refresh
 * completes in the background. Falls back to the stale cache (or nothing)
 * when the session can't be restored or Bluesky is unreachable. Never
 * throws. Returns an empty set for anonymous viewers.
 */
export async function getBlockedDids(
  did: string | null,
  now: Date = new Date(),
  budgetMs: number = BLOCKS_BUDGET_MS
): Promise<Set<string>> {
  if (!did) return new Set();
  let cached: { blocks: string; fetchedAt: Date } | null = null;
  try {
    const row = await prisma.blockCache.findUnique({ where: { did } });
    if (row) cached = { blocks: row.blocks, fetchedAt: toDate(row.fetchedAt) };
  } catch {
    cached = null;
  }
  if (cached && now.getTime() - cached.fetchedAt.getTime() < BLOCKS_TTL_MS) {
    return parseBlocks(cached.blocks);
  }
  const stale = cached ? parseBlocks(cached.blocks) : new Set<string>();

  const refresh = refreshBlocks(did, now);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<typeof BUDGET_EXCEEDED>((resolve) => {
    timer = setTimeout(() => resolve(BUDGET_EXCEEDED), budgetMs);
  });
  try {
    const result = await Promise.race([refresh, budget]);
    if (result === BUDGET_EXCEEDED) {
      logger.info('blocks.refresh_deferred', { did });
      runInBackground(refresh, 'blocks.refresh');
      return stale;
    }
    return new Set(result);
  } catch (err) {
    logger.warn('blocks.refresh_failed', { did, error: err instanceof Error ? err.message : String(err) });
    return stale;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
