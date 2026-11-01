// src/app/api/spaces/[id]/reactions/route.ts
//
// POST /api/spaces/[id]/reactions
//
// Record a reaction in a room by incrementing the space's `reactionCount`
// metric. Requires an authenticated session. Used by the in-room reaction
// bar to feed the popularity sort on the spaces listing.
//
// Response: { reactionCount: number }
//   or an error envelope on failure.

import { NextResponse, type NextRequest } from 'next/server';
import { getSpaceById, getSpaceBySlug, incrementSpaceReactions } from '@/lib/spaces';
import { getCurrentUser } from '@/lib/session';
import { recordReaction } from '@/lib/metrics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Resolve by primary key first, then fall back to slug.
  let space = await getSpaceById(id);
  if (!space) {
    space = await getSpaceBySlug(id);
  }
  if (!space) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const reactionCount = await incrementSpaceReactions(space.id);
  if (reactionCount === null) {
    return NextResponse.json(
      { error: 'reaction_failed', message: 'Failed to record reaction.' },
      { status: 500 }
    );
  }

  await recordReaction({ spaceId: space.id, did: user.did });
  return NextResponse.json({ reactionCount }, { status: 200 });
}
