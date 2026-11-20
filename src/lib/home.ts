// src/lib/home.ts
//
// Pure ranking for the home page. Given the decorated show list for the
// viewer, split it into the sections the page renders:
//   forYou  – shows by people the viewer follows, or with a follow in the
//             room (signed-in only), on air first
//   onAir   – live shows, biggest rooms first
//   popular – everything else that can be acted on (off air, scheduled,
//             replays), by lifetime engagement

import type { PublicSpace } from '@/types';

export interface HomeSections {
  forYou: PublicSpace[];
  onAir: PublicSpace[];
  popular: PublicSpace[];
}

export function liveScore(s: PublicSpace): number {
  return s.listenerCount * 3 + s.speakerCount * 5 + s.reactionCount;
}

export function lifetimeScore(s: PublicSpace): number {
  return s.totalListeners * 3 + s.likeCount * 4 + s.reactionCount + s.sessionCount * 2;
}

export function isForYou(s: PublicSpace): boolean {
  return Boolean(s.hostFollowed) || (s.followedInRoom?.length ?? 0) > 0;
}

export interface BuildHomeSectionsOptions {
  /** Never put the viewer's own shows in "Popular shows" — they know their own show. */
  viewerDid?: string | null;
  /** Never put a blocked host's shows in "Popular shows". */
  blockedDids?: Set<string>;
}

export function buildHomeSections(
  spaces: PublicSpace[],
  limits = { forYou: 6, onAir: 12, popular: 12 },
  opts: BuildHomeSectionsOptions = {}
): HomeSections {
  const byLive = (a: PublicSpace, b: PublicSpace) => {
    if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
    return (a.isLive ? liveScore(b) - liveScore(a) : lifetimeScore(b) - lifetimeScore(a)) || a.title.localeCompare(b.title);
  };
  const forYou = spaces.filter(isForYou).sort(byLive).slice(0, limits.forYou);
  const onAir = spaces
    .filter((s) => s.isLive)
    .sort((a, b) => liveScore(b) - liveScore(a) || a.title.localeCompare(b.title))
    .slice(0, limits.onAir);
  const popular = spaces
    .filter((s) => !s.isLive && s.host.did !== opts.viewerDid && !opts.blockedDids?.has(s.host.did))
    .sort((a, b) => {
      // Replays and scheduled shows are both one tap away; order by engagement.
      return lifetimeScore(b) - lifetimeScore(a) || a.title.localeCompare(b.title);
    })
    .slice(0, limits.popular);
  return { forYou, onAir, popular };
}
