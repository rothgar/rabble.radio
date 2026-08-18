'use client';

// src/components/DeleteSpaceButton.tsx
//
// Host-only destructive action that deletes the current space via
// DELETE /api/spaces/[id] and redirects to /spaces on success.

import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';

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
      className="rounded-lg border border-red-900 bg-red-950/40 p-4"
      data-testid="delete-space"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-red-100">
            Delete space
          </h3>
          <p className="text-xs text-red-200/80">
            Permanently removes this space and any recording.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void handleDelete();
          }}
          disabled={deleting}
          className="shrink-0 whitespace-nowrap rounded-md border border-red-700 bg-red-900/40 px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-900/60 disabled:opacity-50"
          data-testid="delete-space-button"
        >
          {deleting ? 'Deleting…' : 'Delete space'}
        </button>
      </div>
      {error ? (
        <p
          role="alert"
          className="mt-2 rounded-md border border-red-700 bg-red-900/30 px-2 py-1 text-xs text-red-200"
          data-testid="delete-space-error"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default DeleteSpaceButton;
