// src/lib/hosts.ts
//
// Service functions for the "Top Hosts" page. Ranks space hosts by how
// engaged their rooms are (live audience + speakers + reactions) and surfaces
// any upcoming scheduled spaces so people can grab calendar reminders.

import { prisma } from '@/lib/db';
import { SPACE_STATUS, spaceInclude, withTags, type SpaceWithHost } from '@/lib/spaces';

export interface TopHost {
  /** Host profile (public fields only). */
  host: {
    did: string;
    handle: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  /** Sum of listener + speaker + reaction counts across the host's visible spaces. */
  popularity: number;
  /** Scheduled spaces with a `scheduledAt` in the future, soonest first. */
  upcoming: SpaceWithHost[];
}

export interface GetTopHostsOptions {
  /** Never rank this host — used to hide the viewer from their own list. */
  excludeDid?: string | null;
  /** Never rank these hosts — the viewer's Bluesky blocks. */
  blockedDids?: Set<string>;
}

/**
 * Rank the top space hosts. Hosts with upcoming scheduled spaces are boosted
 * to the top (so people can set reminders), then hosts are ranked by the total
 * popularity of their non-expired spaces. Returns at most `limit` hosts.
 */
export async function getTopHosts(
  limit = 10,
  now: Date = new Date(),
  opts: GetTopHostsOptions = {}
): Promise<TopHost[]> {
  const rows = await prisma.space.findMany({
    where: { status: { not: SPACE_STATUS.EXPIRED } },
    include: spaceInclude,
  });
  const spaces = rows.map(withTags);

  const byHost = new Map<string, TopHost>();
  for (const s of spaces) {
    if (s.hostId === opts.excludeDid || opts.blockedDids?.has(s.hostId)) continue;
    let entry = byHost.get(s.hostId);
    if (!entry) {
      entry = {
        host: {
          did: s.host.did,
          handle: s.host.handle,
          displayName: s.host.displayName,
          avatarUrl: s.host.avatarUrl,
        },
        popularity: 0,
        upcoming: [],
      };
      byHost.set(s.hostId, entry);
    }
    entry.popularity += s.listenerCount + s.speakerCount + s.reactionCount;
    if (
      s.status === SPACE_STATUS.SCHEDULED &&
      s.scheduledAt &&
      s.scheduledAt.getTime() > now.getTime()
    ) {
      entry.upcoming.push(s);
    }
  }

  const hosts = Array.from(byHost.values());
  for (const h of hosts) {
    h.upcoming.sort(
      (a, b) =>
        (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0)
    );
  }
  hosts.sort((a, b) => {
    const aUp = a.upcoming.length > 0 ? 1 : 0;
    const bUp = b.upcoming.length > 0 ? 1 : 0;
    if (aUp !== bUp) return bUp - aUp;
    return b.popularity - a.popularity;
  });

  return hosts.slice(0, limit);
}
