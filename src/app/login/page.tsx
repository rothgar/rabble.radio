'use client';

import { useState, type FormEvent } from 'react';
import type { ReactElement } from 'react';

export default function LoginPage(): ReactElement {
  const [handle, setHandle] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = handle.trim();
    if (!trimmed) return;
    setLoading(true);
    window.location.href = `/api/auth/bluesky?handle=${encodeURIComponent(trimmed)}`;
  };

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

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="handle" className="mb-1.5 block text-sm font-medium text-slate-300">
              Bluesky handle
            </label>
            <input
              id="handle"
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="alice.bsky.social"
              autoFocus
              required
              pattern="[a-zA-Z0-9._-]+"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {loading ? 'Redirecting…' : 'Sign in with Bluesky'}
          </button>
        </form>
      </div>
    </main>
  );
}
