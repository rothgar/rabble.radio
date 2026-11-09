import type { Config } from 'tailwindcss';

/**
 * Tailwind config wired to the Rabble Radio design token system.
 *
 * Breakpoints (mobile-first):
 *   base      → mobile   < 640 px  (all phones — 375–430 px viewport)
 *   sm:       → phablet    640 px+ (landscape phone, small tablet)
 *   md:       → tablet     768 px+ (iPad portrait, Android tablet)
 *   lg:       → desktop   1024 px+ (laptop / desktop)
 *   xl:       → wide      1280 px+ (large desktop)
 *
 * Touch targets: use min-h-touch (44 px) on all interactive elements.
 * Spacing: 4 px grid — see --space-* in globals.css.
 * Radius:  use rounded-xs/sm/md/lg/xl from the scale below.
 */
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    /* Override Tailwind's default screens so breakpoint names match the docs */
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
    },
    extend: {
      /* ── Fonts — Fraunces display face + Inter body ──────────────────── */
      fontFamily: {
        sans:    'var(--font-sans)',
        display: 'var(--font-display)',
      },

      /* ── Border width — the brand's thick outline is the default ─────── */
      borderWidth: {
        DEFAULT: 'var(--border-width)',   /* 1.5 px */
        2: '2px',
        3: '3px',
      },

      /* ── Border radius — maps to CSS var scale ───────────────────────── */
      borderRadius: {
        xs:   'var(--radius-xs)',   /* 4 px  — chips, badges */
        sm:   'var(--radius-sm)',   /* 8 px  — buttons, inputs */
        md:   'var(--radius-md)',   /* 12 px — cards */
        lg:   'var(--radius-lg)',   /* 16 px — panels */
        xl:   'var(--radius-xl)',   /* 24 px — sheets, modals */
      },

      /* ── Spacing — semantic additions on top of Tailwind's 4 px scale ── */
      spacing: {
        touch: 'var(--touch-min)',  /* 44 px minimum tap/click target */
      },
      minHeight: {
        touch: 'var(--touch-min)',
      },
      minWidth: {
        touch: 'var(--touch-min)',
      },

      /* ── Max widths ──────────────────────────────────────────────────── */
      maxWidth: {
        content: '1024px',  /* main content column max width */
        wide:    '1280px',  /* full page max width */
      },

      /* ── Font sizes — map to the documented type scale ───────────────── */
      fontSize: {
        caption: ['var(--text-xs)',   { lineHeight: '1.4' }],
        label:   ['var(--text-sm)',   { lineHeight: '1.4' }],
        body:    ['var(--text-base)', { lineHeight: '1.5' }],
        title:   ['var(--text-md)',   { lineHeight: '1.3' }],
        heading: ['var(--text-lg)',   { lineHeight: '1.25' }],
        display: ['var(--text-xl)',   { lineHeight: '1.2' }],
      },
    },
  },
  plugins: [],
};

export default config;
