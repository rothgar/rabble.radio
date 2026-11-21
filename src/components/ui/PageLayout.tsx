import type { ReactElement, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Remove the max-width cap for full-bleed layouts (e.g. live room). */
  fullBleed?: boolean;
  className?: string;
}

/**
 * Standard page content wrapper.
 *
 * Gutters:
 *   mobile  → 16 px sides  (--gutter)
 *   tablet  → 24 px sides  (--gutter-tablet, sm:)
 *   desktop → 32 px sides  (--gutter-desk,   lg:)
 *
 * Max-width: 1024 px centered — matches --content-max in the token system.
 *
 * `flex-1`: fills the remaining height of a `flex min-h-screen flex-col`
 * ancestor (see REVIEW.md, "sticky-footer composition") so a sibling after
 * it (a page footer) pins to the bottom of a short page. A no-op outside
 * such an ancestor, same as today.
 */
export function PageLayout({ children, fullBleed = false, className = '' }: Props): ReactElement {
  return (
    <main
      className={[
        'mx-auto flex w-full flex-1 flex-col gap-6',
        'px-4 py-6',
        'sm:px-6 sm:py-8',
        'lg:px-8',
        fullBleed ? '' : 'max-w-content',
        className,
      ].filter(Boolean).join(' ')}
    >
      {children}
    </main>
  );
}

export default PageLayout;
