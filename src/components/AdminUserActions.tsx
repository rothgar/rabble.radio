'use client';

import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui';

export interface AdminUserActionsProps {
  did: string;
  bannedAt: string | null;
}

interface ActionResponse {
  ok?: boolean;
  error?: string;
  message?: string;
}

type Action = 'ban' | 'unban' | 'kick';

export function AdminUserActions({ did, bannedAt }: AdminUserActionsProps): ReactElement {
  const [pending, setPending] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const banned = bannedAt !== null;

  const act = useCallback(
    async (action: Action) => {
      if (pending) return;
      if (action === 'ban' && !window.confirm('Ban this account from the platform?')) {
        return;
      }
      const reason = action === 'ban' ? (window.prompt('Reason (optional):') ?? undefined) : undefined;
      setPending(action);
      setError(null);
      try {
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ did, action, reason }),
        });
        if (res.ok) {
          window.location.reload();
          return;
        }
        const body = (await res.json().catch(() => ({}))) as ActionResponse;
        setError(body.message || body.error || `HTTP ${res.status}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed.');
      } finally {
        setPending(null);
      }
    },
    [did, pending]
  );

  return (
    <div className="flex flex-col gap-2" data-testid={`admin-user-actions-${did}`}>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void act('kick')}
          disabled={pending !== null}
          data-testid={`admin-kick-${did}`}
        >
          {pending === 'kick' ? 'Kicking…' : 'Kick'}
        </Button>
        {banned ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void act('unban')}
            disabled={pending !== null}
            data-testid={`admin-unban-${did}`}
          >
            {pending === 'unban' ? 'Unbanning…' : 'Unban'}
          </Button>
        ) : (
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => void act('ban')}
            disabled={pending !== null}
            data-testid={`admin-ban-${did}`}
          >
            {pending === 'ban' ? 'Banning…' : 'Ban'}
          </Button>
        )}
      </div>
      {error ? (
        <p
          role="alert"
          className="text-caption text-[var(--color-error-text)]"
          data-testid={`admin-user-error-${did}`}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default AdminUserActions;
