// tests/app/security-txt-route.test.ts
//
// Tests for GET /.well-known/security.txt (RFC 9116).

import { describe, it, expect } from 'vitest';
import { GET } from '@/app/.well-known/security.txt/route';

describe('GET /.well-known/security.txt', () => {
  it('serves a valid RFC 9116 document', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(
      /text\/plain; charset=utf-8/
    );
    expect(res.headers.get('cache-control')).toMatch(/max-age=86400/);

    const body = await res.text();
    expect(body).toMatch(/^Contact: mailto:security@rabble\.radio\r\n/);
    expect(body).toMatch(/\r\nExpires: \d{4}-\d{2}-\d{2}T[\d:.]+Z\r\n/);
    expect(body).toMatch(
      /\r\nCanonical: https:\/\/rabble\.radio\/\.well-known\/security\.txt\r\n/
    );
  });

  it('has not yet expired', async () => {
    // Catches a forgotten yearly refresh of EXPIRES before it ships stale:
    // see the REVIEW.md note on this file.
    const res = await GET();
    const body = await res.text();
    const [, expires] = body.match(/\r\nExpires: (\S+)\r\n/) ?? [];
    expect(expires).toBeDefined();
    expect(new Date(expires!).getTime()).toBeGreaterThan(Date.now());
  });
});
