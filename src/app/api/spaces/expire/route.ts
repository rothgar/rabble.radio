// src/app/api/spaces/expire/route.ts
//
// POST /api/spaces/expire
//
// Sweep stale (unscheduled, expired, untouched for >5m) active spaces and
// transition them to `status = 'expired'`. Called by the Worker's cron
// trigger (custom-worker.ts) every five minutes; outside callers get 403
// (src/lib/cron.ts).
//
// Response: { expired: number }

import { NextResponse, type NextRequest } from 'next/server';
import { jsonError } from '@/lib/api';
import { expireStaleSpaces } from '@/lib/spaces';
import { isCronRequest } from '@/lib/cron';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isCronRequest(request)) {
    return jsonError(403, 'forbidden');
  }
  try {
    const expired = await expireStaleSpaces();
    return NextResponse.json({ expired }, { status: 200 });
  } catch (err) {
    logger.error('spaces.expire.failed', { err });
    return jsonError(500, 'expire_failed', 'Failed to expire spaces.');
  }
}
