'use client';

import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';
import { StopCircle } from '@phosphor-icons/react';

export interface DeleteSpaceButtonProps {
  spaceId: string;
}

interface DeleteApiResponse {
  ok?: boolean;
  error?: string;
  message?: string;
}

export function DeleteSpaceButton({
  spaceId,
}: DeleteSpaceButtonProps): ReactElement {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = useCallback(async () => {
    if (deleting) return;
    const confirmed = window.confirm(
      'Delete this space permanently? This cannot be undone and any recording will be removed.'
    );
    if (!confirmed) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/spaces/${spaceId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        window.location.href = '/spaces';
        return;
      }
      const body = (await res
        .json()
        .catch(() => ({}))) as DeleteApiResponse;
      setError(body.message || body.error || `HTTP ${res.status}`);
      window.alert(
        `Failed to delete space: ${body.error ?? 'unknown'}`
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to delete space.';
      setError(message);
      window.alert(`Failed to delete space: ${message}`);
    } finally {
      setDeleting(false);
    }
  }, [deleting, spaceId]);

  return (
    <div
      className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-red-900/60 bg-red-950/30 p-4"
      data-testid="delete-space"
    >
      <button
        type="button"
        onClick={() => {
          void handleDelete();
        }}
        disabled={deleting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-red-700 bg-red-900/40 px-3 py-2 text-sm font-semibold text-red-100 transition-colors hover:bg-red-900/60 disabled:opacity-50"
        data-testid="delete-space-button"
      >
        <StopCircle size={16} weight="fill" />
        {deleting ? 'Ending…' : 'End space'}
      </button>
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-700 bg-red-900/30 px-2 py-1 text-xs text-red-200"
          data-testid="delete-space-error"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default DeleteSpaceButton;
