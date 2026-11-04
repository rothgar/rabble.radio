// src/app/api/recordings/[id]/publish/route.ts
//
// POST /api/recordings/[id]/publish  { published: boolean }
//
// Host-only toggle that publishes (or unpublishes) a finished recording as
// a podcast episode. Published episodes appear in the host's RSS feed at
// /podcast/[handle]/feed.xml and can be fetched by anyone through
// /api/recordings/[id]/audio.

import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import {
  getRecordingById,
  RecordingStateError,
  setRecordingPublished,
  toPublicRecording,
} from '@/lib/recording';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  let body: { published?: unknown };
  try {
    body = (await request.json()) as { published?: unknown };
  } catch {
    return NextResponse.json(
      { error: 'invalid_json', message: 'Request body must be JSON.' },
      { status: 400 }
    );
  }
  if (typeof body.published !== 'boolean') {
    return NextResponse.json(
      { error: 'validation_error', message: 'published must be a boolean.' },
      { status: 400 }
    );
  }

  const recording = await getRecordingById(id);
  if (!recording) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (recording.hostDid !== user.did) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Only the host can publish this recording.' },
      { status: 403 }
    );
  }

  try {
    const updated = await setRecordingPublished(id, body.published);
    if (!updated) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    logger.info('recording.publish', { id, published: body.published, did: user.did });
    return NextResponse.json({ recording: toPublicRecording(updated) }, { status: 200 });
  } catch (err) {
    if (err instanceof RecordingStateError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: 409 });
    }
    logger.error('recording.publish.failed', { err, id });
    return NextResponse.json(
      {
        error: 'publish_failed',
        message: err instanceof Error ? err.message : 'Failed to update recording.',
      },
      { status: 500 }
    );
  }
}
