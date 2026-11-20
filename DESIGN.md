---
version: alpha
name: rabble radio
description: Bold retro / modern vintage. Cream paper, teal ink, red and orange accents, a heavy soft serif for names and headers, a clean sans for everything else.
colors:
  # Brand accents. The same in light and dark appearance.
  primary: "#e63946"
  on-primary: "#ffffff"
  primary-hover: "#cf2e3b"
  primary-muted: "rgba(230, 57, 70, 0.12)"
  secondary: "#ff7f00"
  on-secondary: "#073b4c"
  secondary-hover: "#e67200"
  secondary-muted: "rgba(255, 127, 0, 0.14)"
  highlight: "#f9c74f"
  on-highlight: "#073b4c"
  highlight-muted: "rgba(249, 199, 79, 0.35)"
  # Paper, ink and text. These are the light (default) values; `dark` below
  # swaps the same roles.
  background: "#f1faee"
  background-translucent: "rgba(241, 250, 238, 0.94)"
  surface: "#f8fcf5"
  surface-raised: "#fffef9"
  surface-translucent: "rgba(248, 252, 245, 0.55)"
  on-surface: "#073b4c"
  on-surface-secondary: "#3d6472"
  on-surface-tertiary: "#7a9aa4"
  ink: "#073b4c"
  on-ink: "#f1faee"
  ink-muted: "rgba(7, 59, 76, 0.08)"
  outline: "#073b4c"
  divider: "rgba(7, 59, 76, 0.18)"
  scrim: "rgba(7, 59, 76, 0.55)"
  # Status
  live: "#e63946"
  live-muted: "rgba(230, 57, 70, 0.12)"
  success: "#2a9d8f"
  success-muted: "rgba(42, 157, 143, 0.15)"
  success-text: "#1f7a6f"
  warning: "#f9c74f"
  warning-muted: "rgba(249, 199, 79, 0.35)"
  warning-text: "#8a5a00"
  error: "#e63946"
  error-muted: "rgba(230, 57, 70, 0.12)"
  error-text: "#a32731"
  dark:
    background: "#062b38"
    background-translucent: "rgba(6, 43, 56, 0.94)"
    surface: "#0b3a4a"
    surface-raised: "#114757"
    surface-translucent: "rgba(11, 58, 74, 0.55)"
    on-surface: "#f1faee"
    on-surface-secondary: "#b9d1d8"
    on-surface-tertiary: "#7fa3ae"
    ink: "#f1faee"
    on-ink: "#073b4c"
    ink-muted: "rgba(241, 250, 238, 0.10)"
    on-secondary: "#f1faee"
    outline: "#e9f4ec"
    divider: "rgba(241, 250, 238, 0.18)"
    scrim: "rgba(0, 0, 0, 0.60)"
    primary-hover: "#f0515d"
    primary-muted: "rgba(230, 57, 70, 0.18)"
    secondary-hover: "#ff9e38"
    secondary-muted: "rgba(255, 127, 0, 0.18)"
    highlight-muted: "rgba(249, 199, 79, 0.22)"
    live: "#f0515d"
    live-muted: "rgba(240, 81, 93, 0.18)"
    success: "#3db9a9"
    success-muted: "rgba(61, 185, 169, 0.18)"
    success-text: "#7fe0d2"
    warning-muted: "rgba(249, 199, 79, 0.22)"
    warning-text: "#f9c74f"
    error: "#f0515d"
    error-muted: "rgba(240, 81, 93, 0.18)"
    error-text: "#f5a6ad"
