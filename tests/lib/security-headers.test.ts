// tests/lib/security-headers.test.ts

import { describe, expect, it } from 'vitest';
import { SECURITY_HEADERS, withSecurityHeaders } from '@/lib/security-headers';

describe('withSecurityHeaders', () => {
  it('adds every baseline header and keeps the body and existing headers', async () => {
    const out = withSecurityHeaders(
      new Response('apk-bytes', {
        status: 200,
        headers: { 'content-type': 'application/vnd.android.package-archive', 'content-length': '9' },
      })
    );
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(out.headers.get(name)).toBe(value);
    }
    expect(out.headers.get('content-length')).toBe('9');
    expect(out.headers.get('content-type')).toBe('application/vnd.android.package-archive');
    expect(await out.text()).toBe('apk-bytes');
  });

  it('lets a header the app set win', () => {
    const out = withSecurityHeaders(new Response(null, { headers: { 'x-frame-options': 'SAMEORIGIN' } }));
    expect(out.headers.get('x-frame-options')).toBe('SAMEORIGIN');
  });

  it('keeps status, statusText and redirects intact', () => {
    const out = withSecurityHeaders(new Response(null, { status: 302, headers: { location: '/x' } }));
    expect(out.status).toBe(302);
    expect(out.headers.get('location')).toBe('/x');
  });
});
