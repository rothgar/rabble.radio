const { PrismaPlugin } = require('@prisma/nextjs-monorepo-workaround-plugin')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  eslint: {
    // Temporary workaround: Next.js 15 + eslint.config.mjs FlatCompat fails
    // with "Unknown options: useEslintrc, extensions". Re-enable after
    // migrating eslint.config.mjs to a native flat config.
    ignoreDuringBuilds: true,
  },
  // Next.js 15 auto-externalizes @prisma/client by default, but explicitly
  // listing it (plus the runtime and engine packages) ensures the generated
  // client and its engine binary are resolved from node_modules at runtime
  // instead of being bundled into the SSR chunks. Bundling the Prisma runtime
  // strips the PrismaPromise prototype patch and causes:
  //   TypeError: Cannot read properties of undefined (reading '_createPrismaPromise')
  serverExternalPackages: [
    '@prisma/client',
    '@prisma/client/runtime/library',
    '@prisma/engines',
  ],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // The PrismaPlugin copies schema.prisma and the engine binaries into
      // the server bundle output and rewrites the nft.json trace so the
      // standalone runner resolves the Prisma client at runtime. Required
      // because the standalone output does not include node_modules/.prisma
      // by default.
      config.plugins = [...(config.plugins || []), new PrismaPlugin()]
    }

    return config
  },
};

module.exports = nextConfig;
