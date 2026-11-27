// src/app/admin/page.tsx
//
// Platform overview and user moderation. Only the DIDs/handles in
// ADMIN_DIDS can see it; everyone else gets a 404 so the page's existence is
// not leaked.

import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';
import { getCurrentUser } from '@/lib/session';
import {
  getPlatformActivity,
  getPlatformOverview,
  isAdmin,
  listUsersForAdmin,
  type AdminUserRow,
  type PlatformActivity,
} from '@/lib/admin';
import { formatUtcDateTime } from '@/lib/format';
import { SiteHeader } from '@/components/SiteHeader';
import { AdminUserActions } from '@/components/AdminUserActions';
import { Card, PageLayout } from '@/components/ui';

export const dynamic = 'force-dynamic';

function slug(label: string): string {
  return label.toLowerCase().replace(/\s+/g, '-');
}

function OverviewStat({
  label,
  value,
  trend,
}: {
  label: string;
  value: string | number;
  trend?: string;
}): ReactElement {
  return (
    <Card className="flex flex-col gap-1" data-testid={`admin-stat-${slug(label)}`}>
      <span className="text-caption text-[var(--color-text-secondary)]">{label}</span>
      <span className="text-heading font-display font-bold">{value}</span>
      {trend ? <span className="text-caption text-[var(--color-text-tertiary)]">{trend}</span> : null}
    </Card>
  );
}

function ActivityStat({
  label,
  current,
  previous,
}: {
  label: string;
  current: number;
  previous: number;
}): ReactElement {
  return <OverviewStat label={label} value={current} trend={`${previous} the week before`} />;
}

function WeeklyActivityTable({ series }: { series: PlatformActivity['weeklySeries'] }): ReactElement {
  return (
    <Card className="overflow-x-auto" data-testid="admin-activity-weekly">
      <table className="w-full text-left text-body">
        <thead>
          <tr className="border-b border-[var(--color-divider)] text-caption text-[var(--color-text-secondary)]">
            <th className="py-2 pr-2 font-semibold">Week of</th>
            <th className="py-2 pr-2 font-semibold">Signups</th>
            <th className="py-2 pr-2 font-semibold">Shows</th>
            <th className="py-2 font-semibold">Joins</th>
          </tr>
        </thead>
        <tbody>
          {series.map((week) => (
            <tr key={week.weekStart} className="border-b border-[var(--color-divider)] last:border-0">
              <td className="py-2 pr-2 text-[var(--color-text-secondary)]">{week.weekStart}</td>
              <td className="py-2 pr-2">{week.signUps}</td>
              <td className="py-2 pr-2">{week.showsHosted}</td>
              <td className="py-2">{week.listenerJoins}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
  const [overview, activity, users] = await Promise.all([
    getPlatformOverview(),
    getPlatformActivity(),
    listUsersForAdmin(100),
  ]);

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
          <h2 className="text-title font-display font-bold">Activity</h2>
          <p className="text-caption text-[var(--color-text-secondary)]">
            Last 7 days, with the 7 days before that for trend.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="admin-activity-overview">
            <ActivityStat label="New sign-ups" current={activity.signUps.current} previous={activity.signUps.previous} />
            <ActivityStat
              label="Shows hosted"
              current={activity.showsHosted.current}
              previous={activity.showsHosted.previous}
            />
            <ActivityStat
              label="Hours hosted"
              current={activity.hoursHosted.current}
              previous={activity.hoursHosted.previous}
            />
            <ActivityStat
              label="Listener joins"
              current={activity.listenerJoins.current}
              previous={activity.listenerJoins.previous}
            />
            <ActivityStat
              label="Signed-in listeners"
              current={activity.distinctListeners.current}
              previous={activity.distinctListeners.previous}
            />
            <ActivityStat
              label="Peak concurrent listeners"
              current={activity.peakConcurrentListeners.current}
              previous={activity.peakConcurrentListeners.previous}
            />
            <ActivityStat label="Reactions" current={activity.reactions.current} previous={activity.reactions.previous} />
            <ActivityStat label="Likes" current={activity.likes.current} previous={activity.likes.previous} />
          </div>
          <WeeklyActivityTable series={activity.weeklySeries} />
        </section>
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
