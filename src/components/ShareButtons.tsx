'use client';

// src/components/ShareButtons.tsx
//
// Opens the Bluesky compose intent with a prefilled message linking to the
// current space. Mounted from the space detail page so the surrounding URL
// block can stay a server component.

import type { ReactElement } from 'react';

export interface ShareButtonsProps {
  shareableUrl: string;
  title: string;
}

export function ShareButtons({
  shareableUrl,
  title,
}: ShareButtonsProps): ReactElement {
  const bskyHref = `https://bsky.app/intent/compose?text=${encodeURIComponent(
    `Join my space on Rabble: ${title}\n${shareableUrl}`
  )}`;

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
        className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
      >
        Post to Bluesky
      </a>
    </div>
  );
}

export default ShareButtons;
