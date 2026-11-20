// src/lib/users.ts
//
// Server-side helpers for resolving Prisma User rows from AT Protocol DIDs.
// Used by the /api/users route to attach handles and avatars to
// participant tiles, and by anywhere else that needs to map a DID to a
// public profile snippet.

import { prisma } from '@/lib/db';
import { resolveDidMigrationTarget } from '@/lib/atproto-runtime';

export interface UserSummary {
  did: string;
  handle: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

/**
 * Fetch the User row for a single DID. Returns null when the user has
 * never signed into Rabble before — callers should fall back to the raw
 * DID as the display label.
 */
export async function getUserByDid(
  did: string
): Promise<UserSummary | null> {
  if (!did) return null;
  const row = await prisma.user.findUnique({
    where: { did },
    select: {
      did: true,
      handle: true,
      displayName: true,
      avatarUrl: true,
    },
  });
  if (!row) return null;
  return {
    did: row.did,
    handle: row.handle,
    displayName: row.displayName ?? null,
    avatarUrl: row.avatarUrl ?? null,
  };
}

/**
 * Bulk variant: fetch summaries for many DIDs at once. Missing rows are
 * omitted from the returned list (the caller can backfill with the raw
 * DID).
 */
export async function getUsersByDid(
  dids: string[]
): Promise<UserSummary[]> {
  if (!Array.isArray(dids) || dids.length === 0) return [];
  const unique = Array.from(new Set(dids.filter((d) => typeof d === 'string' && d.length > 0)));
  if (unique.length === 0) return [];
  const rows = await prisma.user.findMany({
    where: { did: { in: unique } },
    select: {
      did: true,
      handle: true,
      displayName: true,
      avatarUrl: true,
    },
  });
  return rows.map((row: UserSummary) => ({
    did: row.did,
    handle: row.handle,
    displayName: row.displayName ?? null,
    avatarUrl: row.avatarUrl ?? null,
  }));
}

/**
 * Called on login for a DID with no `User` row of its own. A host who
 * migrates their Bluesky account keeps the same handle but is issued a new
 * DID. A candidate is a row still claiming `handle` under some other DID —
 * but a handle is also just released back into the pool when its original
 * owner renames or disappears, so sharing `handle` is never, on its own,
 * proof of a migration. The proof is `resolveDidMigrationTarget`: it reads a
 * pointer recorded in the *old* DID's own PLC operation log, which nobody
 * but that DID's own keys could have put there, so an unrelated account that
 * merely reclaimed the old handle under a fresh DID can never match here.
 */
export async function findMigratedHostDid(
  newDid: string,
  handle: string
): Promise<string | null> {
  const candidate = await prisma.user.findFirst({
    where: { handle, did: { not: newDid } },
    orderBy: { updatedAt: 'desc' },
    select: { did: true },
  });
  if (!candidate) return null;
  const migratedTo = await resolveDidMigrationTarget(candidate.did);
  return migratedTo === newDid ? candidate.did : null;
}

/**
 * Re-points a migrated host's rows from their retired DID onto the new one.
 * `Space.hostId` isn't touched directly: its foreign key to `User.did`
 * cascades (`ON UPDATE CASCADE`, see prisma/d1/0001_init.sql) the moment
 * `User.did` changes. `User.did` is updated last on purpose: a future
 * login's "does a User row already exist for this DID" check (the caller,
 * before calling this) keys off that row, so if an earlier statement here
 * fails (D1 has no transactions), the next login retries the whole sequence
 * instead of treating a half-done migration as finished. Every statement
 * only touches rows still on `oldDid`, and the two guarded against a unique
 * constraint (`HostTopicStats`, `HostFollow`) skip a row that would collide
 * with one already on `newDid` rather than failing outright, so re-running
 * this is always safe.
 */
export async function reassignHostIdentity(
  oldDid: string,
  newDid: string
): Promise<void> {
  if (oldDid === newDid) return;
  await prisma.$executeRaw`
    UPDATE "Recording" SET hostDid = ${newDid} WHERE hostDid = ${oldDid}`;
  await prisma.$executeRaw`
    UPDATE "StageInvite" SET hostDid = ${newDid} WHERE hostDid = ${oldDid}`;
  await prisma.$executeRaw`
    UPDATE "ShowSession" SET hostDid = ${newDid} WHERE hostDid = ${oldDid}`;
  await prisma.$executeRaw`
    UPDATE "HostTopicStats" SET hostDid = ${newDid}
    WHERE hostDid = ${oldDid}
      AND tag NOT IN (SELECT tag FROM "HostTopicStats" WHERE hostDid = ${newDid})`;
  await prisma.$executeRaw`
    UPDATE "HostFollow" SET hostDid = ${newDid}
    WHERE hostDid = ${oldDid}
      AND did NOT IN (SELECT did FROM "HostFollow" WHERE hostDid = ${newDid})`;
  await prisma.$executeRaw`UPDATE "User" SET did = ${newDid} WHERE did = ${oldDid}`;
}