typography:
  display-xl:
    fontFamily: Fraunces
    fontSize: 36px
    fontWeight: "900"
    lineHeight: 1.2
    letterSpacing: -0.01em
    fontVariation: '"SOFT" 100, "WONK" 0'
  display-lg:
    fontFamily: Fraunces
    fontSize: 30px
    fontWeight: "900"
    lineHeight: 1.2
    letterSpacing: -0.01em
    fontVariation: '"SOFT" 100, "WONK" 0'
  display:
    fontFamily: Fraunces
    fontSize: 24px
    fontWeight: "900"
    lineHeight: 1.2
    letterSpacing: -0.01em
    fontVariation: '"SOFT" 100, "WONK" 0'
  heading:
    fontFamily: Fraunces
    fontSize: 20px
    fontWeight: "900"
    lineHeight: 1.25
    letterSpacing: -0.01em
    fontVariation: '"SOFT" 100, "WONK" 0'
  title-display:
    fontFamily: Fraunces
    fontSize: 17px
    fontWeight: "900"
    lineHeight: 1.3
    letterSpacing: -0.01em
    fontVariation: '"SOFT" 100, "WONK" 0'
  title:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: "600"
    lineHeight: 1.3
  body:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: "400"
    lineHeight: 1.5
  label:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: "600"
    lineHeight: 1.4
  caption:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: "500"
    lineHeight: 1.4
rounded:
  xs: 4px
  sm: 8px
  md: 8px
  lg: 12px
  xl: 16px
  full: 9999px
spacing:
  "1": 4px
  "2": 8px
  "3": 12px
  "4": 16px
  "5": 20px
  "6": 24px
  "8": 32px
  "10": 40px
  "12": 48px
  "16": 64px
  gutter: 16px
  gutter-tablet: 24px
  gutter-desktop: 32px
  touch: 44px
  content: 1024px
  wide: 1280px
motion:
  state-change:
    duration: 150ms
    timingFunction: cubic-bezier(0.4, 0, 0.2, 1)
  live-pulse:
    duration: 1600ms
    timingFunction: ease-in-out
  reaction-float:
    duration: 3200ms
    timingFunction: linear
  skeleton-pulse:
    duration: 2000ms
    timingFunction: cubic-bezier(0.4, 0, 0.6, 1)
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "{spacing.4}"
    height: "{spacing.touch}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-accent:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "{spacing.4}"
    height: "{spacing.touch}"
  button-accent-hover:
    backgroundColor: "{colors.secondary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "{spacing.4}"
    height: "{spacing.touch}"
  button-secondary-hover:
    backgroundColor: "{colors.highlight-muted}"
  button-ghost:
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-surface-secondary}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "{spacing.4}"
    height: "{spacing.touch}"
  button-ghost-hover:
    backgroundColor: "{colors.ink-muted}"
    textColor: "{colors.on-surface}"
  button-danger:
    backgroundColor: "{colors.error-muted}"
    textColor: "{colors.error-text}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "{spacing.4}"
    height: "{spacing.touch}"
  button-hero:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.title-display}"
    rounded: "{rounded.sm}"
    padding: "{spacing.5}"
    height: "{spacing.touch}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "{spacing.4}"
  card-hover:
    backgroundColor: "{colors.surface-raised}"
  card-featured:
    backgroundColor: "{colors.highlight}"
    textColor: "{colors.on-highlight}"
    rounded: "{rounded.md}"
    padding: "{spacing.4}"
  panel-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.md}"
    padding: "{spacing.4}"
  dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.5}"
  sheet:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.xl}"
    padding: "{spacing.4}"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "{spacing.3}"
    height: "{spacing.touch}"
  chip:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.on-surface-secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "{spacing.2}"
  badge-live:
    backgroundColor: "{colors.live-muted}"
    textColor: "{colors.live}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "{spacing.1}"
  section-label:
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-surface-tertiary}"
    typography: "{typography.label}"
  page-title:
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-surface}"
    typography: "{typography.display}"
  section-heading:
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-surface}"
    typography: "{typography.heading}"
  hero-title:
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-surface}"
    typography: "{typography.display-xl}"
  body-text:
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body}"
  secondary-text:
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-surface-secondary}"
    typography: "{typography.body}"
  alert-success:
    backgroundColor: "{colors.success-muted}"
    textColor: "{colors.success-text}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "{spacing.3}"
  alert-warning:
    backgroundColor: "{colors.warning-muted}"
    textColor: "{colors.warning-text}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "{spacing.3}"
  alert-error:
    backgroundColor: "{colors.error-muted}"
    textColor: "{colors.error-text}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "{spacing.3}"
  sticky-bar:
    backgroundColor: "{colors.background-translucent}"
    textColor: "{colors.on-surface}"
    padding: "{spacing.3}"
  placeholder-dashed:
    backgroundColor: "{colors.surface-translucent}"
    textColor: "{colors.on-surface-secondary}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "{spacing.5}"
  modal-scrim:
    backgroundColor: "{colors.scrim}"
    textColor: "{colors.on-ink}"
  tab-active:
    backgroundColor: "{colors.background}"
    textColor: "{colors.secondary}"
    typography: "{typography.label}"
  status-dot-success:
    backgroundColor: "{colors.success}"
    textColor: "{colors.on-primary}"
  status-dot-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.on-highlight}"
