// src/lib/spaces.ts
//
// Service functions for the Space model. All Prisma access for spaces goes
// through here so the API routes and server components stay thin.

import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import { getRoomParticipantSummary, roomNameForSpace } from '@/lib/livekit';
import { normalizeTags } from '@/lib/tags';
import { endShowSession } from '@/lib/metrics';
import type { PublicHost, PublicSpace } from '@/types';

// Local model shapes that mirror the Prisma schema. We define them by hand so
// the service module compiles even when the generated Prisma client is not
// available in the build environment (CI / typecheck without engine fetch).
export interface SpaceModel {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  hostId: string;
  isLive: boolean;
  scheduledAt: Date | null;
  expiresAt: Date | null;
  emptySince: Date | null;
  status: string;
  listenerCount: number;
  speakerCount: number;
  reactionCount: number;
  likeCount: number;
  sessionCount: number;
  totalListeners: number;
  hostedSeconds: number;
  lastLiveAt: Date | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface HostUser {
  id: string;
  did: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type SpaceWithHost = SpaceModel & {
  host: HostUser;
};

export interface CreateSpaceInput {
  title: string;
  description?: string | null;
  hostId: string;
  /** Up to 3 category tags (validated against the YouTube category list). */
  tags?: string[];
  /**
   * Optional ISO string or Date for when the space is scheduled to go live.
   * If null/undefined the space is "active" immediately and gets a 24h
   * `expiresAt`. If set and in the future, the space starts as "scheduled"
   * and `expiresAt` is left null until after the scheduled time passes.
   */
  scheduledAt?: Date | string | null;
}

export interface CreateSpaceOptions {
  /** Override slug generation; primarily for tests. */
  slugFactory?: () => string;
  /** Override "now" for tests. */
  now?: () => Date;
}

const SUFFIX_LENGTH = 8;

/** Status constants used by the scheduling feature. */
export const SPACE_STATUS = {
  SCHEDULED: 'scheduled',
  ACTIVE: 'active',
  LIVE: 'live',
  ENDED: 'ended',
  EXPIRED: 'expired',
} as const;
export type SpaceStatus = (typeof SPACE_STATUS)[keyof typeof SPACE_STATUS];

/** How long an empty room stays around before the occupancy sweep expires it. */
export const EMPTY_SPACE_TTL_MS = 10 * 60 * 1000;

/**
 * Hard upper bound for how long an active space can stay around before the
 * fallback sweep expires it, regardless of occupancy. Kept much larger than
 * EMPTY_SPACE_TTL_MS so occupancy is the primary expiry driver.
 */
export const ACTIVE_SPACE_TTL_MS = 24 * 60 * 60 * 1000;

/** Visibility window for a scheduled space (show for ~1h after start). */
export const SCHEDULED_VISIBILITY_WINDOW_MS = 60 * 60 * 1000;

/** Skip recently-created rows when running the expiration sweep. */
export const EXPIRATION_GRACE_MS = 5 * 60 * 1000;

/**
 * Generate a short, URL-safe random suffix (base36) for slug uniqueness.
 */
export function generateSlugSuffix(length: number = SUFFIX_LENGTH): string {
  const bytes = randomBytes(8);
  let suffix = '';
  for (const byte of bytes) {
    suffix += (byte % 36).toString(36);
    if (suffix.length >= length) break;
  }
  return suffix.slice(0, length);
}

/**
 * Generate a URL-safe slug for a space. The suffix is a short random string so
 * the result is globally unique without an extra database round-trip.
 *
 * If `title` is provided, the slug is `<slugified-title>-<suffix>`; otherwise
 * the slug is just `<suffix>`.
 */
export function buildSpaceSlug(title: string, suffix?: string): string {
  const tail = suffix ?? generateSlugSuffix();
  const slugified = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slugified ? `${slugified}-${tail}` : tail;
}

/**
 * Normalize a `scheduledAt` input (Date, ISO string, or null/undefined) into
 * either a valid Date or null. Throws if the value is the wrong type or
 * unparseable.
 */
function normalizeScheduledAt(
  value: Date | string | null | undefined
): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error('scheduledAt is not a valid date.');
    }
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) {
      throw new Error('scheduledAt is not a valid ISO date string.');
    }
    return d;
  }
  throw new Error('scheduledAt must be a Date, ISO string, or null.');
}

/**
 * Create a new Space row. Throws if the host does not exist or if the slug
 * generator collides (callers should retry with a different suffix).
 */
