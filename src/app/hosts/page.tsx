// src/app/hosts/page.tsx
//
// Highlights top space hosts: their profile + Bluesky link, popularity, and
// any upcoming scheduled spaces with add-to-calendar options so people can get
// reminders.

import type { ReactElement } from 'react';
import { getTopHosts } from '@/lib/hosts';
import { getFollowedHostDids } from '@/lib/host-follows';
import { getBlockedDids } from '@/lib/blocks';
import { getCurrentUser } from '@/lib/session';
import { HostCard } from '@/components/HostCard';
import { SiteHeader } from '@/components/SiteHeader';
import { Footer } from '@/components/Footer';
import { PageLayout } from '@/components/ui';

export const dynamic = 'force-dynamic';

const HOSTS_LIMIT = 10;
// Extra hosts fetched above the limit so filtering out blocked hosts (known
// only once getBlockedDids resolves) rarely leaves the page short, without
// serializing that fetch behind the ranking query.
const BLOCK_FILTER_BUFFER = 10;

export default async function HostsPage(): Promise<ReactElement> {
  const user = await getCurrentUser();
  const [candidateHosts, blockedDids] = await Promise.all([
    getTopHosts(HOSTS_LIMIT + BLOCK_FILTER_BUFFER, undefined, { excludeDid: user?.did ?? null }),
    getBlockedDids(user?.did ?? null),
  ]);
  const hosts = candidateHosts.filter((h) => !blockedDids.has(h.host.did)).slice(0, HOSTS_LIMIT);
  const followedHostDids = await getFollowedHostDids(
    user?.did ?? null,
    hosts.map((h) => h.host.did)
  );

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <PageLayout>
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Top hosts</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Hosts with the most engaged shows. See who&apos;s on air now
              and who&apos;s coming up — add scheduled shows to your calendar so
              you don&apos;t miss them.
            </p>
          </div>
        </header>

      {hosts.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--color-border-strong)] p-12 text-center"
          data-testid="hosts-empty"
        >
          <p className="text-lg text-[var(--color-text)]">No hosts yet.</p>
          <p className="max-w-md text-sm text-[var(--color-text-tertiary)]">
            When people start hosting shows, their profiles will show up here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="hosts-grid">
          {hosts.map((host, i) => (
            <HostCard
              key={host.host.did}
              host={host}
              rank={i + 1}
              isAuthenticated={Boolean(user)}
              following={followedHostDids.has(host.host.did)}
            />
          ))}
        </div>
      )}
      </PageLayout>
      <Footer />
    </div>
  );
}
