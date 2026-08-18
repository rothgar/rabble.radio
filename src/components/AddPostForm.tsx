'use client';

// src/components/AddPostForm.tsx
//
// Host-only form to share a Bluesky post into the space. Submits the URL to
// /api/spaces/[id]/posts and reports success/error.

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
      className="rounded-lg border border-slate-800 bg-slate-900 p-4"
      data-testid="add-post-form"
    >
      <h3 className="mb-2 text-sm font-semibold text-slate-100">
        Share a Bluesky post
      </h3>
      <p className="mb-3 text-xs text-slate-400">
        Paste a bsky.app or atproto.com post URL. Listeners will see it in the
        carousel below.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          inputMode="url"
          required
          value={postUrl}
          onChange={(e) => setPostUrl(e.target.value)}
          placeholder="https://bsky.app/profile/handle/post/3l...rkey"
          className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
          data-testid="add-post-input"
          aria-label="Bluesky post URL"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          data-testid="add-post-submit"
        >
          {busy ? 'Sharing…' : 'Share'}
        </button>
      </div>
      {error ? (
        <p
          role="alert"
          className="mt-2 rounded-md border border-red-700 bg-red-900/30 px-2 py-1 text-xs text-red-200"
          data-testid="add-post-error"
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          role="status"
          className="mt-2 rounded-md border border-emerald-700 bg-emerald-900/30 px-2 py-1 text-xs text-emerald-200"
          data-testid="add-post-success"
        >
          {success}
        </p>
      ) : null}
    </form>
  );
}

export default AddPostForm;