---

# rabble radio

Live audio shows for Bluesky: a host and co-hosts on a stage, listeners in an
audience, reactions floating up from avatars. The product is a small radio
station, not a conference tool, and the design should feel like a station: a
printed flyer, a record sleeve, a sticker on a lamppost.

This file is the design brief for people and agents writing UI. The tokens
above are the normative values. The web implementation of every token is a
CSS custom property in `src/app/globals.css`, exposed through Tailwind
aliases in `tailwind.config.ts`; Android mirrors them in `ui/Theme.kt` and
iOS in `Theme.swift`. **In code, use the implementation's name, never the hex
value**: on the web `bg-[var(--color-surface)]`, on Android
`RabbleColors.surface`, on iOS `RabbleColors.surface`. The tables in each
section give the web name for every token. Validate changes to this file with
`pnpm design:lint`; `tests/design/design-md.test.ts` fails when a colour here
drifts from `globals.css`.

## Overview

**Bold retro / modern vintage.** Warm cream paper, deep teal ink, a red and
an orange that read as print inks rather than screen glows, and a mustard
yellow for backdrops. Everything sits in solid rounded containers with a
thick teal outline, the way a screen-printed flyer separates its panels.
Depth comes from hard offset shadows, never from blur. The wordmark is
lower-case, `rabble radio`, set in the display face.

Two personalities meet: the display face (Fraunces Black, the open-licence
stand-in for Cooper Black) is loud and friendly and carries the name, page
titles and hero buttons; Inter does the quiet work of lists, forms and body
copy. When a rule below does not cover a case, choose the option that looks
more like print and less like a software dashboard: a solid fill over a
gradient, an outline over a drop shadow, a flat badge over a pill with a glow.

The app is used on phones first, often one-handed while listening. Mobile
layouts are the base; wider screens only get more columns.

## Colors

The palette is five brand colours and the roles derived from them. Red is
the single most important thing on a screen (the key action, the live
badge); orange is the second accent (active tabs, highlights, the accent
button); mustard backs featured cards and secondary badges; teal is ink
(text, outlines, header fills); cream is paper. Backgrounds are cream, never
pure white. Status colours reuse the palette: live and error are red, warning
is mustard, success is a teal-green.

