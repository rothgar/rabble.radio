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

describe('content-security-policy-report-only', () => {
  const csp = SECURITY_HEADERS['content-security-policy-report-only'];

  it('is report-only, not enforcing', () => {
    expect(SECURITY_HEADERS['content-security-policy']).toBeUndefined();
    expect(csp).toBeTruthy();
  });

  it('allows the theme bootstrap script by hash, not unsafe-inline', () => {
    expect(csp).toMatch(/script-src[^;]*'sha256-[^']+'/);
    expect(csp).not.toMatch(/unsafe-inline/);
  });

  it('allows the LiveKit Cloud room, the Bluesky avatar CDN and blob: media', () => {
    expect(csp).toMatch(/connect-src[^;]*wss:\/\/\*\.livekit\.cloud/);
    expect(csp).toMatch(/img-src[^;]*https:\/\/cdn\.bsky\.app/);
    expect(csp).toMatch(/media-src[^;]*blob:/);
  });

  it('points violation reports at /api/csp-report', () => {
    expect(csp).toMatch(/report-to csp-endpoint/);
    expect(csp).toMatch(/report-uri \/api\/csp-report/);
    expect(SECURITY_HEADERS['reporting-endpoints']).toBe('csp-endpoint="/api/csp-report"');
  });
});
