// src/lib/spaces.ts
//
// Service functions for the Space model. All Prisma access for spaces goes
// through here so the API routes and server components stay thin.

import { prisma } from '@/lib/db';
import { getRoomParticipantSummary, roomNameForSpace } from '@/lib/livekit';
import { normalizeTags } from '@/lib/tags';
import { endShowSession } from '@/lib/metrics';
import type { PublicHost, PublicReplay, PublicSpace } from '@/types';

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
  /** Pre-show music mood id (src/lib/music.ts), null for silence. */
  musicMood?: string | null;
  /** True while music sits on stage; false once removed while on air. Ignored off air. */
  musicOnStage?: boolean;
  /** True once the host has turned this show into its own podcast feed. */
  podcastFeedEnabled: boolean;
  /** True for the auto-titled default show from an untitled "Start a show". */
  isDefaultTitled: boolean;
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

/** Prisma include that fetches the host and the tag rows for a space. */
export const spaceInclude = { host: true, tags: { select: { tag: true } } } as const;

/** Flatten the SpaceTag join rows into the `tags: string[]` the app uses. */
export function withTags<T extends { tags?: Array<{ tag: string } | string> }>(
  row: T
): Omit<T, 'tags'> & { tags: string[] } {
  const { tags, ...rest } = row;
  return { ...rest, tags: (tags ?? []).map((t) => (typeof t === 'string' ? t : t.tag)) };
}

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
  /**
   * True when `title` is the auto-generated default ("Start a show" with no
   * title typed), so `findDefaultHostedSpace` can find this row later no
   * matter how the host's handle or display name changes afterward.
   */
  isDefaultTitled?: boolean;
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
  const bytes = crypto.getRandomValues(new Uint8Array(8));
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

  const row = await prisma.space.create({
    data: {
      slug,
      title,
      description,
      tags: { create: tags.map((tag) => ({ tag })) },
      hostId: input.hostId,
      scheduledAt,
      expiresAt,
      emptySince,
      status,
      isDefaultTitled: input.isDefaultTitled ?? false,
    },
    include: spaceInclude,
  });
  return withTags(row);
}

export interface UpdateSpaceInput {
  title?: string;
  description?: string | null;
  tags?: string[];
  musicMood?: string | null;
  /** Host only: move music on/off the stage without changing the mood. */
  musicOnStage?: boolean;
  podcastFeedEnabled?: boolean;
}

/**
 * Edit a station's title, description and tags. Hosts do this from inside
 * the room after an instant "Start a show", so every field is optional and
 * only the supplied ones change. Tags are replaced as a set.
 */
export async function updateSpace(
  id: string,
  input: UpdateSpaceInput
): Promise<SpaceWithHost> {
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) throw new Error('Title is required.');
    data.title = title;
    // A host-supplied title is never the auto-generated default, even if it
    // happens to read the same, so it stops matching findDefaultHostedSpace.
    data.isDefaultTitled = false;
  }
  if (input.description !== undefined) {
    const description = input.description?.trim() ?? '';
    data.description = description.length > 0 ? description : null;
  }
  if (input.tags !== undefined) {
    const tags = normalizeTags(input.tags);
    data.tags = { deleteMany: {}, create: tags.map((tag) => ({ tag })) };
  }
  if (input.musicMood !== undefined) {
    data.musicMood = input.musicMood;
    // Picking (or clearing) a mood is the host deciding what music is on
    // stage right now, so it always lands on stage; a caller who also wants
    // to move it straight to the audience passes musicOnStage explicitly,
    // handled below.
    data.musicOnStage = true;
  }
  if (input.musicOnStage !== undefined) {
    data.musicOnStage = input.musicOnStage;
  }
  if (input.podcastFeedEnabled !== undefined) {
    data.podcastFeedEnabled = input.podcastFeedEnabled;
  }
  const row = await prisma.space.update({
    where: { id },
    data,
    include: spaceInclude,
  });
  return withTags(row);
}

/**
 * Every station a user hosts, regardless of status, most recently live
 * first (never-live stations fall back to creation time). Used by the
 * account page.
 */
export async function getHostedSpaces(hostDid: string): Promise<SpaceWithHost[]> {
  const rows = await prisma.space.findMany({
    where: { hostId: hostDid },
    orderBy: [{ lastLiveAt: 'desc' }, { createdAt: 'desc' }],
    include: spaceInclude,
  });
  return rows.map(withTags);
}

