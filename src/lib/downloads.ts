// Mobile test builds served straight from the recordings R2 bucket (key
// `builds/<file>`), so a phone on any network can install the current build
// from a short URL. Only the allow-listed names are served.
//
// Two entry points share this: custom-worker.ts answers /downloads/* before
// Next.js sees the request (since Next 16.4.6 every route-handler Response
// loses its content-length, so a 78 MB APK would download with no size), and
// src/app/downloads/[file]/route.ts keeps `next dev` working.

export const DOWNLOADS: Readonly<Record<string, string>> = {
  'rabble-android.apk': 'application/vnd.android.package-archive',
};

/** Minimal shape of the R2 binding, kept local to avoid the Workers globals. */
export interface R2ObjectLike {
  body: ReadableStream;
  size: number;
  httpEtag: string;
  uploaded: Date;
}
export interface R2BucketLike {
  get(key: string): Promise<R2ObjectLike | null>;
}

/** The file name for a /downloads/<file> path, or null when it is not one. */
export function downloadFileFromPath(pathname: string): string | null {
  const m = /^\/downloads\/([^/]+)$/.exec(pathname);
  if (!m) return null;
  // decodeURIComponent throws on a malformed percent sequence (REVIEW.md:
  // src/app/station/[tag]/page.tsx) rather than letting the allow-list reject it.
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

/**
 * Build the response for one allow-listed download. 404 for unknown names or
 * a missing object, 503 without the bucket. HEAD gets the same headers and no
 * body, so the size is visible without a transfer.
 */
export async function serveDownload(
  file: string,
  method: string,
  bucket: R2BucketLike | undefined
): Promise<Response> {
  const contentType = DOWNLOADS[file];
  if (!contentType) return Response.json({ error: 'not_found' }, { status: 404 });
  if (!bucket) return Response.json({ error: 'storage_unavailable' }, { status: 503 });
  const object = await bucket.get(`builds/${file}`);
  if (!object) return Response.json({ error: 'not_found' }, { status: 404 });
  const headers = {
    'content-type': contentType,
    'content-length': String(object.size),
    'content-disposition': `attachment; filename="${file}"`,
    'cache-control': 'no-store',
    etag: object.httpEtag,
    'last-modified': object.uploaded.toUTCString(),
  };
  if (method === 'HEAD') {
    // Drop the stream so it is not left open.
    void object.body.cancel().catch(() => undefined);
    return new Response(null, { status: 200, headers });
  }
  return new Response(object.body, { status: 200, headers });
}
