# syntax=docker/dockerfile:1.7

# ---------- Stage 1: deps ----------
FROM node:22-bookworm-slim AS deps
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
# Note: do NOT pass --ignore-scripts; Prisma's postinstall downloads engine
# binaries into the pnpm virtual store and we need them at runtime.
# Use --config.node-linker=hoisted so node_modules ends up flat (not symlinked
# into .pnpm). This makes Prisma's runtime module resolution work without
# us having to hand-copy the virtual store tree into the runner image.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --config.node-linker=hoisted

# ---------- Stage 2: builder ----------
FROM node:22-bookworm-slim AS builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://bluesky:bluesky@postgres:5432/bluesky_spaces?schema=public"
# Install openssl so prisma generate can detect the runtime openssl version
# (debian bookworm ships openssl-3.x). Do NOT set PRISMA_QUERY_ENGINE_LIBRARY
# here: prisma generate validates the path and would fail.
RUN apt-get update && \
    apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*
# Generate the Prisma client into the default location
# (node_modules/@prisma/client + node_modules/.prisma/client). This MUST run
# before `pnpm build` so the generated types exist when Next.js / TypeScript
# compile the app.
RUN pnpm prisma generate
RUN pnpm build

# ---------- Stage 3: runner ----------
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs && \
    apt-get update && \
    apt-get install -y --no-install-recommends netcat-openbsd openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Standalone Next.js production image. The standalone output already includes
# the minimal node_modules tree it needs; we copy only the additional bits the
# runner needs at runtime:
#   - .next/standalone -> the trimmed server bundle (already includes a
#     server-side subset of node_modules)
#   - .next/static     -> client-side assets
#   - public           -> static files served as-is
#   - prisma           -> schema and migrations (for `migrate deploy` etc.)
#   - node_modules/.prisma   -> the generated client artefacts (engine binary
#     and schema) produced by `prisma generate` into the default location.
#   - node_modules/@prisma/client -> the generated client package entry point.
# The @prisma/nextjs-monorepo-workaround-plugin webpack plugin copies the
# schema and engine binaries next to the bundled server chunk, but the
# runtime also resolves the generated client via the package's own require()
# so we ship it explicitly to be safe.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client
# Copy the prisma CLI package plus the @prisma/* runtime helpers it depends
# on (engines, debug, etc.) so the `migrate` service can run
# `prisma migrate deploy` without us having to ship the full node_modules
# tree. The prisma package's `main` is build/index.js so we invoke it
# directly via `node` in docker-compose.yml to avoid relying on the .bin
# symlink.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
