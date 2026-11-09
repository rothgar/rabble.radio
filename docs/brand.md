# Rabble Radio brand

Bold retro / modern vintage: warm cream paper, teal ink, red and orange
accents, a heavy soft serif for the name and headers, a clean sans for
everything else. This file is the hand-off spec; the implementation lives in
`src/app/globals.css` (web), `android/.../ui/Theme.kt` and
`ios/Rabble/Theme.swift`.

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

A heavy slab-serif **R** whose right side becomes two radio waves (concentric
arcs centred on the bowl). Teal letter, red waves on cream; cream letter,
mustard waves on teal.

- `assets/brand/monogram.svg` — transparent, light backgrounds
- `assets/brand/monogram-dark.svg` — transparent, dark backgrounds
- `assets/brand/app-icon.svg` / `app-icon-1024.png` — on cream, for app icons
- `assets/brand/monogram-1024.png` — transparent PNG
- Web: `src/app/icon.svg` (favicon), `src/app/apple-icon.png`, `public/logo.png`
  (push notifications); React: `Monogram` / `Wordmark` in `src/components/ui/Logo.tsx`
- Android: adaptive icon `res/mipmap-anydpi-v26/ic_launcher.xml`
- iOS: `Rabble/Assets.xcassets/AppIcon.appiconset`

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
