// src/app/api/spaces/recording/expire/route.ts
//
// POST /api/spaces/recording/expire
//
// Delete recordings older than 30 days (status=starting or available) and
// flip their status to 'expired'. Called by the Worker's cron trigger
// (custom-worker.ts) every five minutes; outside callers get 403
// (src/lib/cron.ts). Returns the number of rows transitioned.
//
// Response: { expired: number }

import { NextResponse, type NextRequest } from 'next/server';
import { jsonError } from '@/lib/api';
import { expireOldRecordings } from '@/lib/recording';
import { isCronRequest } from '@/lib/cron';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isCronRequest(request)) {
    return jsonError(403, 'forbidden');
  }
  try {
    const expired = await expireOldRecordings();
    return NextResponse.json({ expired }, { status: 200 });
  } catch (err) {
    logger.error('recording.expire.failed', { err });
    return jsonError(500, 'expire_failed', 'Failed to expire recordings.');
  }
}
