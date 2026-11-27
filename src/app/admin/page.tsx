// src/app/admin/page.tsx
//
// Platform overview and user moderation. Only the DIDs/handles in
// ADMIN_DIDS can see it; everyone else gets a 404 so the page's existence is
// not leaked.

import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';
import { getCurrentUser } from '@/lib/session';
import { getPlatformOverview, isAdmin, listUsersForAdmin, type AdminUserRow } from '@/lib/admin';
import { formatUtcDateTime } from '@/lib/format';
import { SiteHeader } from '@/components/SiteHeader';
import { AdminUserActions } from '@/components/AdminUserActions';
import { Card, PageLayout } from '@/components/ui';

export const dynamic = 'force-dynamic';

function slug(label: string): string {
  return label.toLowerCase().replace(/\s+/g, '-');
}

function OverviewStat({ label, value }: { label: string; value: string | number }): ReactElement {
  return (
    <Card className="flex flex-col gap-1" data-testid={`admin-stat-${slug(label)}`}>
      <span className="text-caption text-[var(--color-text-secondary)]">{label}</span>
      <span className="text-heading font-display font-bold">{value}</span>
    </Card>
  );
}

function UserRow({ row }: { row: AdminUserRow }): ReactElement {
  return (
    <Card
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid={`admin-user-${row.did}`}
    >
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-[var(--color-text)]">
            {row.handle ? `@${row.handle}` : row.did}
          </span>
          {row.bannedAt ? (
            <span className="rounded-full bg-[var(--color-error-muted)] px-2 py-0.5 text-caption font-semibold text-[var(--color-error-text)]">
              banned
            </span>
          ) : null}
        </div>
        <span className="break-all text-caption text-[var(--color-text-tertiary)]">{row.did}</span>
        <span className="text-caption text-[var(--color-text-secondary)]">joined {formatUtcDateTime(row.createdAt)}</span>
        {row.bannedAt && row.banReason ? (
          <span className="text-caption text-[var(--color-text-secondary)]">reason: {row.banReason}</span>
        ) : null}
      </div>
      <AdminUserActions did={row.did} bannedAt={row.bannedAt ? row.bannedAt.toISOString() : null} />
    </Card>
  );
}

export default async function AdminPage(): Promise<ReactElement> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) notFound();
  const [overview, users] = await Promise.all([getPlatformOverview(), listUsersForAdmin(100)]);

  return (
    <>
      <SiteHeader />
      <PageLayout>
        <header>
          <h1 className="text-display font-bold tracking-tight">Admin dashboard</h1>
          <p className="mt-1 text-label text-[var(--color-text-secondary)]">
            Running build {overview.buildId ?? 'unknown'}.
          </p>
        </header>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="admin-overview">
          <OverviewStat label="Users" value={overview.totalUsers} />
          <OverviewStat label="Banned" value={overview.bannedUsers} />
          <OverviewStat label="Shows" value={overview.totalShows} />
          <OverviewStat label="Live now" value={overview.liveNow} />
          <OverviewStat label="Live shows run" value={overview.totalSessions} />
        </div>
        <section className="flex flex-col gap-3">
          <h2 className="text-title font-display font-bold">Users</h2>
          {users.length === 0 ? (
            <p className="text-body text-[var(--color-text-secondary)]" data-testid="admin-users-empty">
              No users yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-3" data-testid="admin-users-list">
              {users.map((row) => (
                <li key={row.did}>
                  <UserRow row={row} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </PageLayout>
    </>
  );
}
