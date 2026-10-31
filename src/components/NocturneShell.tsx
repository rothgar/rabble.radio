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
        className="sticky top-0 z-30 flex items-center justify-end border-b border-[var(--color-divider)] bg-[var(--color-bg)]/95 px-6 py-3 backdrop-blur"
        data-testid="nocturne-nav"
      >
        <div data-testid="nocturne-nav-avatar">{navAvatar}</div>
      </header>

      <div className="mx-auto flex w-full max-w-[1400px] flex-1 grid-cols-1 gap-6 px-4 py-6 md:grid md:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <main className="flex min-w-0 flex-col gap-6" data-testid="nocturne-main">
          {header}
          {main}
        </main>
        <aside className="flex min-w-0 flex-col gap-4" data-testid="nocturne-sidebar">
          {sidebar}
        </aside>
      </div>

      <footer
        className="sticky bottom-0 z-30 mt-auto border-t border-[var(--color-divider)] bg-[var(--color-bg)]/95 px-4 py-3 backdrop-blur"
        data-testid="nocturne-footer"
      >
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3">
          {bottomBar}
        </div>
      </footer>
    </div>
  );
}

export default NocturneShell;
