# Deploying rabble.rodeo and rabble.radio

Two environments share one repository and one Cloudflare account:

| | Development | Production |
|---|---|---|
| Site | https://rabble.rodeo | https://rabble.radio |
| Worker | `rabble-dev` (top level of `wrangler.jsonc`) | `rabble-prod` (`env.production`) |
| D1 | `rabble-dev` | `rabble-prod` (`b3c5287f-9882-4ca7-b1ff-76641f3c1ce6`) |
| R2 | `rabble-dev-recordings` | `rabble-prod-recordings` |
| LiveKit | the dev LiveKit Cloud project | its own LiveKit Cloud project |
| Deployed by | every push to `main` (`deploy.yml`) | a `v*` tag or a manual run (`deploy-production.yml`) |
| By hand | `pnpm d1:migrate:remote`, `pnpm cf:deploy` | `pnpm d1:migrate:prod`, `pnpm cf:deploy:prod` |
| Secrets | `wrangler secret put NAME --name rabble-dev` | `wrangler secret put NAME --env production` |

Production setup is at the end of this file.

## Development: every push to main

Every push to `main` runs `.github/workflows/deploy.yml`, which deploys the
parts whose files changed:

| Part | Runs when | What it does |
|------|-----------|--------------|
| Web and API | anything outside `android/`, `ios/`, docs and agent config changed | typecheck, lint, test; `wrangler d1 migrations apply rabble-dev --remote`; `pnpm cf:deploy` (OpenNext build and `wrangler deploy` of the `rabble-dev` Worker); `GET https://rabble.rodeo/api/health` must answer |
| Android | `android/**` changed | `./gradlew assembleDebug`, keeps the APK as a run artifact, uploads it to R2 `builds/rabble-android.apk`, served at https://rabble.rodeo/downloads/rabble-android.apk |
| iOS | `ios/**` changed and the `IOS_TESTFLIGHT` variable is `true` | `ios/scripts/testflight.sh`: archive, cloud-sign with the App Store Connect key, upload to TestFlight |
| iOS tests | `ios/**` changed, independent of `IOS_TESTFLIGHT` | Seeds a local D1 with demo data and starts `pnpm dev` for `ios/scripts/run-ui-tests.sh` (XCUITest) to join, against no deployed environment; uploads the `.xcresult` as a run artifact |
| Live-site checks | after a web deploy | `scripts/qa-live.mjs` against rabble.rodeo; a failure opens or updates the "QA: live-site checks failing after deploy" issue (`bug`, `qa`) and fails the run |

A change to the workflow file itself runs all three. Actions, Run workflow,
runs any combination by hand (iOS is off by default there too). Runs on
`main` queue behind each other and never cancel one in progress.

Worker secrets (`SESSION_SECRET`, `JWKS_PRIVATE_KEY`, `LIVEKIT_*`, `S3_*`,
`VAPID_PRIVATE_KEY`, `FEEDBACK_READ_TOKEN`) are not touched by a deploy; set them once with
`wrangler secret put NAME --name rabble-dev`.

## One-time setup

Repository secrets (Settings, Secrets and variables, Actions):

