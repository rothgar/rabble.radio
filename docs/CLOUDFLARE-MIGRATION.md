# Cloudflare migration plan (dev environment: rabble.rodeo)

Goal: run the whole application on Cloudflare with LiveKit Cloud for media,
nothing left in the wrtk8s homelab cluster. `rabble.rodeo` is the development
environment. `rabble.radio` will be a second, separate deployment of the same
code later (own D1 database, R2 bucket, LiveKit project and secrets).

Dev-environment rules: fresh database (nothing is migrated from the homelab
Postgres), recordings are kept only long enough to test upload and publishing,
no CI required to start (deploys from a developer machine with wrangler).

## Target shape

| Concern | Today (wrtk8s) | After |
|---|---|---|
| Web app | Next.js container, Flux | Next.js on Workers via `@opennextjs/cloudflare` |
| Database | Postgres (CNPG) + Prisma | D1 (SQLite) + Prisma driver adapter |
| Live state (stage invites, speakers, blocks) | in-process `globalThis` maps | D1 tables (`StageInvite`, `StageSpeaker`, `StageBlock`); a Durable Object per show comes later for production scale |
| Media | LiveKit server + egress + Redis on the cluster, Cloudflare TURN | LiveKit Cloud project (includes TURN and egress) |
| Recordings | Garage (S3) on the cluster | R2 bucket; egress uploads over the S3 API, the app serves through an R2 binding |
| Public access | cloudflared tunnel hostnames on jgarr.net | Worker custom domain `rabble.rodeo` |
| Expire sweep | request-time call | Worker Cron Trigger (`scheduled` handler) |
| Secrets | k8s Secrets | Worker secrets via `wrangler secret put` |
| Email (later, TODO 9) | none | Email Service `send_email` binding |

## Phases

### 0. Baseline (done when the LiveKit relay fix is pushed and verified)
The homelab keeps running until cut-over so there is always a working
environment to compare against.

### 1. Scaffolding (no app changes)
- `wrangler.jsonc` with `nodejs_compat`, the D1, R2 and (later) email bindings,
  a Cron Trigger for the sweep, and `rabble.rodeo` as a custom domain.
- Create D1 database `rabble-dev` and R2 bucket `rabble-dev-recordings`.
- `pnpm` scripts: `cf:build`, `cf:preview` (local workerd), `cf:deploy`,
  `cf:migrate` (wrangler d1 migrations apply).
- Generate a fresh JWKS key pair and session secret for the new origin and
  store them as Worker secrets.

### 2. Spike the two risks before porting anything else
1. **Bluesky OAuth on Workers.** `@atproto/oauth-client-node` uses Node crypto
   and `JoseKey`. Deploy a throwaway Worker that builds the client, serves
   `/oauth-client-metadata.json` and `/.well-known/jwks.json`, and completes
   an authorize + callback round trip against bsky.social. If it fails under
   `nodejs_compat`, switch to the runtime-agnostic `@atproto/oauth-client`
   with `@atproto/jwk-webcrypto` keys.
2. **Prisma on D1.** Prisma with the D1 driver adapter and the engine-less
   query compiler, with a schema containing a Json-as-text column and a join
   table, against a real D1 database from a Worker.

### 3. Schema port (branch `cloudflare`)
- `provider = "sqlite"`, driver adapter `@prisma/adapter-d1`, no Rust engine
  (`engineType`/`queryCompiler`), which also removes the webpack-only
  `@prisma/nextjs-monorepo-workaround-plugin` and the `--webpack` flag.
- Postgres arrays become join tables: `SpaceTag(spaceId, tag)` and
  `ShowSessionTag(sessionId, tag)`. `tags: { has }` queries become joins.
- `Json` columns (e.g. `OAuthSession.data`) become `String` holding JSON.
- Live stage state moves from memory into D1 tables; `src/lib/stage.ts`
  keeps its API, tests keep passing.
- Metrics roll-ups (`src/lib/metrics.ts`) stop relying on `$transaction`
  (D1 runs each statement separately) and use idempotent per-row updates.
- Migrations: `prisma migrate diff` generates SQL into `migrations/` and
  `wrangler d1 migrations apply` runs it locally and remotely. The old
  Postgres migrations directory is retired with the cluster.

### 4. Runtime port
- `@opennextjs/cloudflare` build; `proxy.ts` is supported by the adapter.
- `src/lib/storage.ts`: R2 binding for reads and for serving downloads
  through a route (needed later for paid feeds); egress keeps uploading via
  the R2 S3 endpoint with an R2 API token.
