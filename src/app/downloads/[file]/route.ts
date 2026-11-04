// src/app/downloads/[file]/route.ts
//
// GET /downloads/rabble-android.apk
//
// Serves test builds of the mobile apps straight from the recordings R2
// bucket (key `builds/<file>`), so a phone on any network can install the
// current build from a short URL. Only the allow-listed file names below are
// served; everything else is a 404.

import { NextResponse, type NextRequest } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const DOWNLOADS: Record<string, string> = {
  'rabble-android.apk': 'application/vnd.android.package-archive',
};

/** Minimal shape of the R2 binding, kept local to avoid the Workers globals. */
interface R2ObjectLike {
  body: ReadableStream;
  size: number;
  httpEtag: string;
  uploaded: Date;
}
interface R2BucketLike {
  get(key: string): Promise<R2ObjectLike | null>;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ file: string }> }
): Promise<Response> {
  const { file } = await context.params;
  const contentType = DOWNLOADS[file];
  if (!contentType) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const bucket = (getCloudflareContext().env as { RECORDINGS?: R2BucketLike }).RECORDINGS;
  if (!bucket) {
    return NextResponse.json({ error: 'storage_unavailable' }, { status: 503 });
  }
  const object = await bucket.get(`builds/${file}`);
  if (!object) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return new Response(object.body, {
    status: 200,
    headers: {
      'content-type': contentType,
      'content-length': String(object.size),
      'content-disposition': `attachment; filename="${file}"`,
      'cache-control': 'no-store',
      etag: object.httpEtag,
      'last-modified': object.uploaded.toUTCString(),
    },
  });
}
