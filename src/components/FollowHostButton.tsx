'use client';

// src/components/FollowHostButton.tsx
//
// "Follow this host" for every show they go live on, not just the one the
// viewer happens to be looking at. Signed in it toggles a host follow
// through POST /api/hosts/[did]/follow; signed out it links to login. When
// a follow is turned on we also ask the browser for notification
// permission so the ReminderToasts poller (and the push the host's go-live
// triggers) can raise a system notification.

import type { ReactElement } from 'react';
import { BellSimple, BellSimpleRinging } from '@phosphor-icons/react';
import { FollowToggleButton } from '@/components/FollowToggleButton';

export interface FollowHostButtonProps {
  hostDid: string;
  hostName: string;
  isAuthenticated: boolean;
  following: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** Where to send a signed-out visitor back to after they log in. */
  loginNext?: string;
  onChange?: (following: boolean) => void;
}

export function FollowHostButton({
  hostDid,
  hostName,
  isAuthenticated,
  following,
  size = 'md',
  loginNext,
  onChange,
}: FollowHostButtonProps): ReactElement {
  return (
    <FollowToggleButton
      endpoint={`/api/hosts/${encodeURIComponent(hostDid)}/follow`}
      responseKey="following"
      isAuthenticated={isAuthenticated}
      active={following}
      signInHref={loginNext ? `/login?next=${encodeURIComponent(loginNext)}` : '/login'}
      size={size}
      onChange={onChange}
      icons={{ off: BellSimple, on: BellSimpleRinging }}
      testIdPrefix="follow-host"
      labels={{
        signIn: <>Sign in to follow {hostName}</>,
        on: `Following ${hostName}`,
        off: `Follow ${hostName}`,
        hintOn: `We'll tell you whenever ${hostName} goes on air, on any show. Tap again to stop.`,
        hintOff: `Get notified whenever ${hostName} goes on air, even with this site closed.`,
        errorFallback: 'Could not update the follow',
      }}
    />
  );
}

export default FollowHostButton;
