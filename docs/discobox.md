# Discobox: issues to PRs by agent

[Discobox](https://discobox.ai) runs a coding agent (Claude Code here) in a
sandbox of its own with a copy of the repository. The "software factory"
layout from `discobox-ai/factory-demo` adds a long-lived **manager** box that
watches this repository's issues, starts one **worker** box per job (triage,
deliver, fix CI, rebase), and brings the owner a green PR to merge. GitHub is
the state: one status label per issue, and every PR names the issue it closes.

The manager and its worker skills live in the factory's own repository, not
here. What lives here is everything a worker needs to build, run and verify
rabble.radio on its own.

## What this repository declares

| Path | Does |
|---|---|
| `.discobox/scripts/pre-harness` | Runs before the agent starts: `pnpm install`, Prisma client, local D1 migrated and seeded with demo shows, `.env.local` with a dev session secret and LiveKit dev credentials. Idempotent. |
| `.discobox/services/10-web.sh` | `next dev` on `:3000` at boot, forwarded to whoever opens the box. |
| `.discobox/services/20-livekit.sh` | LiveKit server in `--dev` mode on `:7880` (Docker), so the live room works. |
| `.discobox/hooks/` | Hook declarations (typecheck and lint on save, Prisma regenerate plus migration check, vitest at review) in the `discobox-ai/hooks` format. Boxes on v0.19.5 ship no hook runner yet, so they are inert until one does; workers run the checks themselves. |
| `.discobox/skills/verify-recipes/` | How to drive the running app, take screenshots, join a room anonymously, and what cannot run in a box. The generic `verify` skill reads it. Linked into `.claude/skills/`. |
| `.discobox/skills/rabble-design-system` | Link to the design-system skill so non-Claude harnesses get it too. |
| `.discobox/skills/frontend-design/` | Anthropic's `frontend-design` skill (Apache-2.0, vendored): aesthetic direction for new or reshaped UI. Workers load it for issues that change how a screen looks. |
| `.discobox/skills/mobile-apps/` | The Android and iOS clients: screens, the flows they share with the web and their wire contract, screen conventions, how to build and verify each. Loaded before touching `android/`, `ios/` or a shared flow. |
| `.discobox/review/*.md` | Two extra reviewers for `discobox-review`: `design-system` and `security`. |
| `CLAUDE.md`, "Working in a discobox" | The rules a worker keeps (PR from `discobox/issue-<N>`, no deploys). |

Boxes have no secrets. Bluesky login, deploys, R2, push and the mobile apps
are out of reach; the recipes say so and workers state it in each PR.

## Labels

The manager adopts labels that exist and creates none. These were created for
it (the factory maps each concept to one at setup):

| Concept | Label |
|---|---|
| triaged / needs decision / needs input / ready / in progress / in review / blocked | `status/triaged`, `status/needs-decision`, `status/needs-input`, `status/ready`, `status/in-progress`, `status/in-review`, `status/blocked` |
| new | none (an issue with no status label is new) |
| priority, highest first | `p0`, `p1`, `p2`, `p3` |
| flake | `flake` |
| kind | the existing `bug`, `enhancement`, `documentation`, `accessibility` |

Issues read best as `## Today` / `## Wanted` / `## Done when`; triage fills in
what is missing and posts a failing test when it can reproduce a bug.

## Running the factory (owner side)

The discobox server already runs on this machine (`discobox version`,
`discobox admin pool ls`). The CLI is `~/.local/bin/discobox`.

1. **A bot account** is recommended: a separate GitHub user added to
   `rothgar/rabble.radio` with Triage permission. Workers then push to the
   bot's fork and comments are visibly the bot's. Using your own account
   works too; every route is still narrowed by the role policies and none
   can merge.
2. **Start the manager** from the factory template (it keeps its settings in
   the box until you fork it):

   ```sh
   discobox run -d --discobox-api --no-project-skills \
     https://github.com/discobox-ai/factory-demo@main -p '/setup'
   discobox console
   ```

   `/setup` asks for the repository (`rothgar/rabble.radio`), the account,
   which jobs to run (start with triage, then deliver), how designs are
   written (a comment on the issue fits this repository), and shows the
   label mapping above for you to accept. It then asks you to approve one
   GitHub access request in the console.
3. **Keep it**: once it works, fork `discobox-ai/factory-demo` (or make an
   empty private repository) and tell the manager its name; it pushes itself
   there and edits its own skills when you change the process.
4. **Approve and merge.** The manager proposes every action until you say
   "do triage on your own". You merge PRs; a box never does. The merge
   deploys rabble.rodeo on its own through `.github/workflows/deploy.yml`
   (web, Android APK, TestFlight when enabled; see `docs/DEPLOY.md`).

To try one job without the manager, run a worker by hand on an issue:

