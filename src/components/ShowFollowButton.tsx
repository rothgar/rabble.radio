'use client';

// src/components/ShowFollowButton.tsx
//
// "Follow this show" — notified only when this exact named show goes live
// as its host, not the host's other shows or guest appearances elsewhere.
// Signed in it toggles a show follow through POST /api/spaces/[id]/follow;
// signed out it links to login. When a follow is turned on we also ask the
// browser for notification permission so the ReminderToasts poller (and
// the push the host's go-live triggers) can raise a system notification.

import type { ReactElement } from 'react';
import { BellSimple, BellSimpleRinging } from '@phosphor-icons/react';
import { FollowToggleButton } from '@/components/FollowToggleButton';

export interface ShowFollowButtonProps {
  spaceId: string;
  showTitle: string;
  isAuthenticated: boolean;
  following: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** Where to send a signed-out visitor back to after they log in. */
  loginNext?: string;
  onChange?: (following: boolean) => void;
}

export function ShowFollowButton({
  spaceId,
  showTitle,
  isAuthenticated,
  following,
  size = 'md',
  loginNext,
  onChange,
}: ShowFollowButtonProps): ReactElement {
  return (
    <FollowToggleButton
      endpoint={`/api/spaces/${encodeURIComponent(spaceId)}/follow`}
      responseKey="following"
      isAuthenticated={isAuthenticated}
      active={following}
      signInHref={loginNext ? `/login?next=${encodeURIComponent(loginNext)}` : '/login'}
      size={size}
      onChange={onChange}
      icons={{ off: BellSimple, on: BellSimpleRinging }}
      testIdPrefix="follow-show"
      labels={{
        signIn: <>Sign in to follow {showTitle}</>,
        on: `Following ${showTitle}`,
        off: `Follow ${showTitle}`,
        hintOn: `We'll tell you whenever ${showTitle} goes on air. Tap again to stop.`,
        hintOff: `Get notified whenever ${showTitle} goes on air, even with this site closed.`,
        errorFallback: 'Could not update the follow',
      }}
    />
  );
}

export default ShowFollowButton;
