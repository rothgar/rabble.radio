// src/lib/follows.ts
//
// Who a signed-in user follows on Bluesky, and who is currently in a room.
//
// Follows come from the public AppView (app.bsky.graph.getFollows needs no
// auth: follow lists are public). They are cached per user in FollowCache
// for an hour and capped at FOLLOWS_MAX so one home-page load never pages
// through a huge graph. Presence comes from ShowParticipation rows without
// a leftAt, which the LiveKit webhook maintains.

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export const FOLLOWS_TTL_MS = 60 * 60 * 1000;
export const FOLLOWS_MAX = 2000;
const PAGE = 100;
const APPVIEW = 'https://public.api.bsky.app';

interface FollowsPage {
  follows?: Array<{ did?: string }>;
  cursor?: string;
}

/** Page through getFollows until the cap or the end. Throws on HTTP errors. */
export async function fetchFollowsFromBluesky(
  did: string,
  fetchImpl: typeof fetch = fetch,
  max = FOLLOWS_MAX
): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | undefined;
  while (out.length < max) {
    const url = new URL('/xrpc/app.bsky.graph.getFollows', APPVIEW);
    url.searchParams.set('actor', did);
    url.searchParams.set('limit', String(PAGE));
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetchImpl(url.toString(), { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`getFollows failed: HTTP ${res.status}`);
    const page = (await res.json()) as FollowsPage;
    for (const f of page.follows ?? []) {
      if (typeof f.did === 'string') out.push(f.did);
    }
    if (!page.cursor || (page.follows ?? []).length === 0) break;
    cursor = page.cursor;
  }
  return out.slice(0, max);
}

function toDate(v: unknown): Date {
  return v instanceof Date ? v : new Date(String(v));
}

/**
 * The DIDs the viewer follows. Serves the cache when fresh, refreshes it
 * otherwise, and falls back to the stale cache (or nothing) when Bluesky
 * is unreachable. Never throws.
 */
export async function getFollowedDids(
  did: string | null,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch
): Promise<Set<string>> {
  if (!did) return new Set();
  let cached: { follows: string; fetchedAt: Date } | null = null;
  try {
    const row = await prisma.followCache.findUnique({ where: { did } });
    if (row) cached = { follows: row.follows, fetchedAt: toDate(row.fetchedAt) };
  } catch {
    cached = null;
  }
  const parse = (json: string): Set<string> => {
    try {
      const arr = JSON.parse(json);
      return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []);
    } catch {
      return new Set();
    }
  };
  if (cached && now.getTime() - cached.fetchedAt.getTime() < FOLLOWS_TTL_MS) {
    return parse(cached.follows);
  }
  try {
    const follows = await fetchFollowsFromBluesky(did, fetchImpl);
    const json = JSON.stringify(follows);
    await prisma.followCache
      .upsert({
        where: { did },
        create: { did, follows: json, count: follows.length, fetchedAt: now },
        update: { follows: json, count: follows.length, fetchedAt: now },
      })
      .catch(() => undefined);
    return new Set(follows);
  } catch (err) {
    logger.warn('follows.refresh_failed', { did, error: err instanceof Error ? err.message : String(err) });
    return cached ? parse(cached.follows) : new Set();
  }
}

/** Signed-in identities currently in each room (host, stage and audience). */
export async function getPresentIdentities(spaceIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (spaceIds.length === 0) return out;
  const rows = await prisma.showParticipation.findMany({
    where: { spaceId: { in: spaceIds }, leftAt: null, anonymous: false },
    select: { spaceId: true, identity: true },
  });
  for (const r of rows) {
    const list = out.get(r.spaceId) ?? [];
    if (!list.includes(r.identity)) list.push(r.identity);
    out.set(r.spaceId, list);
  }
  return out;
}
