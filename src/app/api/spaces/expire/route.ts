// src/app/api/spaces/expire/route.ts
//
// POST /api/spaces/expire
//
// Sweep stale (unscheduled, expired, untouched for >5m) active spaces and
// transition them to `status = 'expired'`. Intended to be called by an
// external scheduler/cron in production; for MVP no auth is required since
// the endpoint only mutates rows that are already past their TTL.
//
// Response: { expired: number }

import { NextResponse, type NextRequest } from 'next/server';
import { expireStaleSpaces } from '@/lib/spaces';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(_request: NextRequest): Promise<NextResponse> {
  try {
    const expired = await expireStaleSpaces();
    return NextResponse.json({ expired }, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to expire spaces.';
    return NextResponse.json(
      { error: 'expire_failed', message },
      { status: 500 }
    );
  }
}
