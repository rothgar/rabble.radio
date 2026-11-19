'use client';

// src/components/StartShowMenu.tsx
//
// The "Start a show" entry points (home page, header, /stations) for a host
// with more than one named show: the main button still starts the default
// show in one tap, and a chevron opens a picker over the host's recent
// shows (most-recently-live first, from GET /api/me/shows) so they can
// reopen one of those instead, topics included. A host with zero or one
// hosted show sees the plain StartShowButton, unchanged.

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Button } from '@/components/ui';
import { StartShowButton, type StartShowButtonProps } from '@/components/StartShowButton';
import { useStartShow } from '@/components/useStartShow';
import type { PublicSpace } from '@/types';

export type StartShowMenuProps = Pick<
  StartShowButtonProps,
  'size' | 'variant' | 'fullWidth' | 'className' | 'label'
>;

/** How many recent shows the picker lists. */
const MAX_RECENT = 8;

export function StartShowMenu({
  size = 'md',
  variant = 'primary',
  fullWidth = false,
  className = '',
  label = 'Start a show',
}: StartShowMenuProps): ReactElement {
  const [hosted, setHosted] = useState<PublicSpace[] | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { busy, error, start } = useStartShow();

  useEffect(() => {
    let cancelled = false;
    fetch('/api/me/shows', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { hosted?: PublicSpace[] } | null) => {
        if (!cancelled) setHosted(data?.hosted ?? []);
      })
      .catch(() => {
        if (!cancelled) setHosted([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  if (!hosted || hosted.length <= 1) {
    return (
      <StartShowButton size={size} variant={variant} fullWidth={fullWidth} className={className} label={label} />
    );
  }

  const recent = hosted.slice(0, MAX_RECENT);

  return (
    <div className={fullWidth ? 'flex w-full flex-col gap-2' : 'inline-flex flex-col gap-2'}>
      <div className="relative" ref={menuRef}>
        <div className={fullWidth ? 'flex w-full' : 'inline-flex'}>
          <Button
            type="button"
            size={size}
            variant={variant}
            fullWidth={fullWidth}
            className={`${className} rounded-r-none`}
            disabled={busy}
            onClick={() => {
              void start();
            }}
            data-testid="start-show-button"
          >
            {busy ? 'Starting…' : label}
          </Button>
          <Button
            type="button"
            size={size}
            variant={variant}
            className="-ml-px min-w-touch rounded-l-none px-2"
            disabled={busy}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="Pick a recent show to start"
            onClick={() => setOpen((v) => !v)}
            data-testid="start-show-menu-trigger"
          >
            <span aria-hidden="true">▾</span>
          </Button>
        </div>
        {open ? (
          <div
            role="menu"
            className="absolute right-0 top-full z-20 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-lg"
            data-testid="start-show-menu-panel"
          >
            <p className="px-2 py-1 text-caption font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
              Your recent shows
            </p>
            {recent.map((space) => (
              <button
                key={space.id}
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  void start(space.id);
                }}
                className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-[var(--color-ink-muted)] disabled:opacity-40"
                data-testid={`start-show-menu-option-${space.id}`}
              >
                <span className="flex w-full items-center gap-1.5">
                  <span className="truncate text-label text-[var(--color-text)]">{space.title}</span>
                  {space.isLive ? (
                    <span className="shrink-0 rounded-full bg-[var(--color-live-muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-live)]">
                      On air
                    </span>
                  ) : null}
                </span>
                {space.tags.length > 0 ? (
                  <span className="truncate text-caption text-[var(--color-text-tertiary)]">
                    {space.tags.join(' · ')}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-sm border border-[var(--color-live-border)] bg-[var(--color-live-muted)] px-3 py-2 text-label text-[var(--color-live)]"
          data-testid="start-show-error"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default StartShowMenu;
