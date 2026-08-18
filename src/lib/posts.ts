// src/lib/posts.ts
//
// Service functions for the SpacePost model. Wraps Prisma access so the
// API routes and server components stay thin. We hand-roll the model type
// because the generated client is not refreshed in this MVP build (no
// `prisma generate` step), and we cast to the underlying model to keep
// typechecking green.

import { prisma } from '@/lib/db';
import type { PostView } from '@/lib/bsky';

export interface SpacePostModel {
  id: string;
  spaceId: string;
  atUri: string;
  cid: string;
  indexedAt: Date;
  authorDid: string;
  embed: unknown | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSpacePostInput {
  spaceId: string;
  atUri: string;
  cid: string;
  indexedAt: Date;
  authorDid: string;
  embed?: unknown | null;
}

export interface PublicSpacePost {
  id: string;
  spaceId: string;
  atUri: string;
  cid: string;
  indexedAt: string;
  authorDid: string;
  embed: unknown | null;
  view: PostView;
  createdAt: string;
}

/**
 * Create a SpacePost row. If a row already exists for (spaceId, atUri) the
 * existing one is returned.
 */
export async function createSpacePost(
  input: CreateSpacePostInput,
  view: PostView
): Promise<PublicSpacePost> {
  const client = prisma as unknown as {
    spacePost: {
      upsert: (args: unknown) => Promise<SpacePostModel>;
    };
  };
  const row = (await client.spacePost.upsert({
    where: { spaceId_atUri: { spaceId: input.spaceId, atUri: input.atUri } },
    update: {
      cid: input.cid,
      indexedAt: input.indexedAt,
      authorDid: input.authorDid,
      embed: (input.embed ?? null) as object | null,
    },
    create: {
      spaceId: input.spaceId,
      atUri: input.atUri,
      cid: input.cid,
      indexedAt: input.indexedAt,
      authorDid: input.authorDid,
      embed: (input.embed ?? null) as object | null,
    },
  })) as SpacePostModel;
  return toPublicSpacePost(row, view);
}

/**
 * List posts for a space ordered by createdAt descending.
 */
export async function listSpacePosts(
  spaceId: string
): Promise<PublicSpacePost[]> {
  const client = prisma as unknown as {
    spacePost: {
      findMany: (args: unknown) => Promise<SpacePostModel[]>;
    };
  };
  const rows = (await client.spacePost.findMany({
    where: { spaceId },
    orderBy: { createdAt: 'desc' },
  })) as SpacePostModel[];

  return rows.map((row) =>
    toPublicSpacePost(row, deriveViewFromRow(row))
  );
}

export function toPublicSpacePost(
  row: SpacePostModel,
  view: PostView
): PublicSpacePost {
  return {
    id: row.id,
    spaceId: row.spaceId,
    atUri: row.atUri,
    cid: row.cid,
    indexedAt: row.indexedAt.toISOString(),
    authorDid: row.authorDid,
    embed: row.embed,
    view,
    createdAt: row.createdAt.toISOString(),
  };
}

function deriveViewFromRow(row: SpacePostModel): PostView {
  const embed = (row.embed as PostView['embed']) ?? undefined;
  return {
    uri: row.atUri,
    cid: row.cid,
    indexedAt: row.indexedAt.toISOString(),
    author: { did: row.authorDid },
    embed,
  };
}
