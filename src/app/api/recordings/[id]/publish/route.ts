// src/app/api/recordings/[id]/publish/route.ts
//
// POST /api/recordings/[id]/publish  { published: boolean }
//
// Host-only toggle that publishes (or unpublishes) a finished recording as
// a podcast episode. Published episodes appear in the host's RSS feed at
// /podcast/[handle]/feed.xml and can be fetched by anyone through
// /api/recordings/[id]/audio.

import { NextResponse, type NextRequest } from 'next/server';
import { jsonError, readJson, requireUser } from '@/lib/api';
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
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { id } = await context.params;
  if (!id) {
    return jsonError(404, 'not_found');
  }

  const body = await readJson<{ published?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  if (typeof body.published !== 'boolean') {
    return jsonError(400, 'validation_error', 'published must be a boolean.');
  }

  const recording = await getRecordingById(id);
  if (!recording) {
    return jsonError(404, 'not_found');
  }
  if (recording.hostDid !== user.did) {
    return jsonError(403, 'forbidden', 'Only the host can publish this recording.');
  }

  try {
    const updated = await setRecordingPublished(id, body.published);
    if (!updated) {
      return jsonError(404, 'not_found');
    }
    logger.info('recording.publish', { id, published: body.published, did: user.did });
    return NextResponse.json({ recording: toPublicRecording(updated) }, { status: 200 });
  } catch (err) {
    if (err instanceof RecordingStateError) {
      return jsonError(409, err.code, err.message);
    }
    logger.error('recording.publish.failed', { err, id });
    return jsonError(500, 'publish_failed', 'Failed to update recording.');
  }
}
