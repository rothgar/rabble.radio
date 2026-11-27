# Rabble Radio brand

Bold retro / modern vintage: warm cream paper, teal ink, red and orange
accents, a heavy soft serif for the name and headers, a clean sans for
everything else. This file is the hand-off spec; `DESIGN.md` at the repo root is the
machine-readable version for agents (tokens plus rationale); the
implementation lives in `src/app/globals.css` (web),
`android/.../ui/Theme.kt` and `ios/Rabble/Theme.swift`.

## Colours

| Name            | Hex       | Role                                                  | Token |
|-----------------|-----------|-------------------------------------------------------|-------|
| Rebel Red       | `#E63946` | Primary accent, live badges, key buttons              | `--color-accent`, `--color-live` |
| Vintage Orange  | `#FF7F00` | Secondary accent, highlights, active tabs             | `--color-accent-2` |
| Retro Teal      | `#073B4C` | Primary text, borders, header fill                    | `--color-text`, `--color-border`, `--color-ink` |
| Mustard Yellow  | `#F9C74F` | Card backdrops, secondary badges, warnings            | `--color-highlight`, `--color-warning` |
| Cream White     | `#F1FAEE` | Page background; cards use the lighter `#F8FCF5`      | `--color-bg`, `--color-surface` |

Derived: secondary text `#3D6472`, tertiary `#7A9AA4`, success `#2A9D8F`,
quiet dividers `rgba(7,59,76,0.18)`.

### Dark appearance

The same palette inverted: deep teal paper, cream ink, the red / orange /
mustard accents unchanged. Page `#062B38`, cards `#0B3A4A`, raised `#114757`,
text `#F1FAEE`, secondary `#B9D1D8`, tertiary `#7FA3AE`, outlines `#E9F4EC`,
teal fills become cream with teal text, red lifts to `#F0515D` for live /
error text, links use `#FFB266`. Each platform offers System / Light / Dark:
web `ThemeToggle` (localStorage `rabble-theme`, `data-theme` on `<html>`),
Android the appearance action on the home bar (SharedPreferences `theme`),
iOS the home toolbar button and the Appearance picker on the account screen
(`@AppStorage("appearance")`).

## Typography

- **Display** (logo, h1/h2, hero buttons): Cooper Black in the spec. We ship
  the open-licence stand-in **Fraunces Black, Soft optical axis** (SIL OFL):
  `next/font/google` on the web (`SOFT` 100, `WONK` 0), `Fraunces72ptSoft-Black.ttf`
  bundled in both apps (`assets/fonts/`). Swap in Cooper Black / Recoleta
  Black by replacing the font files and `--font-display`.
- **Body** (everything else): **Inter**. Web via `next/font/google`; apps bundle
  Regular / Medium / SemiBold / Bold.
- The wordmark is lower-case: `rabble radio`.

## Mark

A heavy slab-serif **R** whose bowl becomes a dot and whose right side opens
into two radio-wave arcs. Teal letter, red dot and waves on cream; cream
letter, mustard dot and waves on teal.

- `assets/brand/monogram.svg` — transparent, light backgrounds
- `assets/brand/monogram-dark.svg` — transparent, dark backgrounds
- `assets/brand/app-icon.svg` / `app-icon-1024.png` — on cream, for app icons
- `assets/brand/app-icon-dark.svg` / `app-icon-dark-1024.png` — on teal, for
  dark-appearance app icons
- `assets/brand/monogram-1024.png` / `monogram-dark-1024.png` — transparent PNGs
- `assets/brand/bluesky-banner-light.png` / `bluesky-banner-dark.png` — the
  3000×1000 Bluesky profile banner (mark, wordmark, tagline), rendered by
  `assets/brand/bluesky-banner/make.sh` with headless Chrome
- Web: `src/app/icon.svg` (favicon, adapts via an embedded
  `prefers-color-scheme` rule), `src/app/apple-icon.png`, `public/logo.png`
  (push notifications, light only); React: `Monogram` / `Wordmark` in
  `src/components/ui/Logo.tsx`
- Android: adaptive icon `res/mipmap-anydpi-v26/ic_launcher.xml`, foreground
  `res/drawable/ic_launcher_foreground.xml` with a dark counterpart in
  `res/drawable-night/`; the background colour follows
  `res/values(-night)/colors.xml`'s `ic_launcher_background`
- iOS: `Rabble/Assets.xcassets/AppIcon.appiconset`, with `AppIcon-Dark.png`
  registered for the dark appearance in its `Contents.json`

## Layout rules

- Thick outlines: 1.5px teal (`border`, the Tailwind default here) on cards,
  buttons and inputs; 2px (`border-2`) for emphasis.
- Solid rounded containers, 8px corners (`rounded-md`); chips 4px; sheets 16px.
- High-contrast blocks: teal header fills with cream text, mustard backdrops
  for featured cards, red for live.
- Backgrounds are cream, never pure white.
- Buttons: rounded rectangles; primary red with white text, accent orange with
  teal text, secondary cream with teal text. Hero buttons use the display face.
- Shadows are hard offsets in teal (`--shadow-md`), not blurs.

## Room conventions

- A raised hand is the LiveKit participant attribute `hand` = `"1"` (cleared
  with `""`). Hosts see a "Raised hands" group above the listener list with
  Invite buttons; everyone sees a ✋ badge on that listener. Hands drop when
  the person reaches the stage.
- Reactions float as the bare emoji from the sender's avatar.
