// src/app/admin/feedback/page.tsx
//
// Reports sent from the feedback button, newest first, with the captured
// state and environment. Only the DIDs/handles in FEEDBACK_ADMIN_DIDS can
// see it; everyone else gets a 404 so the page's existence is not leaked.

import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';
import { getCurrentUser } from '@/lib/session';
import { isFeedbackAdmin, listFeedback, type FeedbackRow } from '@/lib/feedback';
import { SiteHeader } from '@/components/SiteHeader';
import { Card, PageLayout } from '@/components/ui';

export const dynamic = 'force-dynamic';

function formatWhen(d: Date): string {
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function FeedbackEntry({ row }: { row: FeedbackRow }): ReactElement {
  const context = JSON.stringify(row.context, null, 2);
  return (
    <Card className="flex flex-col gap-3" data-testid={`feedback-${row.id}`}>
      <div className="flex flex-wrap items-center gap-2 text-caption text-[var(--color-text-secondary)]">
        <span className="rounded-full bg-[var(--color-surface-raised)] px-2 py-0.5 font-semibold uppercase">
          {row.category}
        </span>
        <span className="rounded-full bg-[var(--color-surface-raised)] px-2 py-0.5">{row.platform}</span>
        {row.appVersion ? <span>v{row.appVersion}</span> : null}
        <span>{formatWhen(row.createdAt)}</span>
        <span>{row.handle ? `@${row.handle}` : 'signed out'}</span>
        {row.page ? <span className="truncate">{row.page}</span> : null}
      </div>
      <p className="whitespace-pre-wrap text-body text-[var(--color-text)]" data-testid="feedback-message">
        {row.message}
      </p>
      {row.userAgent ? (
        <p className="break-all text-caption text-[var(--color-text-tertiary)]">{row.userAgent}</p>
      ) : null}
      <details className="text-caption">
        <summary className="cursor-pointer text-[var(--color-text-secondary)]">Captured state</summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded-sm bg-[var(--color-surface-raised)] p-3 text-[var(--color-text)]">
          {context}
        </pre>
      </details>
    </Card>
  );
}

export default async function AdminFeedbackPage(): Promise<ReactElement> {
  const user = await getCurrentUser();
  if (!isFeedbackAdmin(user)) notFound();
  const rows = await listFeedback(200);
  return (
    <>
      <SiteHeader />
      <PageLayout>
        <header>
          <h1 className="text-display font-bold tracking-tight">Feedback</h1>
          <p className="mt-1 text-label text-[var(--color-text-secondary)]">
            Problem reports from the web and mobile apps, newest first.
          </p>
        </header>
        {rows.length === 0 ? (
          <p className="text-body text-[var(--color-text-secondary)]" data-testid="feedback-empty">
            No reports yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-4" data-testid="feedback-list">
            {rows.map((row) => (
              <li key={row.id}>
                <FeedbackEntry row={row} />
              </li>
            ))}
          </ul>
        )}
      </PageLayout>
    </>
  );
}