export async function createSpace(
  input: CreateSpaceInput,
  options: CreateSpaceOptions = {}
): Promise<SpaceWithHost> {
  const title = input.title.trim();
  if (!title) {
    throw new Error('Title is required.');
  }

  const host = await prisma.user.findUnique({
    where: { did: input.hostId },
    select: { did: true },
  });
  if (!host) {
    throw new Error(`Host user not found: ${input.hostId}`);
  }

  const slugFactory = options.slugFactory ?? (() => buildSpaceSlug(title));
  const slug = slugFactory();

  const description =
    input.description && input.description.trim().length > 0
      ? input.description.trim()
      : null;

  const tags = normalizeTags(input.tags);

  const now = (options.now ?? (() => new Date()))();
  const scheduledAt = normalizeScheduledAt(input.scheduledAt);

  const isFutureSchedule =
    scheduledAt !== null && scheduledAt.getTime() > now.getTime();

  const status: SpaceStatus = isFutureSchedule
    ? SPACE_STATUS.SCHEDULED
    : SPACE_STATUS.ACTIVE;

  // For immediate spaces, the room starts empty, so start the empty
  // countdown now (it expires EMPTY_SPACE_TTL_MS later if nobody joins).
  // expiresAt is a hard upper-bound fallback for the sweep.
  // For scheduled spaces, leave expiresAt/emptySince null until they go live.
  const expiresAt = isFutureSchedule
    ? null
    : new Date(now.getTime() + EMPTY_SPACE_TTL_MS);
  const emptySince = isFutureSchedule ? null : now;

  return prisma.space.create({
    data: {
      slug,
      title,
      description,
      tags,
      hostId: input.hostId,
      scheduledAt,
      expiresAt,
      emptySince,
      status,
    },
    include: { host: true },
  });
}

/**
 * List spaces ordered by creation time descending. Includes the host profile.
 */
export async function getSpaces(): Promise<SpaceWithHost[]> {
  return prisma.space.findMany({
    orderBy: { createdAt: 'desc' },
    include: { host: true },
  });
}

/**
 * Fetch a space by primary key with its host profile, or null if not found.
 */
export async function getSpaceById(id: string): Promise<SpaceWithHost | null> {
  return prisma.space.findUnique({
    where: { id },
    include: { host: true },
  });
}

/**
 * Fetch a space by its slug with its host profile, or null if not found.
 */
export async function getSpaceBySlug(slug: string): Promise<SpaceWithHost | null> {
  return prisma.space.findUnique({
    where: { slug },
    include: { host: true },
  });
}

/**
 * Update the scheduling state of a space (used by the live API to transition
 * between active/scheduled/live/ended). The host column is always kept in sync
 * with `status`/`isLive` for backwards compatibility.
 */
export async function setSpaceLive(
  id: string,
  isLive: boolean
): Promise<SpaceWithHost> {
  const now = new Date();
  const status: SpaceStatus = isLive
    ? SPACE_STATUS.LIVE
    : SPACE_STATUS.ACTIVE;
  // Going live means the host is in the room, so it is occupied (no hard
  // deadline, emptySince null). Ending the live state re-arms the hard
  // fallback deadline and starts the empty countdown; the occupancy sweep
  // corrects emptySince if participants remain.
  const expiresAt = isLive
    ? null
    : new Date(now.getTime() + ACTIVE_SPACE_TTL_MS);
  const emptySince = isLive ? null : now;
  return prisma.space.update({
    where: { id },
    data: {
      isLive,
      status,
      expiresAt,
      emptySince,
    },
    include: { host: true },
  });
}

/**
 * Mark a single space as expired.
 */
export async function expireSpace(id: string): Promise<SpaceWithHost> {
  await endShowSession({ spaceId: id });
  return prisma.space.update({
    where: { id },
    data: {
      isLive: false,
      status: SPACE_STATUS.EXPIRED,
    },
    include: { host: true },
  });
}

/**
 * Sweep stale spaces. Two passes:
 *
 *  1. Hard-TTL fallback: expire `active` spaces that are past their
 *     `expiresAt` and haven't been touched recently (belt-and-suspenders so
 *     abandoned rooms still clean up even if LiveKit is unreachable).
 *  2. Occupancy-based: for `active`/`live` spaces, check the LiveKit room
 *     and expire any that have been empty for longer than EMPTY_SPACE_TTL_MS.
 *     If a room is occupied, its `emptySince` clock is reset. While we are
 *     querying LiveKit we also refresh the `listenerCount`/`speakerCount`
 *     occupancy metrics.
 *
 * Returns the total number of rows transitioned to 'expired'.
 */
