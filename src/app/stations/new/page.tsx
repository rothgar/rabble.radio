// src/app/shows/new/page.tsx
//
// Authenticated page that hosts the "Create a show" form.

import Link from 'next/link';
import type { ReactElement } from 'react';
import { CreateSpaceForm } from '@/components/CreateSpaceForm';
import { PageLayout } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default function NewShowPage(): ReactElement {
  return (
    <PageLayout className="max-w-xl">
      <header className="flex items-center gap-3">
        <Link
          href="/stations"
          className="inline-flex min-h-touch items-center self-start text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
        >
          &larr; Stations
        </Link>
      </header>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Create a show</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Give your show a title, (optionally) a description, and up to 3 tags
          so people can find it in Stations. You can start the audio room once
          the show is created.
        </p>
      </div>
      <CreateSpaceForm />
    </PageLayout>
  );
}