| Secret | Used by | How to get it |
|--------|---------|---------------|
| `CLOUDFLARE_API_TOKEN` | web, android, log triage | Cloudflare dashboard, Manage Account, Account API Tokens, Create Token, Create Custom Token with: Account, Workers Scripts, Edit; Account, D1, Edit; Account, Workers R2 Storage, Edit; Account, Account Settings, Read; Account, Workers Observability, Edit (for `log-triage.yml`, which reads the Workers' error logs); Zone, Workers Routes, Edit; Zone, Zone, Read. Account resources: this account; zone resources: the `rabble.rodeo` and `rabble.radio` zones (add the second zone to the token once it exists, or the production deploy cannot attach its domain). |
| `CLOUDFLARE_ACCOUNT_ID` | web, android | The account id shown on the Workers overview page (`0f8fe574f3489eda5a599104efd24d26`). |
| `ANDROID_DEBUG_KEYSTORE_B64` | android, optional | `base64 -w0 ~/.android/debug.keystore` from the machine whose builds are already installed on phones. Without it each run signs with a fresh key and a phone must uninstall the app before it accepts the new APK. |
| `ANDROID_RELEASE_KEYSTORE_B64`, `ANDROID_RELEASE_KEY_ALIAS`, `ANDROID_RELEASE_KEYSTORE_PASSWORD`, `ANDROID_RELEASE_KEY_PASSWORD` | android-release (production only), optional | The upload key Play Console expects, generated once with `keytool -genkeypair -v -keystore release.keystore -alias rabble -keyalg RSA -keysize 2048 -validity 10000` and kept outside git; the base64 of that file plus the alias and the two passwords chosen at generation time. Until all four exist the `android-release` job's steps are skipped, not failed. |
| `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY` | ios | The App Store Connect API key already used by `scripts/ios-testflight.sh`: the two ids from `~/.config/rabble/testflight.env` on the Mac mini and the contents of `AuthKey_<id>.p8`. The key must have the **Admin** role; App Manager keys fail cloud signing. |

Repository variables:

| Variable | Meaning |
|----------|---------|
| `IOS_TESTFLIGHT` | `true` turns the iOS job on. Leave unset until the three ASC secrets exist. |
| `IOS_RUNNER` | Runner label for the iOS job. Unset means `macos-latest` (GitHub-hosted, newest Xcode it ships). Set it to `self-hosted` after registering the Mac mini as a runner to build with its Xcode 27 and its warm SPM cache. |

Setting the secrets from this machine:

```sh
gh secret set CLOUDFLARE_API_TOKEN            # paste the token
gh secret set CLOUDFLARE_ACCOUNT_ID --body 0f8fe574f3489eda5a599104efd24d26
gh secret set ANDROID_DEBUG_KEYSTORE_B64 --body "$(base64 -w0 ~/.android/debug.keystore)"
gh secret set ANDROID_RELEASE_KEYSTORE_B64 --body "$(base64 -w0 release.keystore)"
gh secret set ANDROID_RELEASE_KEY_ALIAS --body rabble
gh secret set ANDROID_RELEASE_KEYSTORE_PASSWORD   # paste the keystore password
gh secret set ANDROID_RELEASE_KEY_PASSWORD        # paste the key password
gh secret set ASC_KEY_ID --body "$ASC_KEY_ID"
gh secret set ASC_ISSUER_ID --body "$ASC_ISSUER_ID"
gh secret set ASC_PRIVATE_KEY < AuthKey_XXXXXXXXXX.p8
gh variable set IOS_TESTFLIGHT --body true
```

## Things to know

- Migrations run before the new code is deployed, so keep every D1 migration
  additive (new tables and columns; never a drop the old code still reads).
- The web job is also the repo's CI: a failing typecheck, lint or test stops
  the deploy and the run shows up red on the merge commit. Pull requests do
  not run it; workers verify in their box before opening one.
- The Android APK is a debug build pointed at `https://rabble.radio`, like
  every app build: both apps default to production and a build against the
  dev site is a deliberate one-off (`-PrabbleBaseUrl=https://rabble.rodeo`,
  or `RABBLE_BASE_URL` for iOS). `node scripts/upload-android-build.mjs`
  still uploads a local build by hand.
- GitHub-hosted macOS runners may lag the Xcode on the Mac mini. If the
  archive fails on a toolchain error, set `IOS_RUNNER` to a self-hosted
  runner on the Mac mini: Settings, Actions, Runners, New self-hosted runner,
  install it under the same user that owns `~/.appstoreconnect`, and it will
  pick up the job with `RABBLE_CI=1`, which uses a temporary keychain rather
  than the login keychain.
- iOS build numbers are UTC timestamps, so every upload is newer than the
  last; the marketing version comes from `ios/project.yml`.

## Monitoring and dashboards

Four consoles, already enabled, no code or cost:

| Console | Shows |
|---|---|
| [`rabble-dev` Worker observability](https://dash.cloudflare.com/?to=/:account/workers/services/view/rabble-dev/production/observability/metrics) | Development's request and error counts, and wall-time/CPU-time at P50/P90/P99, three months of history |
| [`rabble-prod` Worker observability](https://dash.cloudflare.com/?to=/:account/workers/services/view/rabble-prod/production/observability/metrics) | Production's request and error counts, and wall-time/CPU-time at P50/P90/P99, three months of history |
| [LiveKit Cloud console](https://cloud.livekit.io/), dev project | Session, participant, bandwidth and egress for the dev LiveKit Cloud project |
| [LiveKit Cloud console](https://cloud.livekit.io/), production project | Session, participant, bandwidth and egress for the production LiveKit Cloud project |

The LiveKit Cloud console has one login across both projects; pick the dev
or production project after signing in (there's no project-specific URL to
link to from here). `scripts/log-triage.mjs` and `scripts/latency-triage.mjs`
already turn `rabble-prod`'s error-level logs and elevated P95 wall time into
`logs`- and `latency`-labelled issues every six hours
(`.github/workflows/log-triage.yml`); these consoles are for looking at
either environment, not alerting — alerting is production only.

Each `logs` issue and each "still happening" comment carries the timeline of
up to three of the failing requests (every log line in order, with any
`db.query.start` that has no `done` flagged), so a hung-request issue already
names the D1 call that hung. For a window or request the issue did not
cover, `scripts/request-logs.mjs` prints the same timeline: `CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… node
scripts/request-logs.mjs --service rabble-dev --route /api/me/shows --from
<iso> --to <iso>` (or `--request <id>`). Its output is redacted and safe to
paste on the issue; Workers Logs keeps only a few days, so run it soon after
the triage comment.

## Rollback and uptime

Both deploy workflows record the live Worker version before deploying. If
the smoke test on `/api/health` fails afterwards, or the live-site checks
(`scripts/qa-live.mjs`) fail, the workflow runs `wrangler rollback` to that
version (`--env production` for rabble.radio) and says so on the QA issue.
The commit or tag stays where it is: the factory fixes forward and the next
deploy carries everything. D1 migrations are not rolled back, which is why
they must stay additive (new tables and columns, never drops or renames of
something the previous version reads).

By hand: `pnpm exec wrangler deployments list [--env production] --json`
shows the version ids; `pnpm exec wrangler rollback <id> -y [--env production]`
puts one back.

`.github/workflows/uptime.yml` probes `/api/health` on both sites every five
minutes (three tries, twenty seconds apart). A site that is not answering, or
reports `status: down`, gets an `ops` + `p0` issue the factory triages like
any bug; recovery closes it. `status: degraded` (LiveKit unreachable) does
not count as down.

Pull requests run `.github/workflows/ci.yml` (typecheck, lint, test). The
factory manager merges a worker's PR only when that check is green on the
head commit (`docs/discobox.md`).

## Production: rabble.radio

`deploy-production.yml` runs on a `v*` tag (`git tag v0.1.0 && git push
origin v0.1.0`) or from Actions, Run workflow. It runs the same checks as the
development deploy, applies migrations to `rabble-prod`, deploys the
`rabble-prod` Worker, builds the Android APK against `https://rabble.radio`
and uploads it to the production bucket (served at
https://rabble.radio/downloads/rabble-android.apk), then runs
`scripts/qa-live.mjs --base https://rabble.radio`; a failure opens or
updates the "QA: production checks failing after deploy" issue. iOS is not
part of it: TestFlight builds come from the development deploy and already
point at rabble.radio (`RABBLE_BASE_URL` in `ios/project.yml`).

The same run's `android-release` job builds a signed `.aab` against
`https://rabble.radio` with `./gradlew bundleRelease` and keeps it as the
`rabble-android-release-<sha>` run artifact — Play Console accepts only
`.aab` uploads. It's skipped, not failed, until the four
`ANDROID_RELEASE_*` secrets above exist. To ship a build: let the tag push
run it (or trigger it by hand with `android_release` checked), download the
artifact from the run, and upload it to Play Console yourself; nothing here
talks to the Play Store API.

The D1 database and R2 bucket exist and the environment deploys cleanly in a
dry run. Before the first real deploy:

1. **DNS.** Add `rabble.radio` to the Cloudflare account (Add a domain, Free
   plan, nothing to import) and set the two nameservers it shows at the
   registrar. Wait for the zone to show Active. Do not create an A or CNAME
   for the apex: the first deploy attaches the Worker custom domain and
   creates the records and certificate itself. Optional, in the zone: the
   "www to root" redirect rule. Mail: Email Routing is enabled on the zone
   with a catch-all rule forwarding every `*@rabble.radio` address to the
   owner's mailbox (it manages the MX and SPF records itself), plus
   `TXT _dmarc.rabble.radio "v=DMARC1; p=reject"` since nothing sends as
   the domain. The Worker's `workers_dev` is off, so production answers on
   rabble.radio only.
2. **CI token.** Edit the `CLOUDFLARE_API_TOKEN` token in the dashboard and
   add the `rabble.radio` zone to its zone resources (or create a new token
   with both zones and `gh secret set CLOUDFLARE_API_TOKEN` again).
3. **Secrets**, each `printf '%s' "$VALUE" | pnpm exec wrangler secret put
   NAME --env production` (file-valued ones with `< file`):

   | Secret | Value |
   |---|---|
   | `SESSION_SECRET` | `openssl rand -hex 32` |
   | `JWKS_PRIVATE_KEY`, `JWKS_PUBLIC_KEY` | `pnpm gen:jwks /tmp/prod-jwks`, then `private-key.pem` and the whole `jwks.json` respectively (the kid is read from the JSON; `JWKS_KID` is not needed). Delete the directory afterwards. |
   | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | A new LiveKit Cloud project for production (so a dev test can never land in a production room): its `wss://` URL and an API key pair. |
   | `S3_ACCESS_KEY`, `S3_SECRET_KEY` | An R2 API token, Object Read & Write, limited to `rabble-prod-recordings`. LiveKit egress uploads recordings with it. |
   | `VAPID_PRIVATE_KEY` | `node scripts/gen-vapid.mjs` prints both keys. The private one is the secret; put the public one in `env.production.vars` as `VAPID_PUBLIC_KEY` in `wrangler.jsonc` and commit it. Without it web push is off and everything else works. |
   | `FEEDBACK_READ_TOKEN` | `openssl rand -hex 32`. The daily feedback intake reads rabble.rodeo only; give the QA box a second discobox secret routed to `GET rabble.radio/api/feedback` when production feedback should be triaged too. |

   `wrangler secret list --env production` shows what is set.

   Not a secret: Cloudflare Web Analytics (Core Web Vitals) is off until the
   owner creates a site for rabble.radio (dashboard → Account Home → Web
   Analytics → Add a site) and puts the beacon token it prints in
   `env.production.vars` as `NEXT_PUBLIC_CF_BEACON_TOKEN` in
   `wrangler.jsonc`, committed like `VAPID_PUBLIC_KEY`.
4. **Webhook.** In the LiveKit Cloud project (Settings, Webhooks) add
   `https://rabble.radio/api/livekit/webhook`, signed with the API key that
   is the Worker's `LIVEKIT_API_KEY`. LiveKit then tells the site when a
   participant joins or leaves: presence metrics, and a show ends the moment
   its last speaker leaves. Without it a show the host walks out of only
   ends when the five-minute sweep has seen the room empty for ten minutes.
   The dev project needs the same with `https://rabble.rodeo/api/livekit/webhook`.
5. **Music.** The production bucket starts empty. Upload the pre-show tracks
   with `RECORDING_BUCKET=rabble-prod-recordings node scripts/upload-music.mjs
   <dir>`; the R2 token in `.env` must cover the production bucket.
6. **First deploy.** Push a tag or run the workflow. The Worker is deployed
   first, then the smoke test waits for `/api/health`; the custom domain
   needs the zone Active, otherwise `wrangler deploy` fails on the route.
7. **Admins** are the same DIDs as development (`ADMIN_DIDS` and friends in
   `env.production.vars`); edit them there.

Production starts with an empty database: no demo shows, no seeded data.
Nothing is copied from rabble.rodeo.
