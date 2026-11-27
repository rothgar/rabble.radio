// Baseline security headers added to every response by custom-worker.ts.
// No Content-Security-Policy yet: it needs a report-only rollout against the
// live room (LiveKit wss, blob: media, Bluesky avatar CDN) before enforcing.
// Kept out of next.config.js `headers()` on purpose: OpenNext applies those
// by rebuilding the response, which loses content-length on streamed bodies.

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), geolocation=(), microphone=(self)',
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
