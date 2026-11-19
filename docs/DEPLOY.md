# Deploying rabble.rodeo

Every push to `main` runs `.github/workflows/deploy.yml`, which deploys the
parts whose files changed:

| Part | Runs when | What it does |
|------|-----------|--------------|
| Web and API | anything outside `android/`, `ios/`, docs and agent config changed | typecheck, lint, test; `wrangler d1 migrations apply rabble-dev --remote`; `pnpm cf:deploy` (OpenNext build and `wrangler deploy` of the `rabble-dev` Worker); `GET https://rabble.rodeo/api/health` must answer |
| Android | `android/**` changed | `./gradlew assembleDebug`, keeps the APK as a run artifact, uploads it to R2 `builds/rabble-android.apk`, served at https://rabble.rodeo/downloads/rabble-android.apk |
| iOS | `ios/**` changed and the `IOS_TESTFLIGHT` variable is `true` | `ios/scripts/testflight.sh`: archive, cloud-sign with the App Store Connect key, upload to TestFlight |
| Live-site checks | after a web deploy | `scripts/qa-live.mjs` against rabble.rodeo; a failure opens or updates the "QA: live-site checks failing after deploy" issue (`bug`, `qa`) and fails the run |

A change to the workflow file itself runs all three. Actions, Run workflow,
runs any combination by hand (iOS is off by default there too). Runs on
`main` queue behind each other and never cancel one in progress.

Worker secrets (`SESSION_SECRET`, `JWKS_PRIVATE_KEY`, `LIVEKIT_*`, `S3_*`,
`VAPID_PRIVATE_KEY`) are not touched by a deploy; set them once with
`wrangler secret put NAME --name rabble-dev`.

## One-time setup

Repository secrets (Settings, Secrets and variables, Actions):

| Secret | Used by | How to get it |
|--------|---------|---------------|
| `CLOUDFLARE_API_TOKEN` | web, android | Cloudflare dashboard, Manage Account, Account API Tokens, Create Token, Create Custom Token with: Account, Workers Scripts, Edit; Account, D1, Edit; Account, Workers R2 Storage, Edit; Account, Account Settings, Read; Zone, Workers Routes, Edit; Zone, Zone, Read. Account resources: this account; zone resources: the `rabble.rodeo` zone. |
| `CLOUDFLARE_ACCOUNT_ID` | web, android | The account id shown on the Workers overview page (`0f8fe574f3489eda5a599104efd24d26`). |
| `ANDROID_DEBUG_KEYSTORE_B64` | android, optional | `base64 -w0 ~/.android/debug.keystore` from the machine whose builds are already installed on phones. Without it each run signs with a fresh key and a phone must uninstall the app before it accepts the new APK. |
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
- The Android APK is a debug build pointed at `https://rabble.rodeo`, the
  same thing `node scripts/upload-android-build.mjs` used to upload by hand.
  That script still works for a local build.
- GitHub-hosted macOS runners may lag the Xcode on the Mac mini. If the
  archive fails on a toolchain error, set `IOS_RUNNER` to a self-hosted
  runner on the Mac mini: Settings, Actions, Runners, New self-hosted runner,
  install it under the same user that owns `~/.appstoreconnect`, and it will
  pick up the job with `RABBLE_CI=1`, which uses a temporary keychain rather
  than the login keychain.
- iOS build numbers are UTC timestamps, so every upload is newer than the
  last; the marketing version comes from `ios/project.yml`.
