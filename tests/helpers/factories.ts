// tests/helpers/factories.ts
//
// Shared builders for the two Prisma row shapes most lib/API tests mock:
// a `User` and a `Space` joined with its host. Pass overrides for the
// fields a test cares about; the rest are stand-ins that rarely matter.

import type { Space, User } from '@prisma/client';

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    did: 'did:plc:host123',
    handle: 'alice.bsky.social',
    displayName: 'Alice',
    avatarUrl: null,
    bannedAt: null,
    banReason: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function makeSpace(
  overrides: Partial<Space & { host: User }> = {}
): Space & { host: User } {
  const host = overrides.host ?? makeUser();
  return {
    id: 'sp1',
    slug: 'my-room-abc12345',
    title: 'My room',
    description: null,
    hostId: host.did,
    isLive: false,
    scheduledAt: null,
    expiresAt: null,
    emptySince: null,
    status: 'active',
    listenerCount: 0,
    speakerCount: 0,
    reactionCount: 0,
    likeCount: 0,
    sessionCount: 0,
    totalListeners: 0,
    hostedSeconds: 0,
    lastLiveAt: null,
    musicMood: null,
    musicOnStage: true,
    podcastFeedEnabled: false,
    isDefaultTitled: false,
    calendarEventUri: null,
    calendarEventCid: null,
    announcedAt: null,
    announceAttempts: 0,
    createdAt: new Date('2025-01-02T00:00:00Z'),
    updatedAt: new Date('2025-01-02T00:00:00Z'),
    host,
    ...overrides,
  };
}
