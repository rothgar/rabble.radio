// GET /api/push/vapid -> { publicKey } the browser needs for PushManager.subscribe,
// or 404 when push is not configured on this deployment.

import { NextResponse } from 'next/server';
import { vapidPublicKey } from '@/lib/push';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  const publicKey = vapidPublicKey();
  if (!publicKey) {
    return NextResponse.json({ error: 'push_not_configured' }, { status: 404 });
  }
  return NextResponse.json({ publicKey }, { status: 200 });
}
