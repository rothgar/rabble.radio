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
- `prisma/` schema and migrations; `k8s/` manifests; `docs/` setup guides

## Conventions

- Design system: 4px grid tokens in `src/app/globals.css`, exposed through Tailwind aliases. Use `var(--color-*)` tokens and the `ui/` primitives. No hardcoded colors. Min 44px touch targets. Mobile-first.
- Any `prisma/schema.prisma` change needs a D1 migration in `prisma/d1/<nnnn>_<name>.sql` (apply with `pnpm d1:migrate:local` / `pnpm d1:migrate:remote`) and `pnpm prisma:generate`.
- Every new lib function or API route gets a test in the matching `tests/` folder.
- Commit straight to `main` is the repo convention. A push to `main` deploys
  rabble.rodeo through `.github/workflows/deploy.yml` (`docs/DEPLOY.md`), so
  the three commands above must pass before pushing.

## Working as a team

Agent teams are enabled in `.claude/settings.json`. Claude is the lead and the `reviewer`. The three implementation roles (`frontend-dev`, `test-writer`, `dev`) are Claude wrappers in `.claude/agents/` that hand the task to a Kimchi persona in `.kimchi/agents/` through `scripts/kimchi-agent.sh`. The Kimchi persona file sets the model and thinking level; edit it there, not in the wrapper.

- The lead breaks work into tasks with one owner each and no two tasks touching the same file.
- Spawn implementation teammates with `isolation: worktree` on the Agent call itself; frontmatter alone is not honored for named teammates.
- Task text sent to an implementation teammate must be self-contained: files to touch, expected behavior, and acceptance criteria. Kimchi sees only that text plus the persona and this file.
- Wrappers verify with typecheck, lint, and test before marking a task complete, then message the `reviewer` with the branch and diff summary.
- The reviewer never edits. It reports findings to the task owner by name and to the lead.
- To run a persona by hand: `scripts/kimchi-agent.sh dev "Add a GET /api/health/db route that pings Prisma"`.
- Skills: project skills live in `.claude/skills/<name>/SKILL.md` (Claude Code loads them; `rabble-design-system` covers tokens, layout rules and Tailwind gotchas). A persona lists `skills: [...]` in its frontmatter and `scripts/kimchi-agent.sh` appends those bodies to its system prompt, resolving `.claude/skills/` first and then `.kimchi/skills/` (Kimchi-only, e.g. the vendored `frontend-design`). `KIMCHI_AGENT_PRINT_PROMPT=1 scripts/kimchi-agent.sh frontend-dev x` prints the assembled prompt.

## Working in a discobox (issue-driven workers)

Issues and features can be worked by agents in discobox sandboxes
(`docs/discobox.md`). The box is prepared by `.discobox/scripts/pre-harness`
(dependencies, Prisma client, local D1 with demo data, `.env.local`), runs the
app and a LiveKit dev server as boot services. `.discobox/hooks/` declares
typecheck, lint and test hooks for boxes with a hook runner; run the three
commands yourself regardless.

- The repository's rules above apply unchanged; "Working as a team" does not:
  in a box you are the only agent, and Kimchi wrappers are not available.
- Verify at runtime with the `verify-recipes` skill (`.discobox/skills/`,
  also linked as `.claude/skills/verify-recipes`). Say in the PR what could not
  be driven (Bluesky login, Android, iOS, deploys).
- Work leaves the box as a PR from `discobox/issue-<N>`; never a push to
  `main`, never a deploy, never a remote migration. The owner merges and deploys.
- PR descriptions are short, 20 lines at most. Summary: two to four
  sentences on the cause and the fix, naming the one file a reviewer should
  open. `## Evidence` keeps exactly its four lines (Review with the sha,
  Verify, Tests, Done when), each one sentence under 30 words, then
  `Closes #N`. No logs, captured requests, test-design rationale, review
  history or mobile-parity essays in the body; if something there matters
  to the reviewer, it goes in one PR comment.
- A web change to a flow the Android or iOS app also implements (reactions,
  raised hands, stage, theme) names that in the PR and files a follow-up issue.
- Extra reviewers for `discobox-review` live in `.discobox/review/`.
- Harness configs `aperture-triage`, `aperture-deliver` (the default) and
  `aperture-qa` run Claude Code through the metered tailnet gateway;
  `scripts/discobox-gateway-harness.sh SLUG MODEL` creates one or changes
  its model (`docs/discobox.md`).
- QA of the live site: `scripts/qa-live.mjs` (deterministic, run after
  every deploy) and the `qa-live` skill (daily box that also screenshots
  and files `qa` issues). Issues labelled `qa` come from it.
