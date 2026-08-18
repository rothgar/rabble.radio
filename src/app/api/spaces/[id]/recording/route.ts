// src/app/api/spaces/[id]/recording/route.ts
//
// GET  /api/spaces/[id]/recording -> return the latest recording for a
//                                   space if the caller is the host.
// POST /api/spaces/[id]/recording -> regenerate the signed download URL.
//
// 401 if unauthenticated, 403 if not the host, 404 if no space.

import { NextResponse, type NextRequest } from 'next/server';
import { resolveSpaceForUser } from '@/lib/spaces';
import { getCurrentUser } from '@/lib/session';
import {
  getRecordingForSpace,
  refreshSignedUrl,
  toPublicRecording,
} from '@/lib/recording';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
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
  const resolved = await resolveSpaceForUser(id, user.did);
  if (!resolved) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (!resolved.isHost) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Only the host can access recordings.' },
      { status: 403 }
    );
  }
  const recording = await getRecordingForSpace(resolved.space.id);
  return NextResponse.json(
    { recording: recording ? toPublicRecording(recording) : null },
    { status: 200 }
  );
}

export async function POST(
  _request: NextRequest,
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
  const resolved = await resolveSpaceForUser(id, user.did);
  if (!resolved) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (!resolved.isHost) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Only the host can refresh recordings.' },
      { status: 403 }
    );
  }
  const recording = await getRecordingForSpace(resolved.space.id);
  if (!recording) {
    return NextResponse.json(
      { error: 'not_found', message: 'No recording exists for this space.' },
      { status: 404 }
    );
  }
  if (recording.status !== 'available') {
    return NextResponse.json(
      {
        error: 'not_ready',
        message: `Recording is in status '${recording.status}'.`,
      },
      { status: 409 }
    );
  }
  try {
    const refreshed = await refreshSignedUrl(recording.id);
    if (!refreshed) {
      return NextResponse.json(
        { error: 'refresh_failed' },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { downloadUrl: refreshed.downloadUrl },
      { status: 200 }
    );
  } catch (err) {
    logger.error('recording.refresh.failed', { err, id: recording.id });
    return NextResponse.json(
      {
        error: 'refresh_failed',
        message: err instanceof Error ? err.message : 'Refresh failed.',
      },
      { status: 500 }
    );
  }
}
