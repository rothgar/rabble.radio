'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { ShareNetwork } from '@phosphor-icons/react';
import { buildBlueskyShareHref } from '@/lib/share';

export interface ShareEntryProps {
  shareableUrl: string;
  title: string;
  variant: 'bubble' | 'row';
}

/**
 * The "first listener" in the Listening section: an entry styled like the
 * other bubbles/rows, with a share icon instead of an avatar, that opens a
 * popover to copy the room link or share it on Bluesky.
 */
export function ShareEntry({
  shareableUrl,
  title,
  variant,
}: ShareEntryProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const onCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(shareableUrl);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
        setOpen(false);
      }, 1500);
    } catch {
      // Best-effort: clipboard may not be available in all environments.
    }
  };

  const bskyHref = buildBlueskyShareHref(shareableUrl, title);

  const menu = open ? (
    <div
      role="menu"
      className="absolute left-0 top-full z-20 mt-2 w-48 max-w-[calc(100vw-1rem)] rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] p-2 text-sm shadow-lg"
      data-testid="share-entry-menu"
    >
      <a
        href={bskyHref}
        target="_blank"
        rel="noreferrer noopener"
        role="menuitem"
        onClick={() => setOpen(false)}
        className="block rounded-md px-2 py-1.5 text-[var(--color-text)] hover:bg-[var(--color-ink-muted)]"
        data-testid="share-entry-bluesky"
      >
        Share on Bluesky
      </a>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          void onCopy();
        }}
        className="block w-full rounded-md px-2 py-1.5 text-left text-[var(--color-text)] hover:bg-[var(--color-ink-muted)]"
        data-testid="share-entry-copy"
      >
        {copied ? 'Copied!' : 'Copy link'}
      </button>
    </div>
  ) : null;

  if (variant === 'row') {
    return (
      <div className="relative" ref={containerRef} data-testid="share-entry-row">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex min-h-touch w-full items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] p-3 text-left transition-colors hover:bg-[var(--color-ink-muted)]"
          data-testid="share-entry-trigger"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-white">
            <ShareNetwork size={16} weight="bold" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-[var(--color-text)]">
              Share this show
            </span>
            <span className="truncate text-xs text-[var(--color-text-secondary)]">
              Copy link or share on Bluesky
            </span>
          </span>
        </button>
        {menu}
      </div>
    );
  }

  return (
    <div
      className="relative flex flex-col items-center gap-1 text-center"
      ref={containerRef}
      data-testid="share-entry-bubble"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Share this show"
        className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[var(--color-accent)] text-white ring-1 ring-[var(--color-border)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        data-testid="share-entry-trigger"
      >
        <ShareNetwork size={20} weight="bold" />
      </button>
      <span className="max-w-[60px] truncate text-[10px] text-[var(--color-text-tertiary)]">
        Share
      </span>
      {menu}
    </div>
  );
}

export default ShareEntry;
