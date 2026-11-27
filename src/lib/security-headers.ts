// Baseline security headers added to every response by custom-worker.ts.
// Kept out of next.config.js `headers()` on purpose: OpenNext applies those
// by rebuilding the response, which loses content-length on streamed bodies.
//
// Content-Security-Policy ships report-only first (issue #180): the live
// room (LiveKit wss, blob: media, Bluesky avatar CDN) needs a few days of
// reports against /api/csp-report before a follow-up switches it to
// enforcing. The only inline script is the theme bootstrap in
// src/app/layout.tsx (a build-time constant, hashed below); the only
// third-party script is the optional Cloudflare Web Analytics beacon.

const THEME_SCRIPT_HASH = "'sha256-xjvOfUib5M5fPe9SAhOqoPYEIGPHeRcvpKmUA0Zv0NQ='";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' ${THEME_SCRIPT_HASH} https://static.cloudflareinsights.com`,
  "connect-src 'self' wss://*.livekit.cloud https://*.livekit.cloud https://cloudflareinsights.com https://public.api.bsky.app",
  "img-src 'self' data: https://cdn.bsky.app",
  "media-src 'self' blob:",
  "font-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'report-to csp-endpoint',
  'report-uri /api/csp-report',
].join('; ');

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), geolocation=(), microphone=(self)',
  'content-security-policy-report-only': CONTENT_SECURITY_POLICY,
  'reporting-endpoints': 'csp-endpoint="/api/csp-report"',
};

/**
 * Return `response` with the baseline headers added. Headers the app already
 * set win. The body stream and every other header (content-length included)
 * pass through untouched; WebSocket upgrades (101) are returned as they are.
 */
export function withSecurityHeaders(response: Response): Response {
  if (response.status === 101) return response;
  // Prefer adding to the response in place: a rebuilt Response can lose
  // content-length on a streamed body. Only an immutable Headers object (a
  // response straight from fetch()) forces the copy.
  try {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      if (!response.headers.has(name)) response.headers.set(name, value);
    }
    return response;
  } catch {
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      if (!headers.has(name)) headers.set(name, value);
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
}
