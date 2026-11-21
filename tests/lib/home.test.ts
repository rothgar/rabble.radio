// tests/lib/home.test.ts

import { describe, expect, it } from 'vitest';
import type { PublicSpace } from '@/types';
import { buildHomeSections } from '@/lib/home';

function show(overrides: Partial<PublicSpace>): PublicSpace {
  return {
    id: 'sp', slug: 'sp', title: 'Show', description: null, isLive: false, status: 'active',
    scheduledAt: null, expiresAt: null, listenerCount: 0, speakerCount: 0, reactionCount: 0,
    tunedInCount: 0, likeCount: 0, sessionCount: 0, totalListeners: 0, hostedSeconds: 0, lastLiveAt: null,
    tags: [], createdAt: '', updatedAt: '', shareableUrl: '',
    host: { did: 'did:h', handle: 'h', displayName: null, avatarUrl: null },
    onStageHosts: [{ did: 'did:h', handle: 'h', displayName: null, avatarUrl: null }],
    replay: null, reminded: false, isNamedShow: false, podcastFeedEnabled: false, podcastFeedUrl: null,
    ...overrides,
  };
}

describe('buildHomeSections', () => {
  it('orders on-air rooms by live engagement and the rest by lifetime engagement', () => {
    const { onAir, popular, forYou } = buildHomeSections([
      show({ id: 'a', isLive: true, status: 'live', listenerCount: 1 }),
      show({ id: 'b', isLive: true, status: 'live', listenerCount: 10 }),
      show({ id: 'c', totalListeners: 5 }),
      show({ id: 'd', totalListeners: 50, likeCount: 3 }),
    ]);
    expect(onAir.map((s) => s.id)).toEqual(['b', 'a']);
    expect(popular.map((s) => s.id)).toEqual(['d', 'c']);
    expect(forYou).toEqual([]);
  });

  it('builds For you from followed hosts and followed people in rooms, live first', () => {
    const friend = { did: 'did:f', handle: 'f', displayName: null, avatarUrl: null };
    const { forYou } = buildHomeSections([
      show({ id: 'x', hostFollowed: true }),
      show({ id: 'y', isLive: true, status: 'live', followedInRoom: [friend] }),
      show({ id: 'z', isLive: true, status: 'live', hostFollowed: false, followedInRoom: [] }),
    ]);
    expect(forYou.map((s) => s.id)).toEqual(['y', 'x']);
  });

  it('applies limits', () => {
    const many = Array.from({ length: 20 }, (_, i) => show({ id: `s${i}`, isLive: true, status: 'live' }));
    expect(buildHomeSections(many, { forYou: 6, onAir: 3, popular: 3 }).onAir).toHaveLength(3);
  });

  it('hides the viewer\'s own shows and blocked hosts from Popular, but not On air or For you', () => {
    const me = { did: 'did:me', handle: 'me', displayName: null, avatarUrl: null };
    const blocked = { did: 'did:blocked', handle: 'blocked', displayName: null, avatarUrl: null };
    const { popular, onAir, forYou } = buildHomeSections(
      [
        show({ id: 'mine', host: me, totalListeners: 100 }),
        show({ id: 'mine-live', isLive: true, status: 'live', host: me, hostFollowed: true, listenerCount: 5 }),
        show({ id: 'blocked-show', host: blocked, totalListeners: 100 }),
        show({ id: 'other', totalListeners: 1 }),
      ],
      undefined,
      { viewerDid: 'did:me', blockedDids: new Set(['did:blocked']) }
    );
    expect(popular.map((s) => s.id)).toEqual(['other']);
    expect(onAir.map((s) => s.id)).toEqual(['mine-live']);
    expect(forYou.map((s) => s.id)).toEqual(['mine-live']);
  });
});
