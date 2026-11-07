'use client';

import { Suspense, useState, useSyncExternalStore, type FormEvent } from 'react';
import type { ReactElement } from 'react';
import { useSearchParams } from 'next/navigation';
import { HandleInput } from '@/components/HandleInput';
import { recallHandle, rememberHandle } from '@/lib/bluesky-typeahead';

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
        <label htmlFor="handle" className="mb-1.5 block text-sm font-medium text-slate-300">
          Bluesky handle
        </label>
        <HandleInput id="handle" value={handle} onChange={setTyped} autoFocus disabled={loading} />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="min-h-[44px] rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        data-testid="login-submit"
      >
        {loading ? 'Redirecting…' : 'Sign in with Bluesky'}
      </button>
    </form>
  );
}

export default function LoginPage(): ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-sky-700 text-sky-200">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
              <path d="M5 5a10 10 0 0 0 0 14" />
              <path d="M19 5a10 10 0 0 1 0 14" />
              <path d="M8 8a6 6 0 0 0 0 8" />
              <path d="M16 8a6 6 0 0 1 0 8" />
            </svg>
          </span>
          <span className="text-lg font-semibold text-slate-100">Rabble Radio</span>
        </div>

        <h1 className="mb-1 text-xl font-semibold text-slate-100">Sign in</h1>
        <p className="mb-6 text-sm text-slate-400">Enter your Bluesky handle to continue.</p>

        <Suspense fallback={<div className="h-24" />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
