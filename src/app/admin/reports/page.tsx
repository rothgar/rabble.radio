// src/app/admin/reports/page.tsx
//
// Reports filed by hosts against speakers, newest first. Only the
// DIDs/handles in REPORT_ADMIN_DIDS can see it; everyone else gets a 404 so
// the page's existence is not leaked.

import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';
import { getCurrentUser } from '@/lib/session';
import { isReportAdmin, listReports, type ReportRow } from '@/lib/reports';
import { SiteHeader } from '@/components/SiteHeader';
import { Card, PageLayout } from '@/components/ui';

export const dynamic = 'force-dynamic';

function formatWhen(d: Date): string {
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function ReportEntry({ row }: { row: ReportRow }): ReactElement {
  return (
    <Card className="flex flex-col gap-3" data-testid={`report-${row.id}`}>
      <div className="flex flex-wrap items-center gap-2 text-caption text-[var(--color-text-secondary)]">
        <span>{formatWhen(row.createdAt)}</span>
        <span>space {row.spaceId}</span>
      </div>
      <div className="text-caption text-[var(--color-text-secondary)]">
        Reported:{' '}
        <span className="font-medium text-[var(--color-text)]">
          {row.reportedHandle ? `@${row.reportedHandle}` : row.reportedDid}
        </span>
      </div>
      <div className="text-caption text-[var(--color-text-secondary)]">
        Reported by:{' '}
        <span className="font-medium text-[var(--color-text)]">
          {row.reporterHandle ? `@${row.reporterHandle}` : row.reporterDid}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-body text-[var(--color-text)]" data-testid="report-reason">
        {row.reason}
      </p>
    </Card>
  );
}

export default async function AdminReportsPage(): Promise<ReactElement> {
  const user = await getCurrentUser();
  if (!isReportAdmin(user)) notFound();
  const rows = await listReports(200);
  return (
    <>
      <SiteHeader />
      <PageLayout>
        <header>
          <h1 className="text-display font-bold tracking-tight">Reports</h1>
          <p className="mt-1 text-label text-[var(--color-text-secondary)]">
            Reports hosts filed against speakers, newest first.
          </p>
        </header>
        {rows.length === 0 ? (
          <p className="text-body text-[var(--color-text-secondary)]" data-testid="report-empty">
            No reports yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-4" data-testid="report-list">
            {rows.map((row) => (
              <li key={row.id}>
                <ReportEntry row={row} />
              </li>
            ))}
          </ul>
        )}
      </PageLayout>
    </>
  );
}
