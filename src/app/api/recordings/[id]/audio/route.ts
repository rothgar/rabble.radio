// src/app/api/recordings/[id]/audio/route.ts
//
// GET /api/recordings/[id]/audio
//
// Stable URL for a recording's audio, used as the podcast enclosure. The
// object store only issues short-lived signed URLs, so this route mints a
// fresh one and redirects. Published recordings are public; unpublished
// ones are only served to their host.

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
  if (!recording.published) {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (user.did !== recording.hostDid) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }
  if (recording.status !== 'available') {
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
