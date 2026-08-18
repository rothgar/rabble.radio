// src/app/api/spaces/recording/expire/route.ts
//
// POST /api/spaces/recording/expire
//
// Delete recordings older than 30 days (status=starting or available) and
// flip their status to 'expired'. Intended to be triggered by an external
// scheduler / cron. Returns the number of rows transitioned.
//
// Response: { expired: number }

import { NextResponse, type NextRequest } from 'next/server';
import { expireOldRecordings } from '@/lib/recording';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(_request: NextRequest): Promise<NextResponse> {
  try {
    const expired = await expireOldRecordings();
    return NextResponse.json({ expired }, { status: 200 });
  } catch (err) {
    logger.error('recording.expire.failed', { err });
    return NextResponse.json(
      {
        error: 'expire_failed',
        message:
          err instanceof Error ? err.message : 'Failed to expire recordings.',
      },
      { status: 500 }
    );
  }
}
