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

`discobox admin service ls`/`logs` may refuse with a 403 (`discoboxApi` not
set on the box). The server's own structured logs (`src/lib/logger.ts`) are
still readable straight from disk: Next.js writes them to
`.next/dev/logs/next-development.log` (each line a `{timestamp, source,
level, message}` wrapper; `message` is the logger's own JSON string for a
`logger.*` call). `tail`/`grep` it directly instead of trying a second
`pnpm dev` on another port — Next refuses to run two dev servers against the
same project and just points you at the existing one's log file.

To drive the Prisma/D1 layer itself outside the running app (e.g. to see
exactly what a real Prisma error looks like, or to check a client extension
hook fires for a call shape the running routes don't exercise), get a real
`D1Database` binding in a throwaway Node script with `wrangler`'s
`getPlatformProxy({ configPath: 'wrangler.jsonc' })` (`proxy.env.DB`), then
construct `new PrismaClient({ adapter: new PrismaD1(db) })` directly — no
need for `next dev` or a request context. Run the script from inside the
repo root (bare `import`s need its `node_modules`); delete it afterwards.

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

Login is Bluesky OAuth against a real account; a box has none. But a session
is just a sealed `bs_spaces_session` cookie (`src/lib/session.ts`, iron-session,
password = `SESSION_SECRET` from `.env.local`) — you can seal one yourself for
a seeded demo user (`did:plc:demo...`) and drive host-only API routes and
pages for real, with no app change:

```bash
node -e "
const { sealData } = require('./node_modules/.pnpm/iron-session@9.0.1/node_modules/iron-session/dist/index.js');
sealData({ bluesky: { did: 'did:plc:demo00000000000000000003', handle: 'priya.demo.rabble.rodeo' } },
  { password: process.argv[1] }).then(console.log);
" "$(grep '^SESSION_SECRET' .env.local | cut -d= -f2-)"
# -> Fe26.2*... ; then: curl -b "bs_spaces_session=$COOKIE" http://localhost:3000/api/me/shows
```

(adjust the `iron-session@9.0.1` path to whatever `pnpm list iron-session`
resolves). This is not a bypass — it's the same cookie the real OAuth
callback would set — so it's fine to use for verification; still don't add a
login bypass or dev-only auth route to the app itself.

For a **screenshot** of a logged-in page, plain `chromium --screenshot` can't
set cookies (there's no cookie flag), so drive it over CDP instead: launch
`chromium --headless=new --no-sandbox --disable-gpu --remote-debugging-port=9333 "--remote-allow-origins=*"`,
then use `Target.createTarget`/`Target.attachToTarget`, `Network.setCookie`
(`domain: 'localhost'`), `Emulation.setDeviceMetricsOverride` for phone width,
`Page.navigate`, and `Page.captureScreenshot` over the tab's WebSocket
(Node 22+ has a global `WebSocket` and `fetch`, no extra package needed).

Routes/pages this can't reach (LiveKit grants beyond listener, Bluesky
posting, anything needing a *real* Bluesky identity) are still verified by:

1. The route's tests under `tests/api/` and `tests/lib/` (they mock the
   session), extended for the change.
2. Reading the handler to confirm the session check and the call path.
3. Saying in the PR's Evidence which flow was not driven live and why.

## Checks (CI's job, not verification)

`pnpm typecheck && pnpm lint && pnpm test` must be green before a PR opens;
run them yourself (the hook declarations in `.discobox/hooks/` need a hook
runner this box may not have). There is no GitHub Actions CI on this repository
today: a PR with no checks is green once those three pass in the box, and the
PR's Evidence says so.

## Out of reach in a box

- **Deploying** (`pnpm cf:deploy`, `pnpm d1:migrate:remote`, R2 uploads,
  TestFlight): never from a box. The owner deploys after merging.
- **Android** (`android/`): no emulator, but a real `assembleDebug` /
  `bundleRelease` build works from `cd android && nix-shell` — use `gradle`
  (on `$PATH` in the shell, from `pkgs.gradle_9`), not `./gradlew`: the
  wrapper tries to download its own Gradle zip and that download, and AGP's
  fetch from Google's Maven repo, both go through the sandbox's MITM proxy,
  whose CA the JVM's bundled `cacerts` doesn't trust (`curl` trusts it
  because the system CA bundle already has it). Fix once per shell:

  ```bash
  JDK_CACERTS="$JAVA_HOME/lib/security/cacerts"   # set by shell.nix
  cp "$JDK_CACERTS" /path/outside/the/repo/cacerts-with-mitm
  chmod u+w /path/outside/the/repo/cacerts-with-mitm   # cp preserves read-only
  keytool -importcert -noprompt -trustcacerts -alias discobox-mitm \
    -file /etc/discobox/proxy/mitm-ca.crt \
    -keystore /path/outside/the/repo/cacerts-with-mitm -storepass changeit
  proxy=${https_proxy#http://}   # host:port this box's proxy actually listens on
  export GRADLE_OPTS="-Dhttps.proxyHost=${proxy%:*} -Dhttps.proxyPort=${proxy##*:} \
    -Dhttp.proxyHost=${proxy%:*} -Dhttp.proxyPort=${proxy##*:} \
    -Djavax.net.ssl.trustStore=/path/outside/the/repo/cacerts-with-mitm \
    -Djavax.net.ssl.trustStorePassword=changeit"
  gradle --no-daemon assembleDebug
  ```

  A release
  build needs a throwaway keystore to exercise `signingConfigs.release`:
  `keytool -genkeypair -v -keystore /tmp/t.keystore -alias t -keyalg RSA
  -keysize 2048 -validity 1 -storepass x -keypass x -dname 'CN=Test'`, then
  `ANDROID_RELEASE_KEYSTORE_PATH=/tmp/t.keystore
  ANDROID_RELEASE_KEYSTORE_PASSWORD=x ANDROID_RELEASE_KEY_ALIAS=t
  ANDROID_RELEASE_KEY_PASSWORD=x gradle --no-daemon bundleRelease
  -PrabbleBaseUrl=https://rabble.radio`; check the result with `jarsigner
  -verify app/build/outputs/bundle/release/app-release.aab` (expect "jar
  verified", ignore the self-signed/no-timestamp warnings — that's the
  throwaway key). Clean up `android/build` and `android/app/build`
  afterwards; they're large. Say what was and was not built. If an earlier
  `gradle` run in the same tree failed partway (plugin resolution, a
  dropped proxy connection) the next `assembleDebug` can fail at
  `:app:packageDebug` with `FileNotFoundException: ...app-debug.apk (No
  such file or directory)` or a Kotlin incremental-cache "Storage is
  already registered" error, even though the APK was actually written:
  `rm -rf android/app/build android/build android/.gradle` and rebuild
  clean rather than trusting that failure.
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
