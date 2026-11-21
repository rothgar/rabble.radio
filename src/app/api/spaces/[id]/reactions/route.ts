// src/app/api/spaces/[id]/reactions/route.ts
//
// POST /api/spaces/[id]/reactions
//
// Record a reaction in a room. The tap is buffered in memory and the
// space's `reactionCount` metric and its ShowReaction row are written to D1
// in a batch later (src/lib/reaction-buffer.ts), not on this request: a
// burst of concurrent taps during a live show used to queue one D1 round
// trip per tap behind the single connection and hang (issue #73). Requires
// an authenticated session. Used by the in-room reaction bar (web and
// mobile).
//
// Body (optional): { emoji?: string }
//
// Every participant in the LiveKit room is sent a `reaction` data message
// carrying the emoji and the sender's profile so clients can float the
// reaction from that person's avatar. Delivery is best-effort.
//
// Response: { reactionCount: number } — an estimate, not a fresh read: see
// src/lib/reaction-buffer.ts.
//   or an error envelope on failure.

import { NextResponse, type NextRequest } from 'next/server';
import { getSpaceById, getSpaceBySlug } from '@/lib/spaces';
import { getCurrentUser } from '@/lib/session';
import { bufferReaction } from '@/lib/reaction-buffer';
import { broadcastRoomData, roomNameForSpace } from '@/lib/livekit';
import { prisma } from '@/lib/db';

/** Emoji the room UIs offer; anything else is recorded as a plain reaction. */
export const REACTION_EMOJI = ['👍', '❤️', '😂', '🎉', '👏'] as const;
const DEFAULT_EMOJI = '❤️';

function pickEmoji(body: unknown): string {
  if (body && typeof body === 'object' && typeof (body as { emoji?: unknown }).emoji === 'string') {
    const emoji = (body as { emoji: string }).emoji;
    if ((REACTION_EMOJI as readonly string[]).includes(emoji)) return emoji;
  }
  return DEFAULT_EMOJI;
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const emoji = pickEmoji(await request.json().catch(() => null));

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

  const reactionCount = await bufferReaction({ spaceId: space.id, did: user.did, kind: emoji });

  // Tell the room who reacted so every client can float it from their avatar.
  const profile = await prisma.user
    .findUnique({
      where: { did: user.did },
      select: { handle: true, displayName: true, avatarUrl: true },
    })
    .catch(() => null);
  void broadcastRoomData(roomNameForSpace(space.id), {
    type: 'reaction',
    spaceId: space.id,
    emoji,
    did: user.did,
    handle: profile?.handle ?? user.handle,
    displayName: profile?.displayName ?? null,
    avatarUrl: profile?.avatarUrl ?? null,
  }).catch(() => false);

  return NextResponse.json({ reactionCount }, { status: 200 });
}
