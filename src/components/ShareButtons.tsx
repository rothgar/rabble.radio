'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';
import { LinkSimple, ShareNetwork } from '@phosphor-icons/react';

export interface ShareButtonsProps {
  shareableUrl: string;
  title: string;
}

export function ShareButtons({
  shareableUrl,
  title,
}: ShareButtonsProps): ReactElement {
  const [copied, setCopied] = useState(false);

  const bskyHref = `https://bsky.app/intent/compose?text=${encodeURIComponent(
    `Join my space on Rabble: ${title}\n${shareableUrl}`
  )}`;

  const onCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(shareableUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Best-effort: clipboard may not be available in all environments.
    }
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="share-buttons"
    >
      <a
        data-testid="share-bluesky-button"
        data-share-url={shareableUrl}
        data-share-title={title}
        href={bskyHref}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--color-accent-900)] transition-colors hover:bg-[var(--color-accent-400)]"
      >
        <ShareNetwork size={14} weight="bold" />
        Share
      </a>
      <button
        type="button"
        onClick={() => {
          void onCopy();
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-divider)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-accent-800)]"
        data-testid="share-copy-button"
        data-share-url={shareableUrl}
      >
        <LinkSimple size={14} weight="bold" />
        {copied ? 'Copied!' : 'Copy link'}
      </button>
    </div>
  );
}

export default ShareButtons;
