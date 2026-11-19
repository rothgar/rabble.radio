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
4. **Approve, merge, deploy.** The manager proposes every action until you say
   "do triage on your own". You merge PRs; a box never does. After a merge,
   deploy from this machine as usual (`pnpm cf:deploy`, remote D1
   migrations, APK upload, TestFlight).

To try one job without the manager, run a worker by hand on an issue:

```sh
discobox run -H kimchi-deliver rothgar/rabble.radio \
  --skills https://github.com/discobox-ai/skills \
  -p 'Run /deliver-issue for #12'
```

It needs a GitHub credential bound to the box (`discobox secret bind github
<box> --as GH_TOKEN --route 'api.github.com/repos/rothgar/rabble.radio/**'`),
which the manager otherwise does from its role files.

## Running workers on Kimchi models

`kimchi claude` on a laptop does one thing (measured with Kimchi 1.36.0): it
starts the normal Claude Code CLI with `ANTHROPIC_BASE_URL` pointed at
`https://llm.kimchi.dev/anthropic` and the Kimchi API key as the auth token.
That gateway speaks the Anthropic API but accepts only Kimchi model ids
(`kimchi --list-models`); a Claude model name gets `400 no registered
providers found`. So the "Kimchi harness" for discobox is the built-in
`claude-code` harness plus a settings file that points it at the gateway and
maps every alias Claude Code might send (opus, sonnet, haiku, the small/fast
model) to a Kimchi id. `scripts/discobox-kimchi-harness.sh` builds such a
harness config, one per job so each can run a different model:

```sh
# once: the key, read from Kimchi's own config, sent only to the gateway
discobox secret create --name kimchi --route llm.kimchi.dev \
  --refresh-command 'jq -r .apiKey ~/.config/kimchi/config.json' \
  --ttl forever --max-binding-ttl forever

scripts/discobox-kimchi-harness.sh kimchi-triage  glm-5.3-flash
scripts/discobox-kimchi-harness.sh kimchi-deliver glm-5.3 glm-5.3-flash
```

Each run writes the config's `.claude/settings.json` (`model`,
`ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL`,
`ANTHROPIC_SMALL_FAST_MODEL`, the gateway URL), allows egress to
`llm.kimchi.dev`, and on first creation binds the `kimchi` secret as
`ANTHROPIC_API_KEY`. A box only ever holds a sentinel; its pool swaps in the
key on requests to `llm.kimchi.dev` and nowhere else. To change a model, run
the script again with the new id; boxes already running keep theirs. The
model names in the two commands above match the `.kimchi/agents` personas
(`glm-5.3` for dev work, the flash model where cost matters).

**Which job uses which model.** The factory manager launches every worker
with `workers.harness`. `docs/discobox-factory-harness-by-job.patch` (two
files, tested against the template's `scripts/launch --dry-run`) adds
`workers.harnessByJob`, so `manager.json` can say:

```json
"workers": { "harness": "kimchi-deliver",
             "harnessByJob": { "triage": "kimchi-triage" } }
```

Jobs not listed fall back to `workers.harness`, and `scripts/launch
--harness SLUG` overrides both for one launch. Apply the patch in your fork
of the manager, or paste it to the manager in `discobox console` and ask it
to apply and commit it. The manager box itself can run on Kimchi too: add
`-H kimchi-deliver` to the `discobox run` that starts it.

Caveats: the factory's worker skills and the manager's screen reading were
written against Claude Code on Anthropic models, so watch the first boxes on
a new model before trusting the rest. Kimchi's `--thinking` level has no
equivalent in this setup. Running the `kimchi` CLI itself as the agent would
need a third-party harness bundle (an image built `FROM` the claude-code
bundle with a launcher for `kimchi --auto`); that is not built.

## Branch protection

Workers push to a fork and open PRs, so `main` needs no rule for them. A
ruleset that blocks force-pushes and deletions on `main` is still cheap
insurance; requiring PRs would break the repository's own commit-to-main
convention, so it is not set.
