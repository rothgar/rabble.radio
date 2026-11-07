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
import { runInBackground } from '@/lib/background';

export const FOLLOWS_TTL_MS = 60 * 60 * 1000;
export const FOLLOWS_MAX = 2000;
/**
 * How long a listing waits for a cold follows fetch before answering with
 * whatever pages came back so far; the rest finishes in the background and
 * lands in the cache for the next load.
 */
export const FOLLOWS_BUDGET_MS = 1200;
const PAGE = 100;
const APPVIEW = 'https://public.api.bsky.app';

interface FollowsPage {
  follows?: Array<{ did?: string }>;
  cursor?: string;
}

/**
 * Page through getFollows until the cap or the end. Throws on HTTP errors.
 * `onPage` sees each page as it arrives so callers can use partial results.
 */
export async function fetchFollowsFromBluesky(
  did: string,
  fetchImpl: typeof fetch = fetch,
  max = FOLLOWS_MAX,
  onPage?: (dids: string[]) => void
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
    const got: string[] = [];
    for (const f of page.follows ?? []) {
      if (typeof f.did === 'string') got.push(f.did);
    }
    out.push(...got);
    onPage?.(got);
    if (!page.cursor || (page.follows ?? []).length === 0) break;
    cursor = page.cursor;
  }
  return out.slice(0, max);
}

function toDate(v: unknown): Date {
  return v instanceof Date ? v : new Date(String(v));
}

function parseFollows(json: string): Set<string> {
  try {
    const arr = JSON.parse(json);
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Fetch the full follow list and store it. Throws when Bluesky fails. */
async function refreshFollows(
  did: string,
  now: Date,
  fetchImpl: typeof fetch,
  onPage?: (dids: string[]) => void
): Promise<string[]> {
  const follows = await fetchFollowsFromBluesky(did, fetchImpl, FOLLOWS_MAX, onPage);
  const json = JSON.stringify(follows);
  await prisma.followCache
    .upsert({
      where: { did },
      create: { did, follows: json, count: follows.length, fetchedAt: now },
      update: { follows: json, count: follows.length, fetchedAt: now },
    })
    .catch(() => undefined);
  return follows;
}

/**
 * Fill the follow cache for a user who just signed in, without blocking the
 * response. The home page they land on then finds it warm.
 */
export function warmFollowCache(did: string, fetchImpl: typeof fetch = fetch): void {
  runInBackground(refreshFollows(did, new Date(), fetchImpl), 'follows.warm');
}

const BUDGET_EXCEEDED = Symbol('budget');

/**
 * The DIDs the viewer follows. Serves the cache when fresh. Otherwise it
 * refreshes, but waits at most `budgetMs`: past that it answers with the
 * pages fetched so far plus the stale cache, and the refresh completes in
 * the background. Falls back to the stale cache (or nothing) when Bluesky
 * is unreachable. Never throws.
 */
export async function getFollowedDids(
  did: string | null,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch,
  budgetMs: number = FOLLOWS_BUDGET_MS
): Promise<Set<string>> {
  if (!did) return new Set();
  let cached: { follows: string; fetchedAt: Date } | null = null;
  try {
    const row = await prisma.followCache.findUnique({ where: { did } });
    if (row) cached = { follows: row.follows, fetchedAt: toDate(row.fetchedAt) };
  } catch {
    cached = null;
  }
  if (cached && now.getTime() - cached.fetchedAt.getTime() < FOLLOWS_TTL_MS) {
    return parseFollows(cached.follows);
  }
  const stale = cached ? parseFollows(cached.follows) : new Set<string>();

  const partial: string[] = [];
  const refresh = refreshFollows(did, now, fetchImpl, (dids) => partial.push(...dids));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<typeof BUDGET_EXCEEDED>((resolve) => {
    timer = setTimeout(() => resolve(BUDGET_EXCEEDED), budgetMs);
  });
  try {
    const result = await Promise.race([refresh, budget]);
    if (result === BUDGET_EXCEEDED) {
      logger.info('follows.refresh_deferred', { did, partial: partial.length });
      runInBackground(refresh, 'follows.refresh');
      return new Set([...stale, ...partial]);
    }
    return new Set(result);
  } catch (err) {
    logger.warn('follows.refresh_failed', { did, error: err instanceof Error ? err.message : String(err) });
    return stale;
  } finally {
    if (timer) clearTimeout(timer);
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
