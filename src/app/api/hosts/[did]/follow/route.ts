// src/app/api/hosts/[did]/follow/route.ts
//
// "Follow this host" — notified whenever any of their shows goes live.
//   GET  -> { following: boolean }                (401 signed out)
//   POST -> body { on: boolean } -> { following }  (401 signed out)
// Delivered by polling GET /api/me/reminders?due=1 and by web push the
// moment the host goes on air (src/lib/push.ts#pushHostFollowersOnAir).

import { NextResponse, type NextRequest } from 'next/server';
import { jsonError, readJson, requireUser } from '@/lib/api';
import { getUserByDid } from '@/lib/users';
import { hasHostFollow, setHostFollow } from '@/lib/host-follows';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ did: string }> }
): Promise<NextResponse> {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { did } = await context.params;
  const host = did ? await getUserByDid(did) : null;
  if (!host) return jsonError(404, 'not_found');
  return NextResponse.json({ following: await hasHostFollow(host.did, user.did) }, { status: 200 });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ did: string }> }
): Promise<NextResponse> {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { did } = await context.params;
  const host = did ? await getUserByDid(did) : null;
  if (!host) return jsonError(404, 'not_found');
  if (host.did === user.did) {
    return jsonError(400, 'validation_error', 'You cannot follow yourself.');
  }
  const body = await readJson<{ on?: unknown }>(request, 'Body must be JSON.');
  if (body instanceof NextResponse) return body;
  if (typeof body.on !== 'boolean') {
    return jsonError(400, 'validation_error', "'on' must be a boolean.");
  }
  const following = await setHostFollow(host.did, user.did, body.on);
  return NextResponse.json({ following }, { status: 200 });
}
