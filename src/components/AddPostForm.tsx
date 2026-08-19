'use client';

// src/components/AddPostForm.tsx
//
// Host-only inline compose row in the sidebar. Text input + "Share to
// room" button.

import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';

export interface AddPostFormProps {
  spaceId: string;
  /** Called after a post is successfully stored. */
  onAdded?: () => void;
}

interface PostsApiResponse {
  post?: { id: string };
  error?: string;
  message?: string;
}

export function AddPostForm({
  spaceId,
  onAdded,
}: AddPostFormProps): ReactElement {
  const [postUrl, setPostUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (busy) return;
      const trimmed = postUrl.trim();
      if (!trimmed) {
        setError('Please paste a Bluesky post URL.');
        return;
      }
      setBusy(true);
      setError(null);
      setSuccess(null);
      try {
        const res = await fetch(`/api/spaces/${spaceId}/posts`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ postUrl: trimmed }),
        });
        const body = (await res
          .json()
          .catch(() => ({}))) as PostsApiResponse;
        if (!res.ok || !body.post) {
          setError(body.message || body.error || `HTTP ${res.status}`);
          return;
        }
        setSuccess('Post shared.');
        setPostUrl('');
        onAdded?.();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to share post.'
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, onAdded, postUrl, spaceId]
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2"
      data-testid="add-post-form"
    >
      <div className="flex flex-col gap-2">
        <input
          type="url"
          inputMode="url"
          required
          value={postUrl}
          onChange={(e) => setPostUrl(e.target.value)}
          placeholder="Paste a Bluesky post URL"
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-neutral-600)] focus:border-[var(--color-accent)] focus:outline-none"
          data-testid="add-post-input"
          aria-label="Bluesky post URL"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-900)] transition-colors hover:bg-[var(--color-accent-400)] disabled:opacity-50"
          data-testid="add-post-submit"
        >
          {busy ? 'Sharing…' : 'Share to room'}
        </button>
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-700 bg-red-900/30 px-2 py-1 text-xs text-red-200"
          data-testid="add-post-error"
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          role="status"
          className="rounded-md border border-emerald-700 bg-emerald-900/30 px-2 py-1 text-xs text-emerald-200"
          data-testid="add-post-success"
        >
          {success}
        </p>
      ) : null}
    </form>
  );
}

export default AddPostForm;
