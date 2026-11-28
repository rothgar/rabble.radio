// src/app/api/spaces/announce-popular/route.ts
//
// POST /api/spaces/announce-popular
//
// Popular-show watcher (issue #175): post one Bluesky announcement for the
// live show with the highest popularity score, if any clears the listener
// threshold and hasn't been announced yet. Called by the Worker's cron
// trigger (custom-worker.ts) every five minutes; outside callers get 403
// (src/lib/cron.ts). A no-op when ATPROTO_APP_PROFILE_PASSWORD isn't set,
// so the dev Worker never posts.
//
// Response: { announced: boolean, spaceId?: string }

import { NextResponse, type NextRequest } from 'next/server';
import { jsonError } from '@/lib/api';
import { announcePopularShow } from '@/lib/popular-shows';
import { isCronRequest } from '@/lib/cron';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isCronRequest(request)) {
    return jsonError(403, 'forbidden');
  }
  try {
    const { announced, spaceId } = await announcePopularShow();
    return NextResponse.json({ announced, spaceId }, { status: 200 });
  } catch (err) {
    logger.error('popular_shows.announce_route.failed', { err });
    return jsonError(500, 'announce_failed', 'Failed to run the popular-show watcher.');
  }
}
