// tests/app/downloads.test.ts
//
// /downloads/[file] streams allow-listed mobile builds from the R2 bucket.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({ get: vi.fn(), env: {} as Record<string, unknown> }));

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: m.env }),
}));

import { GET, HEAD } from '@/app/downloads/[file]/route';

const req = (file: string, method = 'GET') =>
  new NextRequest(`http://localhost/downloads/${file}`, { method });
const ctx = (file: string) => ({ params: Promise.resolve({ file }) });

beforeEach(() => {
  vi.clearAllMocks();
  m.env.RECORDINGS = { get: m.get };
});

describe('GET /downloads/[file]', () => {
  it('serves the Android APK from builds/ with download headers', async () => {
    m.get.mockResolvedValueOnce({
      body: new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode('apk-bytes'));
          c.close();
        },
      }),
      size: 9,
      httpEtag: '"abc"',
      uploaded: new Date('2026-11-04T00:00:00Z'),
    });
    const res = await GET(req('rabble-android.apk'), ctx('rabble-android.apk'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/vnd.android.package-archive');
    expect(res.headers.get('content-disposition')).toContain('rabble-android.apk');
    expect(await res.text()).toBe('apk-bytes');
    expect(m.get).toHaveBeenCalledWith('builds/rabble-android.apk');
  });

  it('refuses anything not on the allow list', async () => {
    const res = await GET(req('..%2Fsecret.mp4'), ctx('../secret.mp4'));
    expect(res.status).toBe(404);
    expect(m.get).not.toHaveBeenCalled();
  });

  it('404s when the build has not been uploaded', async () => {
    m.get.mockResolvedValueOnce(null);
    expect((await GET(req('rabble-android.apk'), ctx('rabble-android.apk'))).status).toBe(404);
  });

  it('503s without the bucket binding', async () => {
    delete m.env.RECORDINGS;
    expect((await GET(req('rabble-android.apk'), ctx('rabble-android.apk'))).status).toBe(503);
  });
});

describe('HEAD /downloads/[file]', () => {
  it('reports the size with no body, the way next dev exercises it', async () => {
    m.get.mockResolvedValueOnce({
      body: new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode('apk-bytes'));
          c.close();
        },
      }),
      size: 9,
      httpEtag: '"abc"',
      uploaded: new Date('2026-11-04T00:00:00Z'),
    });
    const res = await HEAD(req('rabble-android.apk', 'HEAD'), ctx('rabble-android.apk'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-length')).toBe('9');
    expect(res.body).toBeNull();
  });
});
