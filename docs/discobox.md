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
scripts/discobox-gateway-harness.sh aperture-deliver claude-opus-5   claude-haiku-4-5
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
--harness SLUG` overrides both for one launch. Apply the patch in your fork
of the manager, or paste it to the manager in `discobox console` and ask it
to apply and commit it. The manager box runs on the same harness: `-H
aperture-deliver` on the `discobox run` that starts it, or nothing, since it
is the default.

## QA agent

Two layers watch the deployed site and turn what they find into issues the
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

`aperture-qa` is a gateway config like the others; its `github` binding is
narrowed to listing, creating and commenting on this repository's issues,
so a QA box cannot push, open PRs or touch labels. `node scripts/qa-live.mjs`
runs the deterministic checks from anywhere.

## Branch protection

Workers push to a fork and open PRs, so `main` needs no rule for them. A
ruleset that blocks force-pushes and deletions on `main` is still cheap
insurance; requiring PRs would break the repository's own commit-to-main
convention, so it is not set.