/**
 * The show a host's untitled "Start a show" lands in: their existing
 * auto-titled default show, if they have one. Scheduled rows are skipped so
 * a planned show keeps its date. Null when the host has never started one.
 *
 * Looks up the `isDefaultTitled` marker directly rather than recomputing and
 * matching the rendered title, so this keeps finding the same show after the
 * host's handle or Bluesky display name changes (issue #33).
 */
export async function findDefaultHostedSpace(
  hostDid: string
): Promise<SpaceWithHost | null> {
  const row = await prisma.space.findFirst({
    where: {
      hostId: hostDid,
      isDefaultTitled: true,
      status: { not: SPACE_STATUS.SCHEDULED },
    },
    orderBy: [{ lastLiveAt: 'desc' }, { createdAt: 'desc' }],
    include: spaceInclude,
  });
  return row ? withTags(row) : null;
}

/**
 * Put an existing show back in the off-air, joinable state for a new
 * session: active, not live, empty countdown restarted. Ended and expired
 * shows come back; a live one is left live.
 *
 * `newTitle`, when given, also refreshes the row's title (used to resync a
 * default-titled show's rendered name with the host's handle/display name as
 * of their last login, on reopen; issue #44).
 */
export async function reopenSpace(
  id: string,
  now: Date = new Date(),
  newTitle?: string
): Promise<SpaceWithHost> {
  const current = await prisma.space.findUnique({ where: { id }, select: { status: true } });
  if (current?.status === SPACE_STATUS.LIVE) {
    const live = await getSpaceById(id);
    if (!live) throw new Error(`Space not found: ${id}`);
    return live;
  }
  const data: Record<string, unknown> = {
    status: SPACE_STATUS.ACTIVE,
    isLive: false,
    scheduledAt: null,
    emptySince: now,
    expiresAt: new Date(now.getTime() + EMPTY_SPACE_TTL_MS),
  };
  if (newTitle) {
    data.title = newTitle;
  }
  const row = await prisma.space.update({
    where: { id },
    data,
    include: spaceInclude,
  });
  return withTags(row);
}

/**
 * The default title for a show started without one: the host's display
 * name when they have one, falling back to their handle.
 */
export function defaultShowTitle(handle: string, displayName?: string | null): string {
  const trimmedHandle = handle.trim() || 'new host';
  const fallback = trimmedHandle.startsWith('@') ? trimmedHandle : `@${trimmedHandle}`;
  const name = displayName?.trim() || fallback;
  return `The ${name} show`;
}

/**
 * Whether this title is one the host never chose: the current default or
 * its pre-#23 shape. A listener can't usefully "follow this show" by name
 * when it has no name of its own yet.
 */
export function isDefaultShowTitle(title: string, handle: string, displayName?: string | null): boolean {
  return title === defaultShowTitle(handle, displayName) || title === legacyDefaultShowTitle(handle);
}

/** The default title's shape before issue #23: handle only, no display name. */
function legacyDefaultShowTitle(handle: string): string {
  const trimmedHandle = handle.trim() || 'new host';
  const fallback = trimmedHandle.startsWith('@') ? trimmedHandle : `@${trimmedHandle}`;
  return `${fallback}'s show`;
}

/**
 * List spaces ordered by creation time descending. Includes the host profile.
 */
export async function getSpaces(): Promise<SpaceWithHost[]> {
  const rows = await prisma.space.findMany({
    orderBy: { createdAt: 'desc' },
    include: spaceInclude,
  });
  return rows.map(withTags);
}

/**
 * Fetch a space by primary key with its host profile, or null if not found.
 */
export async function getSpaceById(id: string): Promise<SpaceWithHost | null> {
  const row = await prisma.space.findUnique({
    where: { id },
    include: spaceInclude,
  });
  return row ? withTags(row) : null;
}

/**
 * Fetch a space by its slug with its host profile, or null if not found.
 */
export async function getSpaceBySlug(slug: string): Promise<SpaceWithHost | null> {
  const row = await prisma.space.findUnique({
    where: { slug },
    include: spaceInclude,
  });
  return row ? withTags(row) : null;
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
  const row = await prisma.space.update({
    where: { id },
    data: {
      isLive,
      status,
      expiresAt,
      emptySince,
    },
    include: spaceInclude,
  });
  return withTags(row);
}

