// src/app/music/[file]/route.ts
//
// GET /music/<file> — streams a pre-show music track from the recordings
// bucket (key `music/<file>`). Only files in the catalog are served. Byte
// ranges are honoured because Safari and the Android MediaPlayer ask for
// them before they will play anything.

import { NextResponse, type NextRequest } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { trackByFile } from '@/lib/music';
import { withR2Timeout, R2TimeoutError } from '@/lib/r2-timeout';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface R2ObjectLike {
  body: ReadableStream;
  size: number;
  httpEtag: string;
}
interface R2BucketLike {
  get(key: string, options?: { range?: { offset: number; length: number } }): Promise<R2ObjectLike | null>;
  head(key: string): Promise<{ size: number } | null>;
}

/** Parse a single `bytes=a-b` range against a known size; null when absent or unusable. */
export function parseRange(header: string | null, size: number): { offset: number; length: number } | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, a, b] = m;
  if (a === '' && b === '') return null;
  let start: number;
  let end: number;
  if (a === '') {
    const suffix = Number(b);
    if (suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(a);
    end = b === '' ? size - 1 : Math.min(Number(b), size - 1);
  }
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) return null;
  return { offset: start, length: end - start + 1 };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ file: string }> }
): Promise<Response> {
  const { file } = await context.params;
  const track = trackByFile(file);
  if (!track) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const bucket = (getCloudflareContext().env as { RECORDINGS?: R2BucketLike }).RECORDINGS;
  if (!bucket) {
    return NextResponse.json({ error: 'storage_unavailable' }, { status: 503 });
  }
  const key = `music/${file}`;
  // head() and get() are raced against one shared budget, not one each:
  // stacking two independent timeouts would let a request that stalls on
  // both calls take up to 2x R2_TIMEOUT_MS before answering, defeating the
  // point of bounding it.
  let head: { size: number } | null;
  let object: R2ObjectLike | null;
  let range: { offset: number; length: number } | null;
  try {
    ({ head, object, range } = await withR2Timeout(
      (async () => {
        const h = await bucket.head(key);
        if (!h) return { head: null, object: null, range: null };
        const r = parseRange(request.headers.get('range'), h.size);
        const o = await bucket.get(key, r ? { range: r } : undefined);
        return { head: h, object: o, range: r };
      })(),
      'music.r2_timeout',
      { file }
    ));
  } catch (err) {
    if (err instanceof R2TimeoutError) {
      return NextResponse.json({ error: 'storage_timeout' }, { status: 504 });
    }
    throw err;
  }
  if (!head || !object) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const headers: Record<string, string> = {
    'content-type': 'audio/mpeg',
    'accept-ranges': 'bytes',
    'cache-control': 'public, max-age=31536000, immutable',
    etag: object.httpEtag,
    'x-music-title': track.title,
  };
  if (range) {
    headers['content-length'] = String(range.length);
    headers['content-range'] = `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`;
    return new Response(object.body, { status: 206, headers });
  }
  headers['content-length'] = String(head.size);
  return new Response(object.body, { status: 200, headers });
}
