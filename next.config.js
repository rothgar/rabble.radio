const { execSync } = require('node:child_process');

/** Short git SHA baked into the client so feedback reports name the build. */
function buildId() {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return process.env.NEXT_PUBLIC_BUILD_ID || 'dev';
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BUILD_ID: buildId() },
  // Baseline security headers on every response. No Content-Security-Policy
  // yet: it needs a report-only rollout against the live room (LiveKit wss,
  // blob: media, Bluesky avatar CDN) before it can enforce.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(self)' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

// Make the Cloudflare bindings (D1, R2) available to `next dev`. In the
// deployed Worker, OpenNext provides them.
import('@opennextjs/cloudflare').then(({ initOpenNextCloudflareForDev }) =>
  initOpenNextCloudflareForDev()
);