/**
 * Mark a single space as expired.
 */
export async function expireSpace(id: string): Promise<SpaceWithHost> {
  await endShowSession({ spaceId: id });
  const row = await prisma.space.update({
    where: { id },
    data: {
      isLive: false,
      status: SPACE_STATUS.EXPIRED,
    },
    include: spaceInclude,
  });
  return withTags(row);
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

  // 2) Occupancy-based sweep for active/live spaces. Each space costs one
  //    LiveKit round trip, so they run concurrently; this is why the sweep
  //    lives on the cron trigger and not in the request path.
  const candidates = await prisma.space.findMany({
    where: { status: { in: [SPACE_STATUS.ACTIVE, SPACE_STATUS.LIVE] } },
    select: { id: true, emptySince: true },
  });
  const results = await Promise.all(
    candidates.map(async (space): Promise<boolean> => {
      const roomName = roomNameForSpace(space.id);
      const summary = await getRoomParticipantSummary(roomName);
      if (summary === null) return false; // LiveKit unreachable — fail safe.
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
      if (occupied) return false;
      // Room is empty.
      if (space.emptySince === null) {
        // First sweep observing it empty: start the countdown.
        await prisma.space.update({
          where: { id: space.id },
          data: { emptySince: now },
        });
        return false;
      }
      if (now.getTime() - space.emptySince.getTime() >= EMPTY_SPACE_TTL_MS) {
        await endShowSession({ spaceId: space.id });
        await prisma.space.update({
          where: { id: space.id },
          data: { isLive: false, status: SPACE_STATUS.EXPIRED },
        });
        return true;
      }
      return false;
    })
  );
  expired += results.filter(Boolean).length;

  return expired;
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
    const rows = await prisma.space.findMany({
      where: visibleSpacesWhere(now),
      orderBy: { createdAt: 'desc' },
      include: spaceInclude,
    });
    return rows.map(withTags);
  }
  const rows = await prisma.space.findMany({
    where: {
      OR: [
        { hostId: userDid, status: { not: SPACE_STATUS.EXPIRED } },
        visibleSpacesWhere(now),
      ],
    },
    orderBy: { createdAt: 'desc' },
    include: spaceInclude,
  });
  return rows.map(withTags);
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
          // Finished shows stay listed while a replay is available.
          {
            status: { in: [SPACE_STATUS.ENDED, SPACE_STATUS.EXPIRED] },
            recordings: { some: { status: 'available' } },
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

/** Viewer- and recording-specific additions attached by `decoratePublicSpaces`. */
export interface PublicSpaceExtras {
  replay?: PublicReplay | null;
  reminded?: boolean;
  hostSubscribed?: boolean;
  showFollowed?: boolean;
  onStageHosts?: PublicHost[];
}

export function toPublicSpace(
  space: SpaceWithHost,
  origin?: string | null,
  extras: PublicSpaceExtras = {}
): PublicSpace {
  const base = canonicalizeOrigin(origin);
  const shareableUrl = `${base}/show/${space.id}`;
  const podcastFeedEnabled = Boolean(space.podcastFeedEnabled);
  const podcastFeedUrl = podcastFeedEnabled
    ? `${base}/podcast/${encodeURIComponent(space.host.handle)}/show/${space.id}/feed.xml`
    : null;
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
    tunedInCount: space.listenerCount,
    likeCount: space.likeCount,
    sessionCount: space.sessionCount,
    totalListeners: space.totalListeners,
    hostedSeconds: space.hostedSeconds,
    lastLiveAt: space.lastLiveAt ? space.lastLiveAt.toISOString() : null,
    tags: space.tags ?? [],
    createdAt: space.createdAt.toISOString(),
    updatedAt: space.updatedAt.toISOString(),
    host: toPublicHost(space.host),
    onStageHosts: extras.onStageHosts ?? [toPublicHost(space.host)],
    shareableUrl,
    replay: extras.replay ?? null,
    reminded: extras.reminded ?? false,
    hostSubscribed: extras.hostSubscribed ?? false,
    isNamedShow: !isDefaultShowTitle(space.title, space.host.handle, space.host.displayName),
    showFollowed: extras.showFollowed ?? false,
    musicMood: space.musicMood ?? null,
    musicOnStage: space.musicOnStage ?? true,
    podcastFeedEnabled,
    podcastFeedUrl,
  };
}
