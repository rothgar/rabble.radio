// src/app/downloads/[file]/route.ts
//
// GET /downloads/rabble-android.apk
//
// Serves test builds of the mobile apps from the recordings R2 bucket. In
// the deployed Worker, custom-worker.ts answers this path before Next.js
// (see src/lib/downloads.ts for why); this route is what `next dev` and the
// tests use, and the allow list lives in src/lib/downloads.ts.

import type { NextRequest } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { DOWNLOADS, serveDownload, type R2BucketLike } from '@/lib/downloads';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export { DOWNLOADS };

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ file: string }> }
): Promise<Response> {
  const { file } = await context.params;
  const bucket = (getCloudflareContext().env as { RECORDINGS?: R2BucketLike }).RECORDINGS;
  return serveDownload(file, request.method, bucket);
}
