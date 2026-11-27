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
  // Security headers live in custom-worker.ts (src/lib/security-headers.ts),
  // not in a `headers()` block here: OpenNext applies config headers by
  // rebuilding the response, which drops content-length on streamed bodies
  // such as the APK download.
};

module.exports = nextConfig;

// Make the Cloudflare bindings (D1, R2) available to `next dev`. In the
// deployed Worker, OpenNext provides them.
import('@opennextjs/cloudflare').then(({ initOpenNextCloudflareForDev }) =>
  initOpenNextCloudflareForDev()
);