| Token | Role | Web name |
|---|---|---|
| `primary`, `on-primary`, `primary-hover`, `primary-muted` | Rebel Red: key buttons, live, errors | `--color-accent`, white, `--color-accent-hover`, `--color-accent-muted` (tints `--color-accent-100…900`) |
| `secondary`, `on-secondary`, `secondary-hover`, `secondary-muted` | Vintage Orange: accent button, active tabs, links in dark mode | `--color-accent-2`, `--color-text`, `--color-accent-2-hover`, `--color-accent-2-muted` (tints `--color-accent-2-100…900`) |
| `highlight`, `on-highlight`, `highlight-muted` | Mustard: featured card backdrops, secondary badges, secondary-button hover | `--color-highlight`, `--color-highlight-text`, `--color-highlight-muted` |
| `background`, `background-translucent` | Page; sticky bars over content | `--color-bg`, `--color-bg-translucent` |
| `surface`, `surface-raised`, `surface-translucent` | Cards and list rows; sheets and popovers; dashed placeholders | `--color-surface`, `--color-surface-raised`, `--color-surface-translucent` |
| `on-surface`, `on-surface-secondary`, `on-surface-tertiary` | Primary, secondary, placeholder/disabled text | `--color-text`, `--color-text-secondary`, `--color-text-tertiary` |
| `ink`, `on-ink`, `ink-muted` | Solid teal fills (header blocks, inverted cards) and text on them; quiet hover wash | `--color-ink`, `--color-text-on-ink`, `--color-ink-muted` |
| `outline`, `divider`, `scrim` | The 1.5px outline on every container; quiet inner separators; modal backdrop | `--color-border` (= `--color-border-strong`), `--color-divider`, `--color-scrim` |
| `live`, `live-muted` | On-air badge and dot | `--color-live` (border `--color-live-border`), `--color-live-muted` |
| `success`, `warning`, `error` (+ `-muted`, `-text`) | Status fills, their translucent backgrounds, and the copy colour on them | `--color-success`, `--color-warning`, `--color-error` (+ `-muted`, `-text`) |

**Dark appearance** is the same palette inverted: deep teal paper, cream ink,
the red, orange and mustard accents unchanged, red lifted slightly so live and
error copy stay readable. Every role under `colors.dark` replaces the same
role at the top level; a role missing from `dark` keeps its light value. On
the web the swap happens inside the CSS variables (`:root[data-theme="dark"]`
and `prefers-color-scheme: dark`), so components never branch on theme and
never pick a colour that only works on cream. A new colour needs both values,
added to `globals.css` as a token, never as an inline hex or rgba.

Translucent colours are their own tokens (`*-muted`, `*-translucent`) because
Tailwind 3 cannot apply an opacity modifier to a `var()` colour:
`bg-[var(--color-x)]/50` compiles to nothing.

## Typography

Two families, clearly distinct. **Fraunces** at weight 900 with the soft
optical axis (`font-variation-settings: "SOFT" 100, "WONK" 0`, letter-spacing
−0.01em) is the display face: the wordmark, `h1` and `h2`, numbers that are
the point of a screen, and large hero buttons. Swap in Cooper Black or
Recoleta Black by replacing the font files; nothing else changes. **Inter**
is the body face for everything else, including `h3` and below, so dense
lists keep their rhythm.

| Token | Size / line | Use | Web name |
|---|---|---|---|
| `display-xl`, `display-lg` | 36px, 30px / 1.2 | Hero and large titles (desktop, mobile) | `text-3xl`, `text-2xl` (`--text-3xl`, `--text-2xl`) |
| `display` | 24px / 1.2 | Page title (`h1`) | `text-display` |
| `heading` | 20px / 1.25 | Section heading (`h2`) | `text-heading` |
| `title`, `title-display` | 17px / 1.3 | List items, dialog titles, large buttons (`title-display` is the same size in Fraunces) | `text-title`, `text-title font-display` |
| `body` | 15px / 1.5 | Body copy, buttons, inputs | `text-body` |
| `label` | 13px / 1.4 | Secondary labels, chips, small buttons | `text-label` |
| `caption` | 11px / 1.4 | Badges, timestamps | `text-caption` |

The web applies the display face to `h1` and `h2` automatically; add
`font-display` to opt a span or a button in, `font-sans` to opt a heading
out. Keep line length under about 70 characters; the content column is
1024px wide and text blocks inside it should not run edge to edge on a
desktop. Headlines are set as one piece: never italicise or recolour a
single word for emphasis.

## Layout

A 4px grid; every spacing value is a multiple of four. The `spacing` tokens
are the web's Tailwind scale (`p-4` is 16px, `gap-6` is 24px), and the same
numbers are points on iOS and dp on Android.