export async function expireStaleSpaces(
  now: Date = new Date()
): Promise<number> {
  let expired = 0;

  // 1) Hard-TTL fallback for unscheduled active spaces.
  const graceCutoff = new Date(now.getTime() - EXPIRATION_GRACE_MS);
  const fallback = await prisma.space.updateMany({
    where: {
      status: SPACE_STATUS.ACTIVE,
      scheduledAt: null,
      expiresAt: { lt: now },
      updatedAt: { lt: graceCutoff },
    },
    data: {
      isLive: false,
      status: SPACE_STATUS.EXPIRED,
    },
  });
  expired += fallback.count;

  // 2) Occupancy-based sweep for active/live spaces.
  const candidates = await prisma.space.findMany({
    where: { status: { in: [SPACE_STATUS.ACTIVE, SPACE_STATUS.LIVE] } },
    select: { id: true, emptySince: true },
  });
  for (const space of candidates) {
    const roomName = roomNameForSpace(space.id);
    const summary = await getRoomParticipantSummary(roomName);
    if (summary === null) continue; // LiveKit unreachable — fail safe.
    const occupied = summary.speakers + summary.listeners > 0;
    // Always refresh the occupancy metrics when we have a reading.
    await prisma.space.update({
      where: { id: space.id },
      data: {
        speakerCount: summary.speakers,
        listenerCount: summary.listeners,
        emptySince: occupied ? null : space.emptySince,
      },
    });
    if (occupied) continue;
    // Room is empty.
    if (space.emptySince === null) {
      // First sweep observing it empty: start the countdown.
      await prisma.space.update({
        where: { id: space.id },
        data: { emptySince: now },
      });
      continue;
    }
    if (now.getTime() - space.emptySince.getTime() >= EMPTY_SPACE_TTL_MS) {
      await endShowSession({ spaceId: space.id });
      await prisma.space.update({
        where: { id: space.id },
        data: { isLive: false, status: SPACE_STATUS.EXPIRED },
      });
      expired++;
    }
  }

  return expired;
}

/**
 * Increment the reaction counter for a space. Returns the new count.
 */
export async function incrementSpaceReactions(
  spaceId: string
): Promise<number | null> {
  try {
    const updated = await prisma.space.update({
      where: { id: spaceId },
      data: { reactionCount: { increment: 1 } },
      select: { reactionCount: true },
    });
    return updated.reactionCount;
  } catch {
    return null;
  }
}

/**
 * Best-effort: run the expiration sweep. Swallows errors so callers (e.g. a
 * request handler) can safely invoke it without aborting the main flow.
 */
export async function tryExpireStaleSpaces(): Promise<number> {
  try {
    return await expireStaleSpaces();
  } catch {
    return 0;
  }
}

/**
 * Decide whether a space should be visible to a given viewer.
 *
 * Visibility rules:
 *   - `status === 'scheduled'` and `scheduledAt` is in the future or within
 *     the last hour: visible.
 *   - `status === 'active'` and `expiresAt > now`: visible.
 *   - `status === 'live'`: visible.
 *   - Otherwise the space is only visible to its host.
 */
export function isSpaceVisible(
  space: SpaceModel,
  viewerDid: string | null,
  now: Date = new Date()
): boolean {
  if (viewerDid && space.hostId === viewerDid) return true;
  const scheduledAtMs = space.scheduledAt ? space.scheduledAt.getTime() : null;
  const expiresAtMs = space.expiresAt ? space.expiresAt.getTime() : null;
  const nowMs = now.getTime();
  switch (space.status) {
    case SPACE_STATUS.LIVE:
      return true;
    case SPACE_STATUS.SCHEDULED:
      if (scheduledAtMs === null) return false;
      // Show scheduled spaces from their scheduled start time through 1h
      // after (a small grace so users who arrive a bit late still find it).
      return (
        scheduledAtMs <= nowMs &&
        nowMs - scheduledAtMs <= SCHEDULED_VISIBILITY_WINDOW_MS
      );
    case SPACE_STATUS.ACTIVE:
      return expiresAtMs !== null && expiresAtMs > nowMs;
    default:
      return false;
  }
}

/**
 * Visibility predicate when no viewer is known (anonymous request). Mirrors
 * `isSpaceVisible` but always denies host-only fallback.
 */
export function isSpaceVisibleToAnonymous(
  space: SpaceModel,
  now: Date = new Date()
): boolean {
  return isSpaceVisible(space, null, now);
}

/**
 * Popularity score used to rank rooms by how much is happening in them.
 * A "popular" room is one with a live audience, speakers on stage, and/or
 * lots of reactions.
 */
export function popularityScore(space: {
  listenerCount: number;
  speakerCount: number;
  reactionCount: number;
}): number {
  return space.listenerCount + space.speakerCount + space.reactionCount;
}

/**
 * List spaces visible to a given user. Combines:
 *   - All spaces the user hosts (regardless of status/expiration).
 *   - Non-hosted spaces that are visible per `isSpaceVisible`.
 *
 * We do this with a single Prisma query using OR clauses so a host can still
 * see their own expired/ended rooms without a second round-trip.
 */
