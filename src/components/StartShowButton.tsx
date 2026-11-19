'use client';

// src/components/StartShowButton.tsx
//
// The signed-in call to action. One tap creates a show (default title, no
// topics yet), mints the host token and drops the host straight into the
// room, off air. The join payload is handed to the show page through
// sessionStorage exactly like CreateSpaceForm's "Start now" so the page
// auto-joins without a second click.

import type { ReactElement } from 'react';
import { Button } from '@/components/ui';
import { useStartShow } from '@/components/useStartShow';

export interface StartShowButtonProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary' | 'ghost';
  fullWidth?: boolean;
  className?: string;
  label?: string;
  /** Reopen this show the viewer hosts for a new session instead of the default one. */
  spaceId?: string;
}

export function StartShowButton({
  size = 'md',
  variant = 'primary',
  fullWidth = false,
  className = '',
  label = 'Start a show',
  spaceId,
}: StartShowButtonProps): ReactElement {
  const { busy, error, start } = useStartShow();

  return (
    <div className={fullWidth ? 'flex w-full flex-col gap-2' : 'inline-flex flex-col gap-2'}>
      <Button
        type="button"
        size={size}
        variant={variant}
        fullWidth={fullWidth}
        className={className}
        disabled={busy}
        onClick={() => {
          void start(spaceId);
        }}
        data-testid="start-show-button"
      >
        {busy ? 'Starting…' : label}
      </Button>
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

export default StartShowButton;
