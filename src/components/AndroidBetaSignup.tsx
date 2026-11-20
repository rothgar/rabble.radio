'use client';

// src/components/AndroidBetaSignup.tsx
//
// Collects an email for the Google Play closed-testing beta. Posts a `beta`
// category report to /api/feedback, landing in the same admin queue
// (src/app/admin/feedback) as any other report. Nothing here enrolls or
// emails anyone automatically — the owner reviews requests there and adds
// approved emails to the Play Console tester list by hand.

import { useCallback, useState, type FormEvent, type ReactElement } from 'react';
import { Button } from '@/components/ui';

export function AndroidBetaSignup(): ReactElement {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (busy) return;
      const trimmed = email.trim();
      if (!trimmed) {
        setError('Enter an email address.');
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const res = await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            message: 'Requesting Android beta access.',
            category: 'beta',
            platform: 'android',
            email: trimmed,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
          setError(body.message || body.error || `Could not send (HTTP ${res.status}).`);
          return;
        }
        setSent(true);
        setEmail('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not send your request.');
      } finally {
        setBusy(false);
      }
    },
    [busy, email]
  );

  if (sent) {
    return (
      <p className="text-body text-[var(--color-text-secondary)]" data-testid="beta-signup-sent">
        Thanks — we&apos;ll add your email once your request is reviewed.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="beta-signup">
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={submit}
        data-testid="beta-signup-form"
      >
        <label
          htmlFor="beta-signup-email"
          className="flex flex-1 flex-col gap-1 text-caption text-[var(--color-text-secondary)]"
        >
          Email address
          <input
            id="beta-signup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
            className="min-h-touch w-full rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-3 text-body text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent)] focus:outline-none"
            data-testid="beta-signup-email"
          />
        </label>
        <Button type="submit" size="md" variant="secondary" disabled={busy} data-testid="beta-signup-send">
          {busy ? 'Sending…' : 'Request access'}
        </Button>
      </form>
      {error ? (
        <p role="alert" className="text-label text-[var(--color-error-text)]" data-testid="beta-signup-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default AndroidBetaSignup;
