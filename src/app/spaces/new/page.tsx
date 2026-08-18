// src/app/spaces/new/page.tsx
//
// Authenticated page that hosts the "Create a space" form.

import Link from 'next/link';
import type { ReactElement } from 'react';
import { CreateSpaceForm } from '@/components/CreateSpaceForm';

export const dynamic = 'force-dynamic';

export default function NewSpacePage(): ReactElement {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 p-6">
      <header className="flex items-center gap-3">
        <Link
          href="/spaces"
          className="text-sm text-slate-400 hover:text-slate-200"
        >
          &larr; Spaces
        </Link>
      </header>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Create a space</h1>
        <p className="text-sm text-slate-400">
          Give your space a title and (optionally) a description. You can start
          the audio room once the space is created.
        </p>
      </div>
      <CreateSpaceForm />
    </main>
  );
}
