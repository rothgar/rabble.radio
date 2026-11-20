// src/app/api/hosts/[did]/follow/route.ts
//
// "Follow this host" — notified whenever any of their shows goes live.
//   GET  -> { following: boolean }                (401 signed out)
//   POST -> body { on: boolean } -> { following }  (401 signed out)
// Delivered by polling GET /api/me/reminders?due=1 and by web push the
// moment the host goes on air (src/lib/push.ts#pushHostFollowersOnAir).

import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getUserByDid } from '@/lib/users';
import { hasHostFollow, setHostFollow } from '@/lib/host-follows';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ did: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { did } = await context.params;
  const host = did ? await getUserByDid(did) : null;
  if (!host) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ following: await hasHostFollow(host.did, user.did) }, { status: 200 });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ did: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { did } = await context.params;
  const host = did ? await getUserByDid(did) : null;
  if (!host) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (host.did === user.did) {
    return NextResponse.json(
      { error: 'validation_error', message: 'You cannot follow yourself.' },
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
  const following = await setHostFollow(host.did, user.did, body.on);
  return NextResponse.json({ following }, { status: 200 });
}
