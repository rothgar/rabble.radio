// src/lib/brand-mark.ts
//
// The "R" monogram's path data (assets/brand/monogram.svg is the source of
// truth) as plain constants, shared by src/components/ui/Logo.tsx's
// Monogram (a DOM component: Tailwind `className` sizing, a
// `var(--color-accent)` wave default) and
// src/app/show/[id]/opengraph-image.tsx (satori: no CSS engine, so neither
// of those work there -- it needs the raw path data with its own literal
// `style`). One copy of the coordinates so the two don't drift apart.

export const MONOGRAM_VIEW_BOX = '0 0 1024 1024';

export const MONOGRAM_LETTER_PATH =
  'M 268 246 L 436 246 L 436 505 L 522 505 L 693 697 L 756 716 L 756 779 L 612 779 L 452 582 L 436 582 L 436 705 L 478 717 L 478 779 L 268 779 L 268 717 L 313 705 L 313 318 L 268 306 Z';

export const MONOGRAM_WAVE_DOT = { cx: 462.5, cy: 450.5, r: 79.5 };

export const MONOGRAM_WAVE_ARCS = [
  'M 477.07 283.94 A 167.20 167.20 0 0 1 617.53 513.13',
  'M 472.09 175.77 A 274.90 274.90 0 0 1 684.90 612.08',
];
