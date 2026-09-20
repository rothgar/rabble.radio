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
 */
export function PageLayout({ children, fullBleed = false, className = '' }: Props): ReactElement {
  return (
    <main
      className={[
        'mx-auto flex min-h-screen w-full flex-col gap-6',
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
