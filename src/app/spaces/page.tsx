// src/app/spaces/page.tsx
//
// Authenticated landing page for Bluesky Spaces: lists spaces and exposes a
// link to create a new one. Server component; data is loaded directly via the
// Prisma client.

import Link from 'next/link';
import type { ReactElement } from 'react';
import { getSpacesForUser, toPublicSpace, tryExpireStaleSpaces } from '@/lib/spaces';
import { getCurrentUser } from '@/lib/session';
import { SpaceCard } from '@/components/SpaceCard';

export const dynamic = 'force-dynamic';

export default async function SpacesPage(): Promise<ReactElement> {
  const user = await getCurrentUser();
  // Best-effort cleanup of empty rooms before listing.
  await tryExpireStaleSpaces();
  const spaces = await getSpacesForUser(user?.did ?? null);
  const publicSpaces = spaces.map((s) => toPublicSpace(s));

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Spaces</h1>
          {user ? (
            <p className="text-sm text-slate-400">
              Signed in as <span className="text-slate-200">@{user.handle}</span>
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {user ? (
            <Link
              href="/logout"
              className="rounded-md border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
              data-testid="logout-link"
            >
              Log out
            </Link>
          ) : null}
          <Link
            href="/spaces/new"
            className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500"
            data-testid="create-space-link"
          >
            New space
          </Link>
        </div>
      </header>

      {publicSpaces.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-700 p-12 text-center">
          <p className="text-lg text-slate-300">No spaces yet.</p>
          <p className="max-w-md text-sm text-slate-500">
            Be the first to spin one up. Spaces are audio rooms you host;
            anyone with the link can listen.
          </p>
          <Link
            href="/spaces/new"
            className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500"
          >
            Create a space
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {publicSpaces.map((space) => (
            <SpaceCard key={space.id} space={space} />
          ))}
        </div>
      )}
    </main>
  );
}
