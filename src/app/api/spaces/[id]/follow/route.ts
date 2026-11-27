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
import { jsonError, readJson, requireUser } from '@/lib/api';
import { resolveSpace } from '@/lib/spaces';
import { hasShowFollow, setShowFollow } from '@/lib/show-follows';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { id } = await context.params;
  const space = id ? await resolveSpace(id) : null;
  if (!space) return jsonError(404, 'not_found');
  return NextResponse.json({ following: await hasShowFollow(space.id, user.did) }, { status: 200 });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { id } = await context.params;
  const space = id ? await resolveSpace(id) : null;
  if (!space) return jsonError(404, 'not_found');
  if (space.host.did === user.did) {
    return jsonError(400, 'validation_error', 'You cannot follow your own show.');
  }
  const body = await readJson<{ on?: unknown }>(request, 'Body must be JSON.');
  if (body instanceof NextResponse) return body;
  if (typeof body.on !== 'boolean') {
    return jsonError(400, 'validation_error', "'on' must be a boolean.");
  }
  const following = await setShowFollow(space.id, user.did, body.on);
  return NextResponse.json({ following }, { status: 200 });
}
