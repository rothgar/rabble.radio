'use client';

import type { ReactElement, ReactNode } from 'react';

export interface NocturneShellProps {
  navAvatar?: ReactNode;
  header: ReactNode;
  main: ReactNode;
  sidebar: ReactNode;
  bottomBar: ReactNode;
}

export function NocturneShell({
  navAvatar,
  header,
  main,
  sidebar,
  bottomBar,
}: NocturneShellProps): ReactElement {
  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--color-bg)] text-[var(--color-text)]"
      data-testid="nocturne-shell"
    >
      <header
        className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--color-divider)] bg-[var(--color-bg)]/95 px-6 py-3 backdrop-blur"
        data-testid="nocturne-nav"
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-accent-700)] text-[var(--color-accent-200)]"
          >
            {/* Inline SVG brand mark: a stylized broadcast ring */}
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
              <path d="M5 5a10 10 0 0 0 0 14" />
              <path d="M19 5a10 10 0 0 1 0 14" />
              <path d="M8 8a6 6 0 0 0 0 8" />
              <path d="M16 8a6 6 0 0 1 0 8" />
            </svg>
          </span>
          <span className="text-base font-medium tracking-tight">
            Rabble Radio
          </span>
        </div>
        <div data-testid="nocturne-nav-avatar">{navAvatar}</div>
      </header>

      <div className="mx-auto flex w-full max-w-[1180px] flex-1 grid-cols-1 gap-6 px-4 py-6 md:grid md:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
        <main className="flex min-w-0 flex-col gap-6" data-testid="nocturne-main">
          {header}
          {main}
        </main>
        <aside className="flex min-w-0 flex-col gap-4" data-testid="nocturne-sidebar">
          {sidebar}
        </aside>
      </div>

      <div
        className="sticky bottom-0 z-30 mt-auto border-t border-[var(--color-divider)] bg-[var(--color-bg)]/95 px-4 py-3 backdrop-blur"
        data-testid="nocturne-bottombar"
      >
        {bottomBar}
      </div>
    </div>
  );
}

export default NocturneShell;
