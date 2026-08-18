// src/lib/users.ts
//
// Server-side helpers for resolving Prisma User rows from AT Protocol DIDs.
// Used by the /api/users route to attach handles and avatars to
// participant tiles, and by anywhere else that needs to map a DID to a
// public profile snippet.

import { prisma } from '@/lib/db';

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
