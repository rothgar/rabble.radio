'use client';

// src/components/ShowDetailsForm.tsx
//
// Host-only card inside the live room for naming the show and picking its
// station topics after an instant "Start a show". PATCHes
// /api/spaces/[id] and reports the saved values back to the room so the
// header updates in place.

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react';
import { MAX_TAGS_PER_SHOW, YOUTUBE_CATEGORIES } from '@/lib/tags';
import type { PublicSpace } from '@/types';

export interface ShowDetails {
  title: string;
  description: string | null;
  tags: string[];
  /** Pre-show music mood id; undefined when a message did not carry it. */
  musicMood?: string | null;
  /** On stage vs. removed to the audience while live; undefined when a message did not carry it. */
  musicOnStage?: boolean;
}

export interface ShowDetailsFormProps {
  spaceId: string;
  title: string;
  description?: string | null;
  tags?: string[];
  onSaved?: (details: ShowDetails) => void;
}

const INPUT_CLASSES =
  'w-full rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-3 py-2 text-body text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent)] focus:outline-none';

export function ShowDetailsForm({
  spaceId,
  title: initialTitle,
  description: initialDescription,
  tags: initialTags,
  onSaved,
}: ShowDetailsFormProps): ReactElement {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription ?? '');
  const [tags, setTags] = useState<string[]>(initialTags ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Clear the "Saved" note a few seconds after a successful save.
  useEffect(() => {
    if (savedAt === null) return;
    const t = setTimeout(() => setSavedAt(null), 3000);
    return () => clearTimeout(t);
  }, [savedAt]);

  const toggleTag = useCallback((tag: string) => {
    setTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      if (prev.length >= MAX_TAGS_PER_SHOW) return prev;
      return [...prev, tag];
    });
  }, []);

  const dirty =
    title.trim() !== initialTitle ||
    description.trim() !== (initialDescription ?? '') ||
    tags.join('|') !== (initialTags ?? []).join('|');

  // The host-only form unmounts the moment the show goes live (issue #53).
  // Flush an unsaved edit on unmount instead of discarding it silently; this
  // effect only ever reads refs, so it has nothing to do until unmount.
  //
  // RoomSidebar keys this component on title|description|tags, so a
  // *successful* save also unmounts this instance (in favour of a fresh one
  // keyed on the new values) — without justSavedRef, that remount would
  // read `dirty` as still true (initialTitle etc. are this instance's own,
  // frozen-at-mount props) and flush the same save a second time.
  const justSavedRef = useRef(false);
  const unmountFlushRef = useRef({ spaceId, title, description, tags, dirty, onSaved });
  useEffect(() => {
    unmountFlushRef.current = { spaceId, title, description, tags, dirty, onSaved };
  });
  useEffect(() => {
    return () => {
      if (justSavedRef.current) return;
      const { spaceId, title, description, tags, dirty, onSaved } = unmountFlushRef.current;
      const trimmedTitle = title.trim();
      if (!dirty || !trimmedTitle) return;
      void fetch(`/api/spaces/${encodeURIComponent(spaceId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: trimmedTitle, description: description.trim() || null, tags }),
        keepalive: true,
      })
        .then((res) => res.json())
        .then((body: { space?: PublicSpace }) => {
          if (body.space) {
            onSaved?.({
              title: body.space.title,
              description: body.space.description,
              tags: body.space.tags,
            });
          }
        })
        .catch(() => {});
    };
  }, []);

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (saving) return;
      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        setError('Give your show a title.');
        return;
      }
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`/api/spaces/${encodeURIComponent(spaceId)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: trimmedTitle,
            description: description.trim() || null,
            tags,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          space?: PublicSpace;
          error?: string;
          message?: string;
        };
        if (!res.ok || !body.space) {
          setError(body.message || body.error || `Save failed (HTTP ${res.status}).`);
          return;
        }
        justSavedRef.current = true;
        setSavedAt(Date.now());
        onSaved?.({
          title: body.space.title,
          description: body.space.description,
          tags: body.space.tags,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed.');
      } finally {
        setSaving(false);
      }
    },
    [description, onSaved, saving, spaceId, tags, title]
  );

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
      data-testid="show-details-form"
    >
      <h3 className="text-sm font-semibold text-[var(--color-text)]">Show details</h3>
      <div className="flex flex-col gap-1">
        <label htmlFor="show-title" className="text-label text-[var(--color-text-secondary)]">
          Title
        </label>
        <input
          id="show-title"
          type="text"
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What are you talking about today?"
          className={INPUT_CLASSES}
          data-testid="show-title-input"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="show-description" className="text-label text-[var(--color-text-secondary)]">
          Description <span className="text-[var(--color-text-tertiary)]">(optional)</span>
        </label>
        <textarea
          id="show-description"
          rows={2}
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={INPUT_CLASSES}
          data-testid="show-description-input"
        />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-label text-[var(--color-text-secondary)]">
          Station topics{' '}
          <span className="text-[var(--color-text-tertiary)]">(up to {MAX_TAGS_PER_SHOW})</span>
        </span>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Station topics" data-testid="show-tag-picker">
          {YOUTUBE_CATEGORIES.map((tag) => {
            const selected = tags.includes(tag);
            const disabled = !selected && tags.length >= MAX_TAGS_PER_SHOW;
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => toggleTag(tag)}
                className={
                  'inline-flex min-h-[36px] items-center rounded-full border px-3 text-label font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ' +
                  (selected
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
                    : 'border-[var(--color-border-strong)] bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)] disabled:opacity-40')
                }
                data-testid={`show-tag-${tag}`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-sm border border-[var(--color-live-border)] bg-[var(--color-live-muted)] px-3 py-2 text-label text-[var(--color-live)]"
          data-testid="show-details-error"
        >
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <span className="text-label text-[var(--color-success)]" data-testid="show-details-saved" aria-live="polite">
          {savedAt !== null ? 'Saved' : ''}
        </span>
        <button
          type="submit"
          disabled={saving || !dirty}
          className="inline-flex min-h-touch items-center justify-center rounded-sm bg-[var(--color-accent)] px-4 text-label font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:pointer-events-none disabled:opacity-40"
          data-testid="show-details-save"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

export default ShowDetailsForm;
