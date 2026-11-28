// src/lib/popular-shows.ts
//
// Popular-show watcher (issue #175): every five-minute cron tick, pick the
// live show with the highest popularity score that hasn't been announced
// yet and has enough listeners, and post one announcement for it to
// Bluesky from the rabble.radio account. Dedup is `Space.announcedAt` — a
// show is announced at most once, ever, however long it stays live.

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  createAppPasswordSession,
  publishPopularShowAnnouncement,
  type AppPasswordSession,
} from '@/lib/atproto';
import {
  SPACE_STATUS,
  defaultPublicOrigin,
  popularityScore,
  spaceInclude,
  withTags,
  type SpaceWithHost,
} from '@/lib/spaces';

/** A show needs at least this many listeners before it's announced. */
export const MIN_LISTENERS_TO_ANNOUNCE = 10;

/**
 * Give up retrying a show's failed post after this many ticks and mark it
 * announced anyway, so a broken credential can't keep retrying forever.
 */
export const MAX_ANNOUNCE_ATTEMPTS = 3;

/**
 * The live, not-yet-announced show with the highest popularity score, or
 * null when none clears the listener threshold. Ties break oldest-show-
 * first, for a stable, deterministic pick across ticks.
 */
export async function selectShowToAnnounce(): Promise<SpaceWithHost | null> {
  const rows = await prisma.space.findMany({
    where: {
      status: SPACE_STATUS.LIVE,
      announcedAt: null,
      listenerCount: { gte: MIN_LISTENERS_TO_ANNOUNCE },
    },
    include: spaceInclude,
  });
  const candidates = rows.map(withTags);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const diff = popularityScore(b) - popularityScore(a);
    if (diff !== 0) return diff;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return candidates[0];
}

export interface AnnouncePopularShowResult {
  announced: boolean;
  spaceId?: string;
  error?: string;
}

/**
 * Bump the failure counter for a show whose announce post didn't go out.
 * After `MAX_ANNOUNCE_ATTEMPTS` failures, stamp `announcedAt` anyway.
 */
async function recordFailedAttempt(show: SpaceWithHost): Promise<void> {
  const attempts = (show.announceAttempts ?? 0) + 1;
  await prisma.space.update({
    where: { id: show.id },
    data: {
      announceAttempts: attempts,
      announcedAt: attempts >= MAX_ANNOUNCE_ATTEMPTS ? new Date() : undefined,
    },
  });
}

/**
 * Run one cron tick of the watcher: select a show, post the announcement,
 * and update its dedup state. A no-op (returns `{ announced: false }`
 * without touching the database) when `ATPROTO_APP_PROFILE_PASSWORD` isn't
 * set, so the dev Worker — which never gets this secret — never posts.
 */
export async function announcePopularShow(): Promise<AnnouncePopularShowResult> {
  const identifier = process.env.ATPROTO_APP_PROFILE_IDENTIFIER;
  const password = process.env.ATPROTO_APP_PROFILE_PASSWORD;
  if (!identifier || !password) {
    return { announced: false };
  }

  const show = await selectShowToAnnounce();
  if (!show) {
    return { announced: false };
  }

  const spaceUrl = `${defaultPublicOrigin()}/show/${show.id}`;

  let session: AppPasswordSession;
  try {
    session = await createAppPasswordSession({ identifier, password });
  } catch (err) {
    logger.error('popular_shows.announce.session_failed', { spaceId: show.id, err });
    await recordFailedAttempt(show);
    return { announced: false, spaceId: show.id, error: 'session_failed' };
  }

  const result = await publishPopularShowAnnouncement({
    session,
    title: show.title,
    hostHandle: show.host.handle,
    tags: show.tags,
    spaceUrl,
  });

  if (!result.ok) {
    logger.error('popular_shows.announce.publish_failed', {
      spaceId: show.id,
      error: result.error,
    });
    await recordFailedAttempt(show);
    return { announced: false, spaceId: show.id, error: result.error };
  }

  await prisma.space.update({
    where: { id: show.id },
    data: { announcedAt: new Date() },
  });
  return { announced: true, spaceId: show.id };
}
