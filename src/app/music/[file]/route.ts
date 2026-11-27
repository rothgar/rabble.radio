// src/app/music/[file]/route.ts
//
// GET /music/<file> — streams a pre-show music track from the recordings
// bucket (key `music/<file>`). Only files in the catalog are served. Byte
// ranges are honoured because Safari and the Android MediaPlayer ask for
// them before they will play anything.
//
// In the deployed Worker, custom-worker.ts answers this path before
// Next.js (see src/lib/music.ts for why); this route is what `next dev`
// and the tests use, and the serving logic lives in src/lib/music.ts.

import type { NextRequest } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { serveMusic, type R2BucketLike } from '@/lib/music';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export { parseRange } from '@/lib/music';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ file: string }> }
): Promise<Response> {
  const { file } = await context.params;
  const bucket = (getCloudflareContext().env as { RECORDINGS?: R2BucketLike }).RECORDINGS;
  return serveMusic(file, request.method, request.headers.get('range'), bucket);
}

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ file: string }> }
): Promise<Response> {
  const { file } = await context.params;
  const bucket = (getCloudflareContext().env as { RECORDINGS?: R2BucketLike }).RECORDINGS;
  return serveMusic(file, request.method, request.headers.get('range'), bucket);
}
