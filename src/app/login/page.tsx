'use client';

import { Suspense, useState, useSyncExternalStore, type FormEvent } from 'react';
import type { ReactElement } from 'react';
import { useSearchParams } from 'next/navigation';
import { HandleInput } from '@/components/HandleInput';
import { recallHandle, rememberHandle } from '@/lib/bluesky-typeahead';
import { Wordmark } from '@/components/ui';

const subscribeNever = (): (() => void) => () => {};

function LoginForm(): ReactElement {
  // Prefill from the last attempt on this browser; the server snapshot is
  // empty so hydration matches, then the client snapshot fills it in.
  const remembered = useSyncExternalStore(subscribeNever, () => recallHandle(), () => '');
  const [typed, setTyped] = useState<string | null>(null);
  const handle = typed ?? remembered;
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const next = searchParams.get('next');

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = handle.trim().replace(/^@/, '');
    if (!trimmed) return;
    setLoading(true);
    rememberHandle(trimmed);
    const url = new URL('/api/auth/bluesky', window.location.origin);
    url.searchParams.set('handle', trimmed);
    if (next) url.searchParams.set('next', next);
    window.location.href = url.toString();
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <label htmlFor="handle" className="mb-1.5 block text-sm font-medium text-[var(--color-text-secondary)]">
          Bluesky handle
        </label>
        <HandleInput id="handle" value={handle} onChange={setTyped} autoFocus disabled={loading} />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="min-h-[44px] rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        data-testid="login-submit"
      >
        {loading ? 'Redirecting…' : 'Sign in with Bluesky'}
      </button>
    </form>
  );
}

export default function LoginPage(): ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-[var(--shadow-md)]">
        <div className="mb-6 flex items-center gap-2">
          <Wordmark />
        </div>

        <h1 className="mb-1 text-xl font-semibold text-[var(--color-text)]">Sign in</h1>
        <p className="mb-6 text-sm text-[var(--color-text-secondary)]">Enter your Bluesky handle to continue.</p>

        <Suspense fallback={<div className="h-24" />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
