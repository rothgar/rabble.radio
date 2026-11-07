// src/app/api/recordings/[id]/audio/route.ts
//
// GET /api/recordings/[id]/audio
//
// Stable URL for a recording's audio, used as the podcast enclosure and by
// the in-app "Replay" player. The object store only issues short-lived
// signed URLs, so this route mints a fresh one and redirects. Any
// "available" recording is playable: finished shows are replayable from
// their page for the retention window, and publishing only controls the
// podcast feed. Recordings that are not ready are only described to their
// host.

import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getRecordingById, signedUrlFor } from '@/lib/recording';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const recording = await getRecordingById(id);
  if (!recording) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (recording.status !== 'available') {
    const user = await getCurrentUser();
    if (!user || user.did !== recording.hostDid) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'not_ready', message: `Recording is in status '${recording.status}'.` },
      { status: 409 }
    );
  }
  try {
    const url = await signedUrlFor(recording);
    return NextResponse.redirect(url, { status: 302 });
  } catch (err) {
    logger.error('recording.audio.sign_failed', { err, id });
    return NextResponse.json({ error: 'sign_failed' }, { status: 500 });
  }
}
