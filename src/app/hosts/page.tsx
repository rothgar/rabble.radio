// src/app/hosts/page.tsx
//
// Highlights top space hosts: their profile + Bluesky link, popularity, and
// any upcoming scheduled spaces with add-to-calendar options so people can get
// reminders.

import type { ReactElement } from 'react';
import { getTopHosts } from '@/lib/hosts';
import { HostCard } from '@/components/HostCard';
import { SiteHeader } from '@/components/SiteHeader';

export const dynamic = 'force-dynamic';

export default async function HostsPage(): Promise<ReactElement> {
  const hosts = await getTopHosts(10);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Top hosts</h1>
            <p className="text-sm text-slate-400">
              Space hosts with the most engaged rooms. See who&apos;s live now
              and who&apos;s coming up — add scheduled spaces to your calendar so
              you don&apos;t miss them.
            </p>
          </div>
        </header>

      {hosts.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-700 p-12 text-center"
          data-testid="hosts-empty"
        >
          <p className="text-lg text-slate-300">No hosts yet.</p>
          <p className="max-w-md text-sm text-slate-500">
            When people start hosting spaces, their profiles will show up here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="hosts-grid">
          {hosts.map((host, i) => (
            <HostCard key={host.host.did} host={host} rank={i + 1} />
          ))}
        </div>
      )}
      </main>
    </>
  );
}
