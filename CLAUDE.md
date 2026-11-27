# rabble.radio

Live audio spaces for Bluesky. Next.js 15 (App Router) + React 19 + Prisma 5 + LiveKit. Package manager is pnpm.

## Commands (run before reporting any task done)

```bash
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint .
pnpm test             # vitest run (happy-dom, tests/**/*.test.{ts,tsx})
pnpm prisma:generate  # after any prisma/schema.prisma change
```

Always prefix shell commands with `rtk` (see ~/CLAUDE.md).

## Layout

- `src/app/` routes and API handlers (`src/app/api/**/route.ts`)
- `src/components/` UI; `src/components/ui/` holds the Button, Card, PageLayout primitives
- `src/lib/` server logic (spaces, hosts, tags, livekit, session, atproto)
- `tests/` mirrors `src/`: `tests/lib`, `tests/api`, `tests/components`, `tests/app`, `tests/security`
- `prisma/` schema and migrations; `docs/` setup guides

## Conventions

- Design system: 4px grid tokens in `src/app/globals.css`, exposed through Tailwind aliases. Use `var(--color-*)` tokens and the `ui/` primitives. No hardcoded colors. Min 44px touch targets. Mobile-first.
  `DESIGN.md` (repo root, [design.md](https://github.com/google-labs-code/design.md) format) is the design brief: the same tokens with the rationale, the web name of each, and the do's and don'ts. Read it before any UI work; `tests/design` fails when its colours drift from `globals.css`, and `pnpm design:lint` validates the file.
- Any `prisma/schema.prisma` change needs a D1 migration in `prisma/d1/<nnnn>_<name>.sql` (apply with `pnpm d1:migrate:local` / `pnpm d1:migrate:remote`) and `pnpm prisma:generate`.
- Every new lib function or API route gets a test in the matching `tests/` folder.
- Commit straight to `main` is the repo convention. A push to `main` deploys
  rabble.rodeo (development) through `.github/workflows/deploy.yml`
  (`docs/DEPLOY.md`), so the three commands above must pass before pushing.
  Production is rabble.radio, the `production` wrangler environment, deployed
  only by a `v*` tag or a manual run of `deploy-production.yml`.

## Working in a discobox (issue-driven workers)

Issues and features can be worked by agents in discobox sandboxes
(`docs/discobox.md`). The box is prepared by `.discobox/scripts/pre-harness`
(dependencies, Prisma client, local D1 with demo data, `.env.local`), runs the
app and a LiveKit dev server as boot services. `.discobox/hooks/` declares
typecheck, lint and test hooks for boxes with a hook runner; run the three
commands yourself regardless.

- The repository's rules above apply unchanged; in a box you are the only
  agent.
- Verify at runtime with the `verify-recipes` skill (`.discobox/skills/`,
  also linked as `.claude/skills/verify-recipes`). Say in the PR what could not
  be driven (Bluesky login, Android, iOS, deploys).
- Work leaves the box as a PR from `discobox/issue-<N>`; never a push to
  `main`, never a deploy, never a remote migration. The factory manager merges
  a worker's PR once the `CI` check is green and its process check passed
  (design PRs and anything labelled `status/needs-decision` wait for the
  owner); the merge deploys rabble.rodeo, and a failed deploy rolls itself
  back (`docs/DEPLOY.md`, Rollback and uptime).
- PR descriptions are short, 20 lines at most. Summary: two to four
  sentences on the cause and the fix, naming the one file a reviewer should
  open. `## Evidence` keeps exactly its four lines (Review with the sha,
  Verify, Tests, Done when), each one sentence under 30 words, then
  `Closes #N`. No logs, captured requests, test-design rationale, review
  history or mobile-parity essays in the body; if something there matters
  to the reviewer, it goes in one PR comment.
- A web change to a flow the Android or iOS app also implements (reactions,
  raised hands, stage, theme) names that in the PR and files a follow-up issue.
  The `mobile-apps` skill lists those flows, their wire contract and the
  apps' screen conventions; load it before touching `android/` or `ios/`.
- Issues that change how a screen looks load the `frontend-design` skill
  first (aesthetic direction) and `rabble-design-system` (the tokens and
  layout rules it must respect).
- An issue labelled `idea` (the "Idea to research" template) is researched,
  not delivered: a `research-issue` worker posts a go / no-go /
  needs-decision comment and, on go, files the follow-up issues that are
  then triaged and delivered as usual (`docs/discobox.md`, Ideas).
- Extra reviewers for `discobox-review` live in `.discobox/review/`.
- Harness configs `aperture-triage`, `aperture-deliver` (the default),
  `aperture-qa` and `aperture-design` (Opus, for UI work) run Claude Code
  through the metered tailnet gateway;
  `scripts/discobox-gateway-harness.sh SLUG MODEL` creates one or changes
  its model (`docs/discobox.md`). `switchyard-triage` is the same config
  pointed at the Switchyard router container (`scripts/switchyard/`), an
  experiment that lets a local judge model send triage turns to a
  limit-free local model (`docs/discobox.md`, Routing experiment).
- QA of the live site: `scripts/qa-live.mjs` (deterministic, run after
  every deploy) and the `qa-live` skill (daily box that also screenshots
  and files `qa` issues). Issues labelled `qa` come from it; issues labelled
  `logs` come from `scripts/log-triage.mjs` scanning the Workers' error
  logs every six hours; issues labelled `latency` come from
  `scripts/latency-triage.mjs`, run the same six hours, scanning the same
  Workers' P95/P99 wall time; issues labelled `feedback` come from the
  `feedback-intake` skill reading the feedback button's reports, and carry
  `status/needs-decision` until the owner decides. Issues labelled `ops`
  come from `scripts/box-watch.mjs`, which watches boxes for Claude usage
  limits and resumes them at the reset (`docs/discobox.md`, Usage limits).
