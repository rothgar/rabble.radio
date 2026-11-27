// tests/lib/downloads.test.ts

import { describe, expect, it, vi } from 'vitest';
import { downloadFileFromPath, serveDownload } from '@/lib/downloads';

function object(bytes = 'apk-bytes') {
  return {
    body: new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(bytes));
        c.close();
      },
    }),
    size: bytes.length,
    httpEtag: '"abc"',
    uploaded: new Date('2026-11-04T00:00:00Z'),
  };
}

describe('downloadFileFromPath', () => {
  it('matches only one-segment /downloads paths', () => {
    expect(downloadFileFromPath('/downloads/rabble-android.apk')).toBe('rabble-android.apk');
    expect(downloadFileFromPath('/downloads/a/b')).toBeNull();
    expect(downloadFileFromPath('/downloads')).toBeNull();
    expect(downloadFileFromPath('/api/health')).toBeNull();
  });
});

describe('serveDownload', () => {
  it('streams an allow-listed build with its size and download headers', async () => {
    const get = vi.fn(async () => object());
    const res = await serveDownload('rabble-android.apk', 'GET', { get });
    expect(get).toHaveBeenCalledWith('builds/rabble-android.apk');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-length')).toBe('9');
    expect(res.headers.get('content-type')).toBe('application/vnd.android.package-archive');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="rabble-android.apk"');
    expect(await res.text()).toBe('apk-bytes');
  });

  it('answers HEAD with the same headers and no body', async () => {
    const res = await serveDownload('rabble-android.apk', 'HEAD', { get: vi.fn(async () => object()) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-length')).toBe('9');
    expect(res.body).toBeNull();
  });

  it('404s for names off the allow list and for missing objects, 503 without a bucket', async () => {
    expect((await serveDownload('../secret', 'GET', { get: vi.fn() })).status).toBe(404);
    expect((await serveDownload('rabble-android.apk', 'GET', { get: vi.fn(async () => null) })).status).toBe(404);
    expect((await serveDownload('rabble-android.apk', 'GET', undefined)).status).toBe(503);
  });

  it('504s instead of hanging when the R2 get() never settles', async () => {
    vi.useFakeTimers();
    try {
      const get = vi.fn(() => new Promise<never>(() => undefined));
      const pending = serveDownload('rabble-android.apk', 'GET', { get });
      await vi.advanceTimersByTimeAsync(10_000);
      expect((await pending).status).toBe(504);
    } finally {
      vi.useRealTimers();
    }
  });
});
