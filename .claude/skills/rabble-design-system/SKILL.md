---
name: rabble-design-system
description: How to build and change rabble.radio UI (Next.js App Router, React 19, Tailwind 3) with the project's design tokens, ui/ primitives, mobile-first layout rules, Tailwind gotchas and test conventions. Load before touching anything in src/components or src/app.
---

# rabble.radio design system

Single source of truth: `src/app/globals.css` (tokens) and `tailwind.config.ts`
(aliases). Primitives live in `src/components/ui/` (`Button`, `Card`,
`PageLayout`). Read those three files before writing UI.

## Tokens, never raw colors

- Colors are CSS variables used as Tailwind arbitrary values:
  `bg-[var(--color-surface)]`, `text-[var(--color-text-secondary)]`,
  `border-[var(--color-border)]`. Never use Tailwind palette classes
  (`slate-*`, `sky-*`, `red-*`) or hex values in components.
- Main tokens: `--color-bg`, `--color-surface`, `--color-surface-raised`,
  `--color-text`, `--color-text-secondary`, `--color-text-tertiary`,
  `--color-accent` (+ `-hover`, `-100…-900`, `-muted`), `--color-border`,
  `--color-border-strong`, `--color-live`, `--color-success`,
  `--color-warning`, `--color-error`.
- Translucent fills must use explicit tokens: `--color-bg-translucent`
  (sticky bars), `--color-surface-translucent` (dashed placeholders),
  `--color-live-muted`, `--color-live-border`, `--color-success-muted`,
  `--color-accent-muted`. Add a new token in `globals.css` rather than
  inventing an rgba in a component.
- Type scale aliases: `text-caption`, `text-label`, `text-body`, `text-title`,
  `text-heading`, `text-display`. Radii: `rounded-xs|sm|md|lg|xl`.
  Touch targets: `min-h-touch` / `min-w-touch` (44px) on every tappable thing.

## Tailwind 3 gotcha that bit this project

`bg-[var(--x)]/50` (an opacity modifier on a CSS-variable color) compiles to
**nothing**: no background at all, silently. The same applies to `border-…/40`
and `text-…/70`. Use the translucent tokens above instead. If you need a new
one, add it to `globals.css`.

## Layout

- Mobile-first. Base styles target 360–430px wide phones; add `sm:` (640),
  `md:` (768), `lg:` (1024), `xl:` (1280) only to widen.
- Page gutters come from `PageLayout` (16px / 24px / 32px). Never hand-roll
  `<main className="… max-w-3xl p-6">`; wrap pages in `<PageLayout>` (pass
  `className="max-w-xl"` for narrow forms, `fullBleed` for the live room).
  `SiteHeader` uses the same `px-4 sm:px-6` gutters so edges line up.
- The live room (`SpaceRoom` → `NocturneShell`) owns the whole viewport: sticky
  nav on top, sticky `BottomControlBar` at the bottom with
  `pb-[max(12px,env(safe-area-inset-bottom))]`, and a body that is
  `flex flex-col` on phones and a two-column grid from `md:`. The show page
  hides its own header, max width and detail sections while
  `SpacePageClient` reports `onJoinedChange(true)`; keep the React tree
  positions stable (`{inRoom ? null : <SiteHeader />}`) so the room is never
  remounted.
- A `flex` container without `flex-col` lays children in a row. On phones
  that is almost always a bug.
- Grids of avatar cards: `grid-cols-2 sm:grid-cols-3 xl:grid-cols-4`.

## Components

- Server components by default; add `'use client'` only for state, effects,
  refs or browser APIs.
- Every interactive or asserted element keeps a stable `data-testid`. Do not
  rename existing ones; tests in `tests/` depend on them.
- Use `<Button variant size href>` for actions and links styled as buttons,
  `<Card href interactive>` for clickable panels.
- Avatars: `<img>` with `// eslint-disable-next-line @next/next/no-img-element`
  (Bluesky CDN URLs are not configured as Next image domains).

## Verification before you report done

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm test
```

The new `react-hooks/set-state-in-effect` rule is a warning, not an error;
prefer deriving state or using event handlers for new code anyway. Add or
update a test under `tests/components` or `tests/app` for anything with
logic (render with `@testing-library/react`, happy-dom, mocked `fetch`).
