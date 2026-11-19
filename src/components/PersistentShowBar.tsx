'use client';

// src/components/PersistentShowBar.tsx
//
// Sticky footer shown on every route except the joined show's own page
// (SpaceRoom already has full controls there) while ActiveRoomProvider
// holds a live connection. Lets a host who clicked away from /show/[id]
// get back to the studio, or leave the show, without losing the
// connection in between.

import type { ReactElement } from 'react';
import { useActiveRoom } from '@/components/ActiveRoomProvider';
import { Button } from '@/components/ui';

export function PersistentShowBar(): ReactElement | null {
  const { session, barVisible, leave } = useActiveRoom();

  // `barVisible` already accounts for there being a session, the connect
  // attempt having succeeded, and not being on the show's own page.
  if (!session || !barVisible) return null;
  const showHref = `/show/${encodeURIComponent(session.spaceId)}`;

  const hostLabel = session.host.displayName ?? `@${session.host.handle}`;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-bg-translucent)] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:px-6"
      data-testid="persistent-show-bar"
      role="region"
      aria-label="Active show"
    >
      <div className="mx-auto flex max-w-content items-center gap-3">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
            session.isLive
              ? 'bg-[var(--color-live)]'
              : 'bg-[var(--color-text-tertiary)]'
          }`}
          aria-hidden
          data-testid="persistent-show-bar-status"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold text-[var(--color-text)]">
            {session.title}
          </p>
          <p className="truncate text-caption text-[var(--color-text-secondary)]">
            {session.isLive ? 'On air' : 'Off air'} &middot; {hostLabel}
          </p>
        </div>
        <Button
          href={showHref}
          variant="primary"
          size="sm"
          data-testid="persistent-show-bar-return"
        >
          {session.isHost ? 'Back to studio' : 'Return to show'}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={leave}
          data-testid="persistent-show-bar-leave"
        >
          Leave
        </Button>
      </div>
    </div>
  );
}

export default PersistentShowBar;
