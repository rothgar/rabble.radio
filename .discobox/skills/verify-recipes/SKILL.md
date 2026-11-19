---
name: verify-recipes
description: How to verify a rabble.radio change at runtime inside a discobox — the web app on :3000 against the local D1 with demo shows, the LiveKit dev server for the live room, headless Chromium screenshots in light and dark mode at phone width, anonymous listener joins through the API, and what cannot run in a box (Bluesky login, deploys, the Android and iOS apps). The generic `verify` skill reads this first. Use when verifying a change, reproducing a reported bug, or taking the screenshots a PR needs.
---

# Verifying rabble.radio in a box

The product is the web app (Next.js on Cloudflare Workers; in a box it runs
under `next dev` against a local D1). A change is verified when the running
app, driven through its pages or API routes, shows the new behaviour.

## What the box already has

`.discobox/scripts/pre-harness` ran before you started: dependencies, the
Prisma client, the local D1 migrated and seeded with demo hosts and shows,
and `.env.local` with a dev session secret and LiveKit dev credentials.
Two services start at boot (`discobox admin service ls` to check, `logs` to read):

| Service | What | Check |
|---|---|---|
| `web` | `pnpm dev --port 3000` | `curl -s localhost:3000/api/health` |
| `livekit` | LiveKit server in dev mode on `:7880` (`devkey` / `secret`) | `curl -s -o /dev/null -w '%{http_code}\n' localhost:7880` |

If `web` is not up, `pnpm dev --port 3000` in a terminal does the same thing.
It hot-reloads, so edits are live without a restart.

## Data

The local D1 is SQLite under `.wrangler/state/`. Query it with wrangler:

```bash
pnpm exec wrangler d1 execute rabble-dev --local --command "select id, slug, title, status from Space order by createdAt desc limit 10"
pnpm exec wrangler d1 execute rabble-dev --local --command "select did, handle from User limit 10"
```

The seed (`node scripts/seed-demo.mjs --local`; `--remove` wipes it) creates
hosts `*.demo.rabble.rodeo` and shows with slugs starting `demo-`. Their rooms
are empty: joining shows an empty stage. Model names are in
`prisma/schema.prisma` (`Space` is a show, `ShowSession`, `ShowReaction`,
`StageInvite`, ...).

## Pages worth driving

| URL | Shows |
|---|---|
| `/` | Home: live and upcoming shows, hero, "Get the app" |
| `/shows`, `/stations`, `/hosts` | Listings |
| `/show/<id>` | A show page; "Join" enters the live room as an anonymous listener |
| `/downloads` | App downloads page |
| `/me` | Needs a Bluesky login (see below) |
| `/api/health` | `{status, checks: {db, livekit}}` |

The live room (`SpaceRoom`) is a client component that joins LiveKit; the
room UI, reactions, raised hands and stage controls are all in it.

## Screenshots (headless Chromium)

`chromium` is installed in the box (the `browser` feature; if it is not there
yet, wait a minute). Phone width first, then desktop; light and dark:

```bash
shot() { # shot OUT.png URL [extra chromium flags]
  local out=$1 url=$2; shift 2
  chromium --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
    --window-size=390,844 --virtual-time-budget=8000 \
    --screenshot="$out" "$@" "$url" 2>/dev/null
}
shot /tmp/home-light.png http://localhost:3000/
shot /tmp/home-dark.png  http://localhost:3000/ --force-dark-mode
shot /tmp/show.png       "http://localhost:3000/show/$(pnpm exec wrangler d1 execute rabble-dev --local --json --command "select id from Space limit 1" | jq -r '.[0].results[0].id')"
```

Then read the PNGs (your harness shows images) and check what the issue is
about, not just that something rendered. For desktop use `--window-size=1280,900`.
The theme toggle stores `rabble-theme` in `localStorage`; `--force-dark-mode`
exercises the system-default path, which is what most users see.

Keep screenshots out of the tree. Put the one frame that matters in the PR's
Evidence (upload it as a PR comment attachment or describe it), never under
`public/` or `docs/`.

## The live room

Anonymous listeners join without a login:

```bash
ID=$(pnpm exec wrangler d1 execute rabble-dev --local --json --command "select id from Space where status='live' limit 1" | jq -r '.[0].results[0].id')
curl -s -X POST localhost:3000/api/spaces/$ID/join -H 'content-type: application/json' -d '{}' | jq '{role, anonymous, wsUrl}'
```

A `token` and `wsUrl: ws://localhost:7880` means the app and LiveKit agree.
To watch the room UI itself, screenshot `/show/<id>` after clicking Join, or
drive it with Chromium's DevTools protocol with fake media devices:
`--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`.
Reactions, raised hands and stage changes travel as LiveKit data messages and
participant attributes (`hand=1`), so two headless pages in the same room
can see each other's state.

Audio itself (someone actually speaking) has no headless surface: say so in
the PR when a change is about audio quality or device handling.

## What needs a logged-in user

Login is Bluesky OAuth against a real account; a box has none. Host-only
flows (creating a show, inviting to stage, recording, admin) are verified by:

1. The route's tests under `tests/api/` and `tests/lib/` (they mock the
   session), extended for the change.
2. Reading the handler to confirm the session check and the call path.
3. Saying in the PR's Evidence which flow was not driven live and why.

Do not add a login bypass or a dev-only auth route to get past this.

## Checks (CI's job, not verification)

`pnpm typecheck && pnpm lint && pnpm test` must be green before a PR opens.
The box's hooks (`.discobox/hooks/`) run typecheck and lint on save and the
vitest suite at review time. There is no GitHub Actions CI on this repository
today: a PR with no checks is green once those three pass in the box, and the
PR's Evidence says so.

## Out of reach in a box

- **Deploying** (`pnpm cf:deploy`, `pnpm d1:migrate:remote`, R2 uploads,
  TestFlight): never from a box. The owner deploys after merging.
- **Android** (`android/`): the build needs the Android SDK through
  `cd android && nix-shell`; with the `nix` feature present a compile check
  (`./gradlew assembleDebug`) may work but is slow and downloads a lot. No
  emulator. Say what was and was not built.
- **iOS** (`ios/`): macOS only. Unverifiable here; say so.
- **Push notifications, recordings to R2, Bluesky posting**: external
  services with no dev-mode stand-in. Covered by tests only.

## Gotchas

- `.env.local` is gitignored and dev-only. Never commit it, and never put a
  real credential in it; the box's credentials come through `discobox-access`.
- `next dev` prints an "agent rules" block into `AGENTS.md` on start. Do not
  commit that change unless it was already committed.
- Tailwind `bg-[var(--x)]/50` compiles to nothing. A missing background in a
  screenshot is usually this (`.claude/skills/rabble-design-system`).
- `pkill -f "next dev"` also matches your own shell; kill by pid.
- D1 is SQLite: dates are text, booleans are 0/1 in raw queries.
