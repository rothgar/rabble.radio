# Rabble

Live audio spaces for Bluesky. Create a room, publish a "live" status record,
gather speakers on stage, and let the audience listen in. Built on
[Next.js 15](https://nextjs.org/) + [LiveKit](https://livekit.io/), deployed on
Kubernetes.

This repo currently covers the MVP:

- Bluesky OAuth (loopback in dev, planned `private_key_jwt` for production)
- Spaces CRUD with Postgres persistence (Prisma)
- LiveKit audio room with stage management (host can invite / remove speakers)
- Live banner (publishes `app.bsky.actor.status` self-record when the host goes live)
- Host-only post carousel so the host can pin posts to a running space
- Single-process Next.js server, Docker image, kind-based local K8s

## Quick start (Cloudflare, the deployed environment)

The app runs on Cloudflare Workers (OpenNext) with D1 for the database, R2
for recordings and LiveKit Cloud for media. The dev environment is
`rabble.rodeo`; `rabble.radio` will be a second environment with its own
resources. Config lives in `wrangler.jsonc`; secrets are set with
`wrangler secret put` (LIVEKIT_URL/API_KEY/API_SECRET, JWKS_PRIVATE_KEY,
JWKS_PUBLIC_KEY, JWKS_KID, SESSION_SECRET, S3_ACCESS_KEY, S3_SECRET_KEY).

```bash
pnpm install
pnpm prisma:generate                 # engine-less client (no Rust engine needed)
pnpm d1:migrate:local                # apply prisma/d1/*.sql to the local D1
pnpm cf:preview                      # build with OpenNext and run on workerd
pnpm cf:deploy                       # build and deploy the Worker
pnpm d1:migrate:remote               # apply new migrations to the remote D1
```

Schema changes: edit `prisma/schema.prisma`, regenerate the client, and add a
numbered SQL file under `prisma/d1/` (generate it with
`prisma migrate diff --from-schema-datamodel <old> --to-schema-datamodel prisma/schema.prisma --script`).
D1 is SQLite: tags live in join tables and JSON payloads are stored as text.

See `docs/CLOUDFLARE-MIGRATION.md` for the full layout and the production
plan.

## Quick start (no Kubernetes)

```bash
pnpm install
pnpm prisma:generate
pnpm dev
# open http://localhost:3000
```

You will need a running Postgres reachable on `DATABASE_URL` (default: `localhost:5432`). The easiest path is `docker run --rm -p 5432:5432 -e POSTGRES_USER=bluesky -e POSTGRES_PASSWORD=bluesky -e POSTGRES_DB=bluesky_spaces postgres:16`.

The default canonical URL is `http://rabble.town`; override it with
`NEXT_PUBLIC_APP_URL` if you use a different domain.

## Quick start (local Kubernetes)

Prereqs: Docker, [kind](https://kind.sigs.k8s.io/), [kubectl](https://kubernetes.io/docs/tasks/tools/).

```bash
./scripts/dev-cluster.sh
# follow the printed access instructions
curl -H "Host: rabble.town" http://localhost:8080/api/health
```

The script creates a kind cluster, installs the NGINX Ingress controller, builds the app image, loads it into kind, and applies the `k8s/overlays/kind` overlay (which includes the Ingress for `rabble.town`). It also prints the host's LAN IP so you can test from another machine on the same network without editing `/etc/hosts`. See [`docs/LOCAL_DEVELOPMENT.md`](docs/LOCAL_DEVELOPMENT.md) for the full local walkthrough.

## Quick start (production Kubernetes)

See [`docs/KUBERNETES.md`](docs/KUBERNETES.md) for the production deploy guide (required secrets, LiveKit UDP / TURN requirements, Ingress + TLS with cert-manager, resource limits, health probes).

## Bluesky OAuth setup

OAuth uses the loopback flow by default. For production (`PUBLIC_URL` set) the app moves to `private_key_jwt` against a hosted JWKS. See [`docs/BLUE_SKY_OAUTH_SETUP.md`](docs/BLUE_SKY_OAUTH_SETUP.md) for the metadata + key generation + registration walkthrough.

## Layout

```
k8s/
  base/                      # namespace, postgres, app, migration Job, RBAC
  overlays/kind/             # kind-only: + Ingress
  ingress.yaml               # NGINX Ingress for rabble.town
  certificate.yaml           # OPTIONAL cert-manager self-signed Certificate
  livekit.yaml               # LiveKit SFU Deployment + Service
  secret.example.yaml        # example Secret (copy, fill in, do NOT commit)
scripts/
  dev-cluster.sh             # local kind bootstrap (multi-machine friendly)
                             # builds image rabble:local by default
  gen-jwks.ts                # ES256 keypair generator (pnpm gen:jwks)
src/
  app/                       # Next.js App Router (UI + API routes)
  components/                # client components (room, stage, carousel, etc.)
  lib/                       # session, auth, db, livekit, spaces, stage, posts
docs/
  KUBERNETES.md              # production deploy guide
  LOCAL_DEVELOPMENT.md       # kind walkthrough
  BLUE_SKY_OAUTH_SETUP.md    # OAuth metadata + JWKS setup
tests/                       # Vitest unit + API tests
```

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Local Next.js dev server on `:3000` |
| `pnpm build` | Production build (standalone output) |
| `pnpm start` | Run the built server |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest one-shot |
| `pnpm lint` | Next.js / ESLint |
| `pnpm prisma:generate` | Regenerate Prisma client |
| `pnpm prisma:migrate` | Run `prisma migrate deploy` (production / CI) |
| `pnpm gen:jwks` | Write `jwks.json` + `private-key.pem` for OAuth |
| `./scripts/dev-cluster.sh` | Bootstrap a local kind cluster (image `rabble:local`) |

## License

UNLICENSED — internal MVP.

## Show metrics

Every time a station goes live a `ShowSession` row is opened and closed with
the show (`POST /api/spaces/[id]/live`). While it is open the app records who
is in the room (`ShowParticipation`, from the join route and the LiveKit
webhook at `/api/livekit/webhook`), stage time, reactions (`ShowReaction`)
and likes (`ShowLike`, via `GET/POST/DELETE /api/spaces/[id]/like`). When the
show ends the totals roll up into the station (`Space.likeCount`,
`sessionCount`, `totalListeners`, `hostedSeconds`), per-host per-topic
leaderboard rows (`HostTopicStats`, tag `*` = all topics) and per-topic totals
(`TopicStats`). Read them with `getHostLeaderboard`, `getTopicStats` and
`getRecentSessions` in `src/lib/metrics.ts`. Metrics writes are best-effort
and never block joining, reacting or going live.

The webhook needs `webhook.api_key` and `webhook.urls` in the LiveKit server
config pointing at the app (the homelab manifests set it; the kind dev
manifest in `k8s/livekit.yaml` runs LiveKit from flags only, so add a config
file there if you want presence metrics locally).

## Mobile apps

- `android/` — native Android client (Kotlin, Jetpack Compose, LiveKit Android SDK). `cd android && nix-shell && ./gradlew assembleDebug`; see `android/README.md`.
- `ios/` — native iOS client (SwiftUI, LiveKit Swift SDK), described by an XcodeGen `project.yml`; see `ios/README.md` for building on the Mac mini.
