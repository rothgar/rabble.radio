// src/app/api/spaces/[id]/like/route.ts
//
// GET    -> { likeCount, liked }   (liked is false for signed-out callers)
// POST   -> like the show (signed-in only), returns { likeCount, liked: true }
// DELETE -> remove the like, returns { likeCount, liked: false }
//
// Likes are one per user per show and feed the host leaderboard through
// src/lib/metrics.ts.

import { NextResponse, type NextRequest } from 'next/server';
import { getSpaceById, getSpaceBySlug, type SpaceWithHost } from '@/lib/spaces';
import { getCurrentUser } from '@/lib/session';
import { hasLiked, likeShow, unlikeShow } from '@/lib/metrics';
import { createLogger, correlationIdFromRequest } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

async function resolveSpace(id: string | undefined): Promise<SpaceWithHost | null> {
  if (!id) return null;
  return (await getSpaceById(id)) ?? (await getSpaceBySlug(id));
}

export async function GET(_request: NextRequest, context: Params): Promise<NextResponse> {
  const { id } = await context.params;
  const space = await resolveSpace(id);
  if (!space) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const user = await getCurrentUser();
  const liked = user ? await hasLiked(space.id, user.did) : false;
  return NextResponse.json({ likeCount: space.likeCount, liked }, { status: 200 });
}

async function mutate(
  request: NextRequest,
  context: Params,
  action: 'like' | 'unlike'
): Promise<NextResponse> {
  const log = createLogger({ correlationId: correlationIdFromRequest(request) });
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await context.params;
  const space = await resolveSpace(id);
  if (!space) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  try {
    const result =
      action === 'like'
        ? await likeShow({ spaceId: space.id, did: user.did })
        : await unlikeShow({ spaceId: space.id, did: user.did });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    log.error('like.failed', { err, spaceId: space.id, did: user.did, action });
    return NextResponse.json(
      { error: 'like_failed', message: 'Failed to update like.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, context: Params): Promise<NextResponse> {
  return mutate(request, context, 'like');
}

export async function DELETE(request: NextRequest, context: Params): Promise<NextResponse> {
  return mutate(request, context, 'unlike');
}
