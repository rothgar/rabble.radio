// src/app/api/spaces/[id]/remind/route.ts
//
// "Notify me" on a scheduled show.
//   GET  -> { reminded: boolean }               (401 signed out)
//   POST -> body { on: boolean } -> { reminded } (401 signed out)
// Reminders are delivered by polling GET /api/me/reminders?due=1.

import { NextResponse, type NextRequest } from 'next/server';
import { jsonError, readJson, requireUser } from '@/lib/api';
import { resolveSpace } from '@/lib/spaces';
import { hasReminder, setReminder } from '@/lib/reminders';

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
  return NextResponse.json({ reminded: await hasReminder(space.id, user.did) }, { status: 200 });
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
  const body = await readJson<{ on?: unknown }>(request, 'Body must be JSON.');
  if (body instanceof NextResponse) return body;
  if (typeof body.on !== 'boolean') {
    return jsonError(400, 'validation_error', "'on' must be a boolean.");
  }
  const reminded = await setReminder(space.id, user.did, body.on);
  return NextResponse.json({ reminded }, { status: 200 });
}
