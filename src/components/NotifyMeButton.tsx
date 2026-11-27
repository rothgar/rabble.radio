'use client';

// src/components/NotifyMeButton.tsx
//
// "Notify me" for a scheduled show. Signed in it toggles a reminder through
// POST /api/spaces/[id]/remind; signed out it links to login. When a reminder
// is turned on we also ask the browser for notification permission so the
// ReminderToasts poller can raise a system notification when the show goes
// on air.

import type { ReactElement } from 'react';
import { Bell, BellRinging } from '@phosphor-icons/react';
import { FollowToggleButton } from '@/components/FollowToggleButton';

export interface NotifyMeButtonProps {
  spaceId: string;
  isAuthenticated: boolean;
  reminded: boolean;
  scheduledAt?: string | null;
  size?: 'sm' | 'md' | 'lg';
  onChange?: (reminded: boolean) => void;
}

export function NotifyMeButton({
  spaceId,
  isAuthenticated,
  reminded,
  scheduledAt = null,
  size = 'md',
  onChange,
}: NotifyMeButtonProps): ReactElement {
  return (
    <FollowToggleButton
      endpoint={`/api/spaces/${encodeURIComponent(spaceId)}/remind`}
      responseKey="reminded"
      isAuthenticated={isAuthenticated}
      active={reminded}
      signInHref={`/login?next=${encodeURIComponent(`/show/${spaceId}`)}`}
      size={size}
      onChange={onChange}
      icons={{ off: Bell, on: BellRinging }}
      testIdPrefix="notify-me"
      labels={{
        signIn: 'Sign in to get notified',
        on: "You'll be notified",
        off: 'Notify me',
        hintOn: `We'll tell you when this show goes on air${scheduledAt ? `, planned for ${new Date(scheduledAt).toLocaleString()}` : ''}. Tap again to cancel.`,
        hintOff: 'Get a notification when the host goes on air, even with this site closed.',
        errorFallback: 'Could not update the reminder',
      }}
    />
  );
}

export default NotifyMeButton;
