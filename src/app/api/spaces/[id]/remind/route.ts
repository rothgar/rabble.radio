// src/app/api/spaces/[id]/remind/route.ts
//
// "Notify me" on a scheduled show.
//   GET  -> { reminded: boolean }               (401 signed out)
//   POST -> body { on: boolean } -> { reminded } (401 signed out)
// Reminders are delivered by polling GET /api/me/reminders?due=1.

import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getSpaceById, getSpaceBySlug } from '@/lib/spaces';
import { hasReminder, setReminder } from '@/lib/reminders';

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
  return NextResponse.json({ reminded: await hasReminder(space.id, user.did) }, { status: 200 });
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
  const reminded = await setReminder(space.id, user.did, body.on);
  return NextResponse.json({ reminded }, { status: 200 });
}
