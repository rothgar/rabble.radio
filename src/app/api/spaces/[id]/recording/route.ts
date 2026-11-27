// src/app/api/spaces/[id]/recording/route.ts
//
// GET  /api/spaces/[id]/recording -> return the latest recording for a
//                                   space if the caller is the host.
// POST /api/spaces/[id]/recording -> regenerate the signed download URL.
//
// 401 if unauthenticated, 403 if not the host, 404 if no space.

import { NextResponse, type NextRequest } from 'next/server';
import { resolveSpaceForUser } from '@/lib/spaces';
import { jsonError, requireUser } from '@/lib/api';
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
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { id } = await context.params;
  if (!id) {
    return jsonError(404, 'not_found');
  }
  const resolved = await resolveSpaceForUser(id, user.did);
  if (!resolved) {
    return jsonError(404, 'not_found');
  }
  if (!resolved.isHost) {
    return jsonError(403, 'forbidden', 'Only the host can access recordings.');
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
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { id } = await context.params;
  if (!id) {
    return jsonError(404, 'not_found');
  }
  const resolved = await resolveSpaceForUser(id, user.did);
  if (!resolved) {
    return jsonError(404, 'not_found');
  }
  if (!resolved.isHost) {
    return jsonError(403, 'forbidden', 'Only the host can refresh recordings.');
  }
  const recording = await getRecordingForSpace(resolved.space.id);
  if (!recording) {
    return jsonError(404, 'not_found', 'No recording exists for this show.');
  }
  if (recording.status !== 'available') {
    return jsonError(409, 'not_ready', `Recording is in status '${recording.status}'.`);
  }
  try {
    const refreshed = await refreshSignedUrl(recording.id);
    if (!refreshed) {
      return jsonError(500, 'refresh_failed');
    }
    return NextResponse.json(
      { downloadUrl: refreshed.downloadUrl },
      { status: 200 }
    );
  } catch (err) {
    logger.error('recording.refresh.failed', { err, id: recording.id });
    return jsonError(500, 'refresh_failed', 'Refresh failed.');
  }
}
