/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

module.exports = nextConfig;

// Make the Cloudflare bindings (D1, R2) available to `next dev`. In the
// deployed Worker, OpenNext provides them.
import('@opennextjs/cloudflare').then(({ initOpenNextCloudflareForDev }) =>
  initOpenNextCloudflareForDev()
);
