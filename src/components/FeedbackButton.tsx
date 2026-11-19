'use client';

// src/components/FeedbackButton.tsx
//
// "Report a problem" entry point. Opens a small dialog with a message box
// and a category; on send it posts the message to /api/feedback together
// with the captured diagnostics (page, browser, viewport, network, the
// current room state and recent errors). Works signed in or out.

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { ChatCircleDots, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui';
import { collectDiagnostics } from '@/lib/diagnostics';

export interface FeedbackButtonProps {
  /** `icon` renders a compact round button (used inside the room). */
  variant?: 'text' | 'icon';
  /** Attached to the report so it can be tied to a show. */
  spaceId?: string | null;
  className?: string;
}

const CATEGORIES: Array<{ value: 'problem' | 'idea' | 'other'; label: string }> = [
  { value: 'problem', label: 'Something is broken' },
  { value: 'idea', label: 'Suggestion' },
  { value: 'other', label: 'Other' },
];

export function FeedbackButton({
  variant = 'text',
  spaceId = null,
  className = '',
}: FeedbackButtonProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<'problem' | 'idea' | 'other'>('problem');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    textareaRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
    if (sent) {
      setSent(false);
      setMessage('');
      setCategory('problem');
    }
  }, [sent]);

  const send = useCallback(async () => {
    if (busy) return;
    const trimmed = message.trim();
    if (!trimmed) {
      setError('Tell us what happened first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const diagnostics = collectDiagnostics();
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          category,
          platform: 'web',
          appVersion: diagnostics.build,
          page: diagnostics.page,
          spaceId: spaceId ?? diagnostics.room?.spaceId ?? null,
          context: diagnostics,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        setError(body.message || body.error || `Could not send (HTTP ${res.status}).`);
        return;
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your report.');
    } finally {
      setBusy(false);
    }
  }, [busy, category, message, spaceId]);

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Report a problem"
          title="Report a problem"
          className={
            'inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] transition hover:text-[var(--color-text)] ' +
            className
          }
          data-testid="feedback-button"
        >
          <ChatCircleDots size={20} weight="bold" aria-hidden />
        </button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={className}
          onClick={() => setOpen(true)}
          data-testid="feedback-button"
        >
          Feedback
        </Button>
      )}

      {open
        ? createPortal(
            // Portaled to document.body: SiteHeader has backdrop-blur, which
            // creates a containing block that would resolve this dialog's
            // `fixed inset-0` against the header's rect instead of the viewport.
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--color-scrim)] p-4 sm:items-center"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) close();
              }}
              data-testid="feedback-dialog-backdrop"
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="feedback-title"
                className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-5 shadow-xl"
                data-testid="feedback-dialog"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2
                      id="feedback-title"
                      className="text-title font-semibold text-[var(--color-text)]"
                    >
                      {sent ? 'Thanks, got it' : 'Report a problem'}
                    </h2>
                    {!sent ? (
                      <p className="mt-1 text-caption text-[var(--color-text-secondary)]">
                        What went wrong? We attach your page, browser, connection and room state so
                        we can reproduce it. No audio is recorded.
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Close"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                    data-testid="feedback-close"
                  >
                    <X size={18} aria-hidden />
                  </button>
                </div>

                {sent ? (
                  <p
                    className="text-body text-[var(--color-text-secondary)]"
                    data-testid="feedback-sent"
                  >
                    Your report was saved with the details we captured. Thanks for helping make
                    Rabble better.
                  </p>
                ) : (
                  <>
                    <label className="flex flex-col gap-1 text-caption text-[var(--color-text-secondary)]">
                      Category
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value as 'problem' | 'idea' | 'other')}
                        className="h-11 rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-3 text-body text-[var(--color-text)]"
                        data-testid="feedback-category"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-caption text-[var(--color-text-secondary)]">
                      Details
                      <textarea
                        ref={textareaRef}
                        value={message}
                        onChange={(e) => setMessage(e.target.value.slice(0, 4000))}
                        rows={5}
                        placeholder="What did you expect, and what happened instead?"
                        className="rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-3 py-2 text-body text-[var(--color-text)]"
                        data-testid="feedback-message"
                      />
                    </label>
                    {error ? (
                      <p
                        role="alert"
                        className="rounded-sm border border-[var(--color-live-border)] bg-[var(--color-live-muted)] px-3 py-2 text-label text-[var(--color-live)]"
                        data-testid="feedback-error"
                      >
                        {error}
                      </p>
                    ) : null}
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" size="md" onClick={close}>
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="md"
                        disabled={busy}
                        onClick={() => {
                          void send();
                        }}
                        data-testid="feedback-send"
                      >
                        {busy ? 'Sending…' : 'Send report'}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

export default FeedbackButton;