```sh
discobox run rothgar/rabble.radio \
  --skills https://github.com/discobox-ai/skills \
  -p 'Run /deliver-issue for #12'
```

It needs a GitHub credential bound to the box (`discobox secret bind github
<box> --as GH_TOKEN --route 'api.github.com/repos/rothgar/rabble.radio/**'`),
which the manager otherwise does from its role files.

## Running workers through the aperture gateway

`aperture-triage` and `aperture-deliver` are the built-in `claude-code`
harness plus a settings file that points Claude Code at
`https://ai.gerbil-dragon.ts.net`, the tailnet proxy that meters usage per
person and forwards the box's own Anthropic credential, and maps every model
alias Claude Code might send (opus, sonnet, haiku, the small/fast model) to
one of the gateway's ids (`curl https://ai.gerbil-dragon.ts.net/v1/models`:
`claude-sonnet-5`, `claude-opus-5`, `claude-haiku-4-5`, ...). The credential
is a `claude setup-token` subscription token in the project secret
`anthropic`, bound as `CLAUDE_CODE_OAUTH_TOKEN`. `aperture-deliver` is the
project default harness and the manager's `workers.harness`.

```sh
# once: the token, sent only to the gateway (and Anthropic directly)
discobox secret create --name anthropic --type token \
  --route ai.gerbil-dragon.ts.net --route api.anthropic.com \
  --ttl forever --max-binding-ttl forever --token "$TOKEN"

scripts/discobox-gateway-harness.sh aperture-triage  claude-sonnet-5 claude-haiku-4-5
scripts/discobox-gateway-harness.sh aperture-deliver claude-sonnet-5 claude-haiku-4-5
scripts/discobox-gateway-harness.sh aperture-design  claude-opus-5   claude-haiku-4-5
```

Each run writes the config's `.claude/settings.json` (`model`,
`ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL`,
`ANTHROPIC_SMALL_FAST_MODEL`, the gateway URL), allows egress to the gateway
host, and on first creation binds the secret. A box only ever holds a
sentinel; its pool swaps in the token on requests to the gateway and nowhere
else, and the gateway sees the box as this machine's tailnet user. To change
a model, run the script again with the new id; boxes already running keep
theirs. `GATEWAY_URL`, `GATEWAY_SECRET` and `GATEWAY_SECRET_AS` in the
environment point the script at another gateway or credential.

