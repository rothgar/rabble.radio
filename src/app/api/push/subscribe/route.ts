// src/app/api/push/subscribe/route.ts
//
// POST   { subscription: PushSubscriptionJSON } -> { id, count }   store this browser for the user
// DELETE { endpoint }                           -> { removed }     forget it
// GET                                           -> { count }       how many browsers the user has
// All require a session.

import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import {
  countSubscriptions,
  parseSubscription,
  PushValidationError,
  removeSubscription,
  saveSubscription,
  vapidPublicKey,
} from '@/lib/push';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ count: await countSubscriptions(user.did) }, { status: 200 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!vapidPublicKey()) return NextResponse.json({ error: 'push_not_configured' }, { status: 404 });
  let body: { subscription?: unknown };
  try {
    body = (await request.json()) as { subscription?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid_json', message: 'Body must be JSON.' }, { status: 400 });
  }
  try {
    const sub = parseSubscription(body.subscription);
    const { id } = await saveSubscription(user.did, sub, request.headers.get('user-agent'));
    return NextResponse.json({ id, count: await countSubscriptions(user.did) }, { status: 200 });
  } catch (err) {
    if (err instanceof PushValidationError) {
      return NextResponse.json({ error: 'validation_error', message: err.message }, { status: 400 });
    }
    throw err;
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { endpoint?: unknown };
  try {
    body = (await request.json()) as { endpoint?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid_json', message: 'Body must be JSON.' }, { status: 400 });
  }
  if (typeof body.endpoint !== 'string') {
    return NextResponse.json({ error: 'validation_error', message: 'endpoint is required.' }, { status: 400 });
  }
  const removed = await removeSubscription(user.did, body.endpoint);
  return NextResponse.json({ removed }, { status: 200 });
}
