'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import Link from 'next/link';

export interface UserMenuProps {
  handle: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export function UserMenu({
  handle,
  displayName,
  avatarUrl,
}: UserMenuProps): ReactElement {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const label = displayName?.trim() || handle;

  return (
    <div className="relative" ref={menuRef} data-testid="user-menu">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[var(--color-accent)] text-sm font-semibold text-white ring-1 ring-[var(--color-border)] transition hover:ring-[var(--color-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        data-testid="user-menu-trigger"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span>{label.slice(0, 2).toUpperCase()}</span>
        )}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 w-48 max-w-[calc(100vw-1rem)] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 text-sm shadow-lg"
          data-testid="user-menu-panel"
        >
          <div className="px-2 py-1.5">
            <p className="truncate text-xs font-semibold text-[var(--color-text)]">
              {label}
            </p>
            <p className="truncate text-xs text-[var(--color-text-secondary)]">@{handle}</p>
          </div>
          <Link
            href="/me"
            role="menuitem"
            className="block w-full rounded-md px-2 py-1.5 text-left text-[var(--color-text)] hover:bg-[var(--color-ink-muted)]"
            data-testid="user-menu-shows"
          >
            My shows
          </Link>
          <Link
            href="/downloads"
            role="menuitem"
            className="block w-full rounded-md px-2 py-1.5 text-left text-[var(--color-text)] hover:bg-[var(--color-ink-muted)]"
            data-testid="user-menu-apps"
          >
            Get the app
          </Link>
          <Link
            href="/logout"
            prefetch={false}
            role="menuitem"
            className="block w-full rounded-md px-2 py-1.5 text-left text-[var(--color-error-text)] hover:bg-[var(--color-ink-muted)]"
            data-testid="user-menu-logout"
          >
            Log out
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export default UserMenu;