export async function getSpacesForUser(
  userDid: string | null,
  now: Date = new Date()
): Promise<SpaceWithHost[]> {
  // Anonymous path: skip the OR and just filter on visibility-friendly rows.
  if (!userDid) {
    return prisma.space.findMany({
      where: visibleSpacesWhere(now),
      orderBy: { createdAt: 'desc' },
      include: { host: true },
    });
  }
  return prisma.space.findMany({
    where: {
      OR: [
        { hostId: userDid, status: { not: SPACE_STATUS.EXPIRED } },
        visibleSpacesWhere(now),
      ],
    },
    orderBy: { createdAt: 'desc' },
    include: { host: true },
  });
}

/**
 * Build the Prisma `where` clause used to select spaces that should be
 * visible to a non-host viewer.
 */
function visibleSpacesWhere(now: Date): Record<string, unknown> {
  const scheduledWindowStart = new Date(
    now.getTime() - SCHEDULED_VISIBILITY_WINDOW_MS
  );
  return {
    AND: [
      {
        OR: [
          { status: SPACE_STATUS.LIVE },
          {
            status: SPACE_STATUS.SCHEDULED,
            scheduledAt: {
              gte: scheduledWindowStart,
              lte: now,
            },
          },
          {
            status: SPACE_STATUS.ACTIVE,
            expiresAt: { gt: now },
          },
        ],
      },
      // Never leak rows that haven't been written yet.
      { createdAt: { lte: now } },
    ],
  };
}

/**
 * Resolve a space identifier (id or slug) and return the row along with a
 * flag indicating whether the supplied DID is the host.
 */
export async function resolveSpaceForUser(
  identifier: string,
  userDid: string
): Promise<{ space: SpaceWithHost; isHost: boolean } | null> {
  let space = await getSpaceById(identifier);
  if (!space) {
    space = await getSpaceBySlug(identifier);
  }
  if (!space) return null;
  return { space, isHost: space.hostId === userDid };
}

// ---------- Public view helpers ----------

export function toPublicHost(host: SpaceWithHost['host']): PublicHost {
  return {
    did: host.did,
    handle: host.handle,
    displayName: host.displayName ?? null,
    avatarUrl: host.avatarUrl ?? null,
  };
}

/**
 * Hosts that we treat as "loopback" / internal — when present on the
 * request origin they should not leak into user-facing shareable URLs.
 */
const LOOPBACK_HOSTS = new Set([
  '0.0.0.0',
  '127.0.0.1',
  'localhost',
  '[::1]',
  '::1',
]);

/**
 * Canonical public origin used to build shareable URLs. Falls back through:
 *   1. `NEXT_PUBLIC_APP_URL`
 *   2. `PUBLIC_URL`
 *   3. `https://rabble.invalid`
 *
 * The fallback list is intentionally defined here (and re-exported via
 * `defaultPublicOrigin`) so the spaces service is the single source of
 * truth for shareable URLs across all API routes.
 */
export function defaultPublicOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.PUBLIC_URL ||
    'https://rabble.invalid'
  );
}

/**
 * Return a public-facing origin suitable for shareable URLs.
 *
 * If `origin` is missing, malformed, or its host is a loopback address
 * (e.g. `http://0.0.0.0:3000` when the app runs inside Docker behind
 * exe.dev), we substitute the configured canonical origin. Non-loopback
 * origins are returned unchanged so callers that explicitly opt into a
 * custom host (e.g. a staging environment) keep working.
 */
export function canonicalizeOrigin(origin?: string | null): string {
  const fallback = defaultPublicOrigin();
  if (!origin) return fallback;
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    if (LOOPBACK_HOSTS.has(host)) return fallback;
    // Preserve any non-default port the caller passed (e.g. local
    // development on http://localhost:3000 explicitly chosen by the
    // operator — we still treat localhost as loopback and substitute).
    return `${url.protocol}//${url.host}`;
  } catch {
    return fallback;
  }
}

export function toPublicSpace(
  space: SpaceWithHost,
  origin?: string | null
): PublicSpace {
  const base = canonicalizeOrigin(origin);
  const shareableUrl = `${base}/show/${space.id}`;
  return {
    id: space.id,
    slug: space.slug,
    title: space.title,
    description: space.description,
    isLive: space.isLive,
    status: space.status,
    scheduledAt: space.scheduledAt ? space.scheduledAt.toISOString() : null,
    expiresAt: space.expiresAt ? space.expiresAt.toISOString() : null,
    listenerCount: space.listenerCount,
    speakerCount: space.speakerCount,
    reactionCount: space.reactionCount,
    likeCount: space.likeCount,
    sessionCount: space.sessionCount,
    totalListeners: space.totalListeners,
    hostedSeconds: space.hostedSeconds,
    lastLiveAt: space.lastLiveAt ? space.lastLiveAt.toISOString() : null,
    tags: space.tags ?? [],
    createdAt: space.createdAt.toISOString(),
    updatedAt: space.updatedAt.toISOString(),
    host: toPublicHost(space.host),
    shareableUrl,
  };
}
