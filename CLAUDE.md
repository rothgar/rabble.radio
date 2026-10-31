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
- Any `prisma/schema.prisma` change needs a migration in `prisma/migrations/<timestamp>_<name>/migration.sql`.
- Every new lib function or API route gets a test in the matching `tests/` folder.
- Commit straight to `main` is the repo convention.

## Working as a team

Agent teams are enabled in `.claude/settings.json`. Claude is the lead and the `reviewer`. The three implementation roles (`frontend-dev`, `test-writer`, `dev`) are Claude wrappers in `.claude/agents/` that hand the task to a Kimchi persona in `.kimchi/agents/` through `scripts/kimchi-agent.sh`. The Kimchi persona file sets the model and thinking level; edit it there, not in the wrapper.

- The lead breaks work into tasks with one owner each and no two tasks touching the same file.
- Spawn implementation teammates with `isolation: worktree` on the Agent call itself; frontmatter alone is not honored for named teammates.
- Task text sent to an implementation teammate must be self-contained: files to touch, expected behavior, and acceptance criteria. Kimchi sees only that text plus the persona and this file.
- Wrappers verify with typecheck, lint, and test before marking a task complete, then message the `reviewer` with the branch and diff summary.
- The reviewer never edits. It reports findings to the task owner by name and to the lead.
- To run a persona by hand: `scripts/kimchi-agent.sh dev "Add a GET /api/health/db route that pings Prisma"`.
- Skills: project skills live in `.claude/skills/<name>/SKILL.md` (Claude Code loads them; `rabble-design-system` covers tokens, layout rules and Tailwind gotchas). A persona lists `skills: [...]` in its frontmatter and `scripts/kimchi-agent.sh` appends those bodies to its system prompt, resolving `.claude/skills/` first and then `.kimchi/skills/` (Kimchi-only, e.g. the vendored `frontend-design`). `KIMCHI_AGENT_PRINT_PROMPT=1 scripts/kimchi-agent.sh frontend-dev x` prints the assembled prompt.