- `src/lib/livekit.ts`: LiveKit Cloud URL and keys from secrets; Cloudflare
  TURN code stays but is unset (LiveKit Cloud provides TURN).
- `scheduled` handler for the expire sweep and recording expiry.
- Mobile apps: build with `RABBLE_BASE_URL` / `rabbleBaseUrl` set to
  `https://rabble.rodeo` (web OAuth flow, so nothing else changes).

### 5. Verify on staging, then cut over
- Deploy to `rabble-dev.<account>.workers.dev`, run the full checklist below,
  then attach the `rabble.rodeo` custom domain and set
  `BLUESKY_OAUTH_CLIENT_ID` / `PUBLIC_URL` to it.
- Checklist: health, login round trip, create show, go live, join from web
  and from the Android emulator off the LAN, reaction, like, stage invite and
  accept, end show, recording appears in R2 and downloads, metrics rows
  present, sweep ran on schedule, webhook events recorded.

### 6. Decommission the homelab components
- Remove `clusters/wrtk8s/rabble/` from homelab-flux (Flux prunes the
  namespace: app, LiveKit, egress, Redis, Garage, Postgres).
- Remove the two Cloudflare Tunnel public hostnames on jgarr.net and the
  `rabble-turn` secret.
- Update `docs/KUBERNETES.md` to describe the kind-based local setup only,
  or drop it if the local workflow becomes `wrangler dev`.

## Production later (rabble.radio)
Same repo, a second wrangler environment with its own D1, R2, LiveKit Cloud
project, secrets and custom domain. Additions for scale: a Durable Object per
live show to batch reactions and hold stage state, Cloudflare Stream Live
(RTMP from LiveKit egress, HLS out) for listen-only audiences, Stripe and
per-subscriber podcast feeds served from R2, Email Service for digests.

## Access and inputs needed
See the checklist in the conversation that created this file; kept here so
the next person can pick it up:

1. A LiveKit Cloud project (dev) with its `wss://` URL, API key and secret,
   stored as Worker secrets `LIVEKIT_URL`, `LIVEKIT_API_KEY`,
   `LIVEKIT_API_SECRET`.
2. An R2 API token (object read/write on the dev bucket) for LiveKit egress
   uploads, stored as `S3_ACCESS_KEY` / `S3_SECRET_KEY`.
3. The Cloudflare account is `0f8fe574f3489eda5a599104efd24d26`; the
   existing `wrangler login` on this machine covers Workers, D1, R2,
   routes and email sending.
4. Optional: a `CLOUDFLARE_API_TOKEN` GitHub secret if deploys should move
   to GitHub Actions.

## Status (2026-11-01)

Done on the `cloudflare` branch: wrangler config, D1 `rabble-dev` (migrated),
R2 `rabble-dev-recordings`, SQLite schema with join tables and JSON text,
engine-less Prisma over the D1 adapter, stage state and OAuth state in D1,
runtime-agnostic atproto OAuth client (with a Workers-safe identity resolver
in `src/lib/atproto-runtime.ts`), OpenNext build, cron Worker entry, secrets
uploaded. Verified locally on workerd: health, pages, API, expire sweep,
OAuth metadata/JWKS, and an authorize request that reaches bsky.social.

Findings worth keeping:
- `@atproto/oauth-client-node` cannot run on Workers (Node-only fetch
  guard); `@atproto/oauth-client` can, but its resolvers use
  `redirect: "error"`, hence the custom identity resolver and fetch wrapper.
- `@atproto/jwk-jose` depends on jose 5, whose Node build Next picks for the
  server bundle; that build calls `node:crypto` signing that workerd rejects.
  `pnpm.overrides` pins jose to v6 (universal WebCrypto build).
- `WebcryptoKey.generate` fails its `instanceof CryptoKey` check inside the
  OpenNext bundle; DPoP keys are generated with `JoseKey.generate` instead.
- `@cloudflare/workers-types` must not be referenced from files in the
  Next.js tsconfig program (it redefines `Response.json()` as `unknown`);
  `custom-worker.ts` is excluded from tsconfig.

Remaining: deploy, attach `rabble.rodeo`, LiveKit Cloud end-to-end test
(join from the Android emulator off the LAN, recording to R2), then remove
`clusters/wrtk8s/rabble` from homelab-flux and the jgarr.net tunnel hostnames.