- **Mobile first.** Base styles target 360 to 430px wide phones. Add `sm:`
  (640px), `md:` (768px), `lg:` (1024px) and `xl:` (1280px) only to widen.
  A `flex` row that should stack on phones is the most common layout bug.
- **Gutters** come from one wrapper (`PageLayout` on the web): 16px on
  phones, 24px from 640px, 32px from 1024px, content capped at 1024px and
  centred. The site header uses the same gutters so edges line up. Narrow
  forms cap at `max-w-xl`; the live room is full-bleed.
- **Touch targets** are at least 44px tall and wide (`min-h-touch`,
  `min-w-touch`) on every tappable thing, including chips and icon buttons.
- **The live room** owns the viewport: a sticky header, a sticky bottom
  control bar padded for the home indicator
  (`pb-[max(12px,env(safe-area-inset-bottom))]`), a body that is a column on
  phones and a two-column grid from 768px. Avatar grids are
  `grid-cols-2 sm:grid-cols-3 xl:grid-cols-4`.
- **Alignment** is left. Centre only short, standalone things: an empty
  state, a sign-in card, a single hero line.
- **Sections** are separated by space (`gap-6`, 24px) and by headings, not by
  rules. A divider (`divider`) is for rows inside one container.

## Elevation & Depth

Flat print, not glass. A container is a solid fill with a 1.5px outline in
`outline` (2px, `border-2`, for emphasis); the outline is what separates it
from the page, so shadows are optional and when used they are **hard
offsets** in the ink colour, never blurred:

| Web name | Value |
|---|---|
| `--shadow-sm` | `0 0 0 1.5px outline` (the outline alone) |
| `--shadow-md` | outline + `4px 4px 0` ink at 18% (hover on interactive cards, sign-in card) |
| `--shadow-lg` | 2px outline + `8px 8px 0` ink at 18% (sheets, menus) |

Layering: page (`background`) → card or row (`surface`) → sheet, popover or
hovered card (`surface-raised`). Modals sit over `scrim`. Teal
(`ink`) blocks with cream text are the loudest layer and are reserved for a
header fill or one inverted card per screen.

## Shapes

Solid rounded rectangles with 8px corners. The scale is deliberately short:

- `xs` 4px: chips, tags, small badges that are not pills.
- `sm` 8px: buttons and text inputs.
- `md` 8px: cards and list containers (the same radius as buttons on purpose;
  the outline, not the corner, tells them apart).
- `lg` 12px: panels, dialogs, action sheets.
- `xl` 16px: bottom sheets and modals.
- `full`: pills (chips, count badges, the live badge) and avatars.

No other radius. No mixing radii inside one component (a 12px card with 8px
buttons inside it is fine; a 12px card with a 6px image is not). Icons use
rounded caps to match.

## Motion & Micro-interaction

Motion answers an action; it is not decoration. Hover and press states
change colour over `state-change` (150ms, the standard ease) and a pressed
control drops to 80% opacity. Interactive cards lift to `surface-raised` and
gain `--shadow-md` on hover. Three ambient animations exist and no more
should be added without a reason:

- `live-pulse`: the on-air dot fades between 100% and 35% opacity, 1.6s,
  ease-in-out, forever.
- `reaction-float`: a reaction emoji pops in above the sender's avatar,
  drifts up about 200px with a small sideways offset so simultaneous
  reactions do not stack, and fades late; 3.2s, linear, once.
- `skeleton-pulse`: loading bars on the home page.

Honour `prefers-reduced-motion`: the pulse and float may stop, the reaction
may simply appear and disappear. Animate `transform` and `opacity` only. No
page-load reveals, no staggered fade-ins per section, no parallax.

## Voice & Content Strategy