**Which job uses which model.** The factory manager launches every worker
with `workers.harness`. `docs/discobox-factory-harness-by-job.patch` (two
files, tested against the template's `scripts/launch --dry-run`) adds
`workers.harnessByJob`, so `manager.json` can say:

```json
"workers": { "harness": "aperture-deliver",
             "harnessByJob": { "triage": "aperture-triage" } }
```

Jobs not listed fall back to `workers.harness`, and `scripts/launch
--harness SLUG` overrides both for one launch. The manager cannot pick a
harness per issue, so `aperture-design` (Opus, for work that changes how a
screen looks) is used by setting `workers.harness` to it for a batch of UI
issues, or by starting the box yourself: `discobox run -H aperture-design
-p 'Load /frontend-design and /mobile-apps, then work issue #N'`. Apply the patch in your fork
of the manager, or paste it to the manager in `discobox console` and ask it
to apply and commit it. The manager box runs on the same harness: `-H
aperture-deliver` on the `discobox run` that starts it, or nothing, since it
is the default.

## Ideas: research before anything is built

An issue opened from the "Idea to research" template (`.github/ISSUE_TEMPLATE/idea.md`),
or any issue labelled `idea`, is an integration, library, service or
direction to evaluate, not work to deliver. With the factory's `research`
job on, the manager starts a `research-issue` worker for it instead of
triage. The worker reads what the app already does, reads the thing's own
docs, pricing and licence, checks it runs where the app runs (Workers, D1,
the two mobile apps), and posts one comment whose first line is
`**Research:** go|no-go|needs-decision · size …`, with cited findings.

- **go**: it has already filed the follow-up issues, one per deliverable
  step in order, each `Part of #N`, written as `## Today` / `## Wanted` /
  `## Done when`. They arrive as new issues, so triage sizes and labels them
  and delivery starts under the usual `autoReadyMax` gate. The idea becomes
  their tracking issue (`status/triaged`) and is closed when they are done.
  An issue that needs an account or a secret says so and keeps the feature
  off until the owner adds it.
- **no-go**: the comment says which constraint, cost or risk; the issue is
  closed once the owner agrees, or the owner overrules on the issue and it
  is researched again.
- **needs-decision**: a paid plan, sending user data to a third party, a
  licence change, or two integrations of equal fit. The issue goes to
  `status/needs-decision` and the owner decides on it.

The job is not in the factory template yet. `docs/discobox-factory-research-job.patch`
adds it (the worker skill, the `research` job and `idea` label concept, the
intake rule and gates; it applies on its own or after the harness-by-job
patch and was tested against the template's scripts). Apply it in the
manager's checkout, then in `manager.json` set `jobs.research` to `true`,
`labels.idea` to `"idea"`, and add `research` to `auto` so ideas are
researched without asking; send `scripts/request` again. The worker runs
under the triage role (read, comment, file issues; no labels, no pushes)
and reaches the web, since no egress level denies by default. To research
one idea without the manager:

```sh
discobox run -H aperture-deliver --skills <manager-checkout>/worker-skills \
  --bind 'github:GH_TOKEN,policy=roles/github-triage.json,owner=rothgar,repo=rabble.radio' \
  rothgar/rabble.radio -p 'Research issue #N in rothgar/rabble.radio.'
```

## QA agent

Three layers watch the deployed site and turn what they find into issues the
manager then triages like any other:

1. **After every web deploy**, the `qa` job of `.github/workflows/deploy.yml`
   runs `scripts/qa-live.mjs` against rabble.rodeo: health, home, the
   shows API and a show page, anonymous join when a show is live, the
   listing pages, the APK download, JWKS and the push key. A failure opens
   (or comments on) one issue titled "QA: live-site checks failing after
   deploy", labelled `bug` and `qa`, and marks the run red.
2. **Once a day**, the `rabble-qa.timer` user unit on this machine runs
   `scripts/qa-live-box.sh`: a box on the `aperture-qa` harness config
   checks out `main` and runs `/qa-live` (`.discobox/skills/qa-live/`): the
   same script, then an exploratory pass with headless Chromium screenshots
   at phone and desktop width in both themes, then one issue per distinct
   problem through the GitHub REST API, de-duplicated against open `qa`
   issues. Transcripts land in `~/.local/state/rabble-qa/`. The units are in
   `scripts/systemd/`; install them once with
   `cp scripts/systemd/rabble-qa.* ~/.config/systemd/user/ && systemctl --user daemon-reload && systemctl --user enable --now rabble-qa.timer`.
   Run a pass now with `scripts/qa-live-box.sh`;
   `systemctl --user list-timers rabble-qa.timer` shows the next run.

The same daily box then runs `/feedback-intake`
(`.discobox/skills/feedback-intake/`): it reads new reports from the site's
feedback button through `GET /api/feedback` with the `FEEDBACK_READ_TOKEN`
Worker secret (delivered to the box as the `feedback-read` project secret),
groups them by symptom, and files one issue per actionable report labelled
`feedback` and `status/needs-decision`. That status means the owner must say
yes before the manager starts any work, whatever `auto` says. Duplicates
become a comment on the open issue; everything handled is listed in the
"Feedback intake log" issue, which is how the next run knows what it has
seen. Noise is logged and nothing else.

3. **Every six hours**, `.github/workflows/log-triage.yml` runs
   `scripts/log-triage.mjs`: it queries Workers Logs (the Workers
   Observability API) for every error-level line and uncaught exception of
   `rabble-dev` and `rabble-prod` in the last eight hours, groups them by the
   logger's event name or the exception's message with ids stripped, and
   files one issue per new group labelled `logs` and `bug`, titled
   `Logs (dev|prod): <event>`, with counts, routes, request ids and a
   redacted sample line, written as Today / Wanted / Done when. A group
   with an open `logs` issue gets a "still happening" comment at most once
   a day; one closed as `wontfix` is never filed again, and client
   disconnects ("Network connection lost") are never filed. Workers Logs keep
   three days on the free plan (seven on paid), so the scan is the only
   durable record. Run it by hand with `CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=…
   node scripts/log-triage.mjs --dry-run --bodies`; the token needs the
   account permission "Workers Observability" (the CI token has to be
   given it too).

`aperture-qa` is a gateway config like the others; its `github` binding is
narrowed to listing, creating and commenting on this repository's issues,
so a QA box cannot push, open PRs or touch labels. `node scripts/qa-live.mjs`
runs the deterministic checks from anywhere.

Setup for the intake, once: a random token as the Worker secret and as the
project secret the box reads it from:

```sh
TOKEN=$(openssl rand -hex 32)
printf '%s' "$TOKEN" | pnpm exec wrangler secret put FEEDBACK_READ_TOKEN --name rabble-dev
discobox secret create --name feedback-read --type token --route 'GET rabble.rodeo/api/feedback' \
  --ttl forever --max-binding-ttl forever --token "$TOKEN"
discobox secret bind feedback-read --harness aperture-qa --as FEEDBACK_READ_TOKEN --for forever
```

## Branch protection

Workers push to a fork and open PRs, so `main` needs no rule for them. A
ruleset that blocks force-pushes and deletions on `main` is still cheap
insurance; requiring PRs would break the repository's own commit-to-main
convention, so it is not set.
