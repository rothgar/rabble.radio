# Verification Report

## Issue
SSR `/spaces/[id]` crashes with
`TypeError: Cannot read properties of undefined (reading '_createPrismaPromise')`.

## Changes applied

### `next.config.js`

```js
const { PrismaPlugin } = require('@prisma/nextjs-monorepo-workaround-plugin')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
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
```

`PrismaPlugin` is required from `@prisma/nextjs-monorepo-workaround-plugin` (already
installed at `5.22.0`, matching `@prisma/client`) and added to `config.plugins`
inside the server webpack pass. `serverExternalPackages` and `output: 'standalone'`
are preserved.

No other files were modified. `prisma/schema.prisma` keeps the default output
location and `src/lib/db.ts` continues to import from `@prisma/client`.

## Verification steps run

| Step | Command | Result |
|------|---------|--------|
| 1 | `pnpm typecheck` | PASS (clean, 0 errors) |
| 2 | `node -e "require('./next.config.js')"` | PASS (config object loads; keys: reactStrictMode, output, serverExternalPackages, webpack; webpack is a function) |
| 3 | `make sync` | PASS (next.config.js synced to remote) |
| 4 | `make remote-build` | PASS (Docker build succeeded; all COPY stages from the Dockerfile, including the four `@prisma`/`node_modules/.prisma` lines, ran successfully; image `rabble:local` rebuilt) |
| 5 | `make remote-deploy` | PASS (`rabble-app` container recreated and Started) |
| 6a | `curl http://127.0.0.1:3000/api/health` | **200** |
| 6b | `curl http://127.0.0.1:3000/api/spaces/testing-uuicpydn` | **200** |
| 6c | `curl -H "Cookie: bs_spaces_session=..." http://127.0.0.1:3000/spaces/testing-uuicpydn` | **500** |
| 6d | `docker compose logs --tail=80 app \| grep "_createPrismaPromise"` | non-empty (1 line) — error still present |

## Test output

`pnpm typecheck` passes. The full `pnpm test` (vitest) suite was not re-run
this turn (no source files other than `next.config.js` were touched; previous
verification runs already confirmed the suite is green).

## Lint output

`pnpm lint` was not re-run this turn; no source files other than
`next.config.js` were modified, and the config file is JS (not linted as part
of the ESLint TypeScript pass in this repo's prior verification runs).

## HTTP verification (post-deploy, on remote host)

- `GET /api/health` -> 200 (healthy, the Prisma `SELECT 1` healthcheck passes)
- `GET /api/spaces/testing-uuicpydn` -> 200 (the JSON API route succeeds)
- `GET /spaces/testing-uuicpydn` (cookie-auth) -> **500** with stack:
  ```
  TypeError: Cannot read properties of undefined (reading '_createPrismaPromise')
      at D (.next/server/app/api/spaces/[id]/recording/route.js:70:377)
      at I (.next/server/app/api/spaces/[id]/recording/route.js:28:13)
      at m (.next/server/app/spaces/[id]/page.js:4:62798)
  ```

The error remains even after the PrismaPlugin reintroduction. Inspection of
the rebuilt container shows:

- `node_modules/@prisma/client/`, `node_modules/.prisma/client/`, and
  `node_modules/@prisma/engines/` are all present and intact in the runner.
- The `@prisma/client/index.js` re-exports from `.prisma/client/default` (the
  spec-correct, default-location output).
- The `nft.json` for the failing route correctly traces both
  `node_modules/.prisma/client/{default,index,package.json,schema.prisma,
  libquery_engine-debian-openssl-3.0.x.so.node}` and
  `node_modules/@prisma/client/{default.js,package.json,runtime/library.js}`.
- No bundled `.js` in `.next/server/` contains the literal
  `_createPrismaPromise` string; the function symbol is loaded at runtime via
  the `.prisma/client/default.js` require chain.

The remaining failure is that the page route `app/spaces/[id]/page.js`
server-renders and calls into the recording API route handler
`app/api/spaces/[id]/recording/route.js`, which calls Prisma and trips the
`_createPrismaPromise` undefined read. This indicates the PrismaClient
constructor still does not see the `PrismaPromise` prototype patch at runtime
in this specific route's module graph, even with `serverExternalPackages`
plus `PrismaPlugin` applied.

## Verdict

**HAS_FAILURES** — PrismaPlugin and `serverExternalPackages` are correctly
configured and the build/deploy pipeline is healthy, but the
`_createPrismaPromise` crash on the cookie-authenticated `/spaces/[id]` page
is NOT resolved by this single change. Two of the three required curl
checks pass; the cookie-authenticated `/spaces/[id]` check still returns
500 with the same PrismaPromise error.

## Recommended next step for the orchestrator

The PrismaPlugin + `serverExternalPackages` combination is now in place but
is insufficient on its own. Based on the stack-trace evidence (the failing
module is `app/api/spaces/[id]/recording/route.js`, an RSC server-only route
imported by the page), the most likely remaining causes and fixes are:

1. **Force the entire `@prisma/client` package as an externals match-string
   via webpack `externals` rather than `serverExternalPackages`.** Some
   Next.js 15 / webpack 5 combinations only respect bare-module
   `serverExternalPackages` for the entry chunk but still walk into
   `.prisma/client/default.js` for sub-modules. A direct
   `config.externals = [...(config.externals||[]), '@prisma/client',
   '@prisma/client/runtime/library', '.prisma/client',
   'node_modules/.prisma/client']` block inside the same `if (isServer)`
   branch should be added.

2. **Verify `.dockerignore` and the `node_modules/@prisma` COPY are landing
   the `engines` and `debug` sub-packages the Prisma 5.22 client dynamically
   requires** (already present in the container per inspection, but worth
   confirming the path is `node_modules/@prisma/engines` and not
   `node_modules/@prisma/engines/dist`).

3. **Try pinning `experimental.serverComponentsExternalPackages` (the
   Next.js 14-era key) in addition to the Next.js 15
   `serverExternalPackages`**, since the failing module is an RSC route and
   RSC externalization still consults the legacy key in some 15.x patch
   versions.

The file changes I made are limited to `next.config.js`; nothing in `src/`,
`prisma/`, `Dockerfile`, or `package.json` was modified, so the orchestrator
can revert this single file or layer the additional webpack externals fix on
top without conflict.
