// src/app/api/spaces/[id]/follow/route.ts
//
// "Follow this show" — notified only when this exact show goes live as its
// host, unlike /api/hosts/[did]/follow which fires for any of the host's
// shows.
//   GET  -> { following: boolean }                (401 signed out)
//   POST -> body { on: boolean } -> { following }  (401 signed out)
// Delivered by polling GET /api/me/reminders?due=1 and by web push the
// moment the host goes on air (src/lib/push.ts#pushShowFollowersOnAir).

import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getSpaceById, getSpaceBySlug } from '@/lib/spaces';
import { hasShowFollow, setShowFollow } from '@/lib/show-follows';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function resolve(id: string) {
  return (await getSpaceById(id)) ?? (await getSpaceBySlug(id));
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const space = id ? await resolve(id) : null;
  if (!space) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ following: await hasShowFollow(space.id, user.did) }, { status: 200 });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const space = id ? await resolve(id) : null;
  if (!space) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (space.host.did === user.did) {
    return NextResponse.json(
      { error: 'validation_error', message: 'You cannot follow your own show.' },
      { status: 400 }
    );
  }
  let body: { on?: unknown };
  try {
    body = (await request.json()) as { on?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid_json', message: 'Body must be JSON.' }, { status: 400 });
  }
  if (typeof body.on !== 'boolean') {
    return NextResponse.json(
      { error: 'validation_error', message: "'on' must be a boolean." },
      { status: 400 }
    );
  }
  const following = await setShowFollow(space.id, user.did, body.on);
  return NextResponse.json({ following }, { status: 200 });
}