Plain, warm, short. Sentence case everywhere, including buttons and
headings; the wordmark is lower-case. A button says what happens: "Go live",
"Raise hand", "Save changes", not "Submit". An action keeps its name through
the whole flow (the "Publish" button leads to a "Published" toast). Name
things by what listeners and hosts understand: a show, a stage, the audience,
a replay; never a room, a space, a session, a participant. Empty states
invite ("No shows on air right now. Start one?"); errors say what went wrong
and what to do, in the interface's voice, without apology. Numbers that
matter (listeners on air, minutes left) may be set in the display face; small
metadata stays in Inter.

## Components

The web primitives live in `src/components/ui/` and are the reference
implementation; the apps mirror them (`ui/Common.kt`, the bottom of
`Theme.swift`). Use the primitive where one exists rather than hand-rolling
the same classes.

### Buttons

Rounded rectangles (`sm`, 8px), 44px tall, with the 1.5px `outline` on every
variant except `ghost`. `button-primary` is red with white text for the one
main action; `button-accent` is orange with teal text for the secondary call
to action (invite, join); `button-secondary` is a cream card that warms to
`highlight-muted` on hover; `button-ghost` is text only and takes an
`ink-muted` wash on hover; `button-danger` is a red-tinted outline button
for leaving and deleting. `button-hero` is the large size: the display face
at 17px, 20px side padding. Focus is a 2px orange ring offset from the page.
Disabled is 40% opacity. On the web: `<Button variant size href>`.

### Cards and panels

`card` is the unit of every list: `surface` fill, `md` corners, 16px padding,
the outline. Interactive cards (`<Card href interactive>`) move to
`surface-raised` and `--shadow-md` on hover. `card-featured` puts a mustard
backdrop behind a highlighted show; `panel-ink` is the inverted teal block
for a header or one featured panel. `dialog` and `sheet` are the raised
layers, 12px and 16px corners, over `scrim`.

### Inputs

`input-field`: cream fill, teal text, the outline, 8px corners, 44px tall,
placeholder in `on-surface-tertiary`. Labels sit above the field in `label`;
help and error text below in `label` using `on-surface-secondary` or
`error-text`.

### Chips, badges and labels

`chip` is a `surface-raised` pill in `label` for tags, counts and filters,
44px tall when tappable. `alert-success`, `alert-warning` and `alert-error`
are the inline status panels: the status colour's `-muted` fill with its
`-text` copy colour, 8px corners. `badge-live` is the red pill with the pulsing dot
that marks a show on air. `section-label` is the small tertiary label above
a list ("On air", "Popular"); it is the one place the product sets text in
small caps with wide tracking, and it stays there. Reactions render as the
bare emoji, never with the sender's name or avatar.

### Navigation and the room

The site header carries the monogram and lower-case wordmark
(`src/components/ui/Logo.tsx`), the theme toggle and the account entry.
Active tabs are orange. The room's bottom control bar holds mic, hand, react
and leave; raised hands appear as a ✋ badge on the listener and, for hosts,
in a "Raised hands" group above the audience with invite buttons.

## Do's and Don'ts

- Do use the token's implementation name (`var(--color-*)`, `RabbleColors.*`)
  and never the hex value or a Tailwind palette class (`slate-*`, `red-*`).
- Do give every new colour a dark-appearance value in `globals.css` and check
  the screen in both appearances.
- Do keep the thick outline on containers; a card without its outline reads
  as a different product.
- Do keep 44px touch targets and the 4px grid, and keep every interactive or
  asserted element's `data-testid` stable.
- Don't use blurred shadows, gradients, glass or glow effects.
- Don't use pure white backgrounds, grey text on grey, or a third accent.
- Don't put the display face on `h3` and below, in body copy or in dense
  lists.
- Don't add ambient motion (page-load reveals, hover lifts on every card,
  staggered fade-ins).
- Don't use an opacity modifier on a variable colour (`bg-[var(--x)]/50`);
  use the `-muted` or `-translucent` token.
- Don't write ALL-CAPS labels, eyebrows above headings, middle-dot meta
  strings or arrows in link text; the `section-label` is the one exception
  and already exists.
