// src/app/api/push/subscribe/route.ts
//
// POST   { subscription: PushSubscriptionJSON } -> { id, count }   store this browser for the user
// DELETE { endpoint }                           -> { removed }     forget it
// GET                                           -> { count }       how many browsers the user has
// All require a session.

import { NextResponse, type NextRequest } from 'next/server';
import { jsonError, readJson, requireUser } from '@/lib/api';
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
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json({ count: await countSubscriptions(user.did) }, { status: 200 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  if (!vapidPublicKey()) return jsonError(404, 'push_not_configured');
  const body = await readJson<{ subscription?: unknown }>(request, 'Body must be JSON.');
  if (body instanceof NextResponse) return body;
  try {
    const sub = parseSubscription(body.subscription);
    const { id } = await saveSubscription(user.did, sub, request.headers.get('user-agent'));
    return NextResponse.json({ id, count: await countSubscriptions(user.did) }, { status: 200 });
  } catch (err) {
    if (err instanceof PushValidationError) {
      return jsonError(400, 'validation_error', err.message);
    }
    throw err;
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const body = await readJson<{ endpoint?: unknown }>(request, 'Body must be JSON.');
  if (body instanceof NextResponse) return body;
  if (typeof body.endpoint !== 'string') {
    return jsonError(400, 'validation_error', 'endpoint is required.');
  }
  const removed = await removeSubscription(user.did, body.endpoint);
  return NextResponse.json({ removed }, { status: 200 });
}
