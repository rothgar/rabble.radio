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
      'Close this station for good? This cannot be undone and any recording will be removed.'
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
        window.location.href = '/stations';
        return;
      }
      const body = (await res
        .json()
        .catch(() => ({}))) as DeleteApiResponse;
      setError(body.message || body.error || `HTTP ${res.status}`);
      window.alert(
        `Failed to close the station: ${body.error ?? 'unknown'}`
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to close the station.';
      setError(message);
      window.alert(`Failed to close the station: ${message}`);
    } finally {
      setDeleting(false);
    }
  }, [deleting, spaceId]);

  return (
    <div
      className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-error)] bg-[var(--color-error-muted)] p-4"
      data-testid="delete-space"
    >
      <button
        type="button"
        onClick={() => {
          void handleDelete();
        }}
        disabled={deleting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-error)] bg-[var(--color-error-muted)] px-3 py-2 text-sm font-semibold text-[var(--color-error-text)] transition-colors hover:bg-[var(--color-accent-200)] disabled:opacity-50"
        data-testid="delete-space-button"
      >
        <StopCircle size={16} weight="fill" />
        {deleting ? 'Closing…' : 'Close station'}
      </button>
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-[var(--color-error)] bg-[var(--color-error-muted)] px-2 py-1 text-xs text-[var(--color-error-text)]"
          data-testid="delete-space-error"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default DeleteSpaceButton;
