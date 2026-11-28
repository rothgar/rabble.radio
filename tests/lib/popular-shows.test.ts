// tests/lib/popular-shows.test.ts
//
// Exercises the popular-show watcher's selection, dedup and retry-give-up
// logic (issue #175) against a mocked Prisma client and atproto helpers.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSpaceFindMany, mockSpaceUpdate } = vi.hoisted(() => ({
  mockSpaceFindMany: vi.fn(),
  mockSpaceUpdate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    space: {
      findMany: mockSpaceFindMany,
      update: mockSpaceUpdate,
    },
  },
}));

const { mockCreateAppPasswordSession, mockPublishPopularShowAnnouncement } = vi.hoisted(() => ({
  mockCreateAppPasswordSession: vi.fn(),
  mockPublishPopularShowAnnouncement: vi.fn(),
}));

vi.mock('@/lib/atproto', () => ({
  createAppPasswordSession: mockCreateAppPasswordSession,
  publishPopularShowAnnouncement: mockPublishPopularShowAnnouncement,
}));

import {
  announcePopularShow,
  MAX_ANNOUNCE_ATTEMPTS,
  MIN_LISTENERS_TO_ANNOUNCE,
  selectShowToAnnounce,
} from '@/lib/popular-shows';

function host(did: string, handle: string) {
  return {
    id: did,
    did,
    handle,
    displayName: null,
    avatarUrl: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  };
}

function space(overrides: Record<string, unknown>) {
  return {
    id: 'sp1',
    slug: 'sp1',
    title: 'My room',
    description: null,
    hostId: 'did:plc:host',
    isLive: true,
    scheduledAt: null,
    expiresAt: null,
    emptySince: null,
    status: 'live',
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
    tags: [],
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    host: host('did:plc:host', 'alice.bsky.social'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('selectShowToAnnounce', () => {
  it('picks the live show with the highest popularity score', async () => {
    mockSpaceFindMany.mockResolvedValue([
      space({ id: 'sp1', listenerCount: 10, speakerCount: 0, reactionCount: 0 }),
      space({ id: 'sp2', listenerCount: 10, speakerCount: 5, reactionCount: 5 }),
    ]);
    const picked = await selectShowToAnnounce();
    expect(picked?.id).toBe('sp2');
    expect(mockSpaceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'live',
          announcedAt: null,
          listenerCount: { gte: MIN_LISTENERS_TO_ANNOUNCE },
        }),
      })
    );
  });

  it('breaks ties on the oldest show', async () => {
    mockSpaceFindMany.mockResolvedValue([
      space({ id: 'newer', listenerCount: 10, createdAt: new Date('2025-01-02T00:00:00Z') }),
      space({ id: 'older', listenerCount: 10, createdAt: new Date('2025-01-01T00:00:00Z') }),
    ]);
    const picked = await selectShowToAnnounce();
    expect(picked?.id).toBe('older');
  });

  it('returns null when nothing clears the listener threshold', async () => {
    mockSpaceFindMany.mockResolvedValue([]);
    expect(await selectShowToAnnounce()).toBeNull();
  });
});

describe('announcePopularShow', () => {
  beforeEach(() => {
    vi.stubEnv('ATPROTO_APP_PROFILE_IDENTIFIER', 'rabble.radio');
    vi.stubEnv('ATPROTO_APP_PROFILE_PASSWORD', 'app-password');
  });

  it('is a no-op when the app password secret is unset', async () => {
    vi.stubEnv('ATPROTO_APP_PROFILE_PASSWORD', '');
    mockSpaceFindMany.mockResolvedValue([space({ listenerCount: 50 })]);
    const result = await announcePopularShow();
    expect(result).toEqual({ announced: false });
    expect(mockSpaceFindMany).not.toHaveBeenCalled();
    expect(mockCreateAppPasswordSession).not.toHaveBeenCalled();
  });

  it('is a no-op when no show clears the threshold', async () => {
    mockSpaceFindMany.mockResolvedValue([]);
    const result = await announcePopularShow();
    expect(result).toEqual({ announced: false });
    expect(mockCreateAppPasswordSession).not.toHaveBeenCalled();
  });

  it('posts the announcement and stamps announcedAt on success', async () => {
    mockSpaceFindMany.mockResolvedValue([
      space({ id: 'sp1', listenerCount: 20, tags: ['music'] }),
    ]);
    mockCreateAppPasswordSession.mockResolvedValue({
      did: 'did:plc:rabble',
      accessJwt: 'jwt',
      service: 'https://bsky.social',
    });
    mockPublishPopularShowAnnouncement.mockResolvedValue({ ok: true, uri: 'at://x' });

    const result = await announcePopularShow();

    expect(result).toEqual({ announced: true, spaceId: 'sp1' });
    expect(mockPublishPopularShowAnnouncement).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'My room',
        hostHandle: 'alice.bsky.social',
        tags: ['music'],
      })
    );
    expect(mockSpaceUpdate).toHaveBeenCalledWith({
      where: { id: 'sp1' },
      data: { announcedAt: expect.any(Date) },
    });
  });

  it('leaves announcedAt unset and bumps the attempt count on a failed post', async () => {
    mockSpaceFindMany.mockResolvedValue([space({ id: 'sp1', listenerCount: 20, announceAttempts: 0 })]);
    mockCreateAppPasswordSession.mockResolvedValue({
      did: 'did:plc:rabble',
      accessJwt: 'jwt',
      service: 'https://bsky.social',
    });
    mockPublishPopularShowAnnouncement.mockResolvedValue({ ok: false, error: 'PDS unreachable' });

    const result = await announcePopularShow();

    expect(result).toEqual({ announced: false, spaceId: 'sp1', error: 'PDS unreachable' });
    expect(mockSpaceUpdate).toHaveBeenCalledWith({
      where: { id: 'sp1' },
      data: { announceAttempts: 1, announcedAt: undefined },
    });
  });

  it('gives up and stamps announcedAt after MAX_ANNOUNCE_ATTEMPTS failures', async () => {
    mockSpaceFindMany.mockResolvedValue([
      space({ id: 'sp1', listenerCount: 20, announceAttempts: MAX_ANNOUNCE_ATTEMPTS - 1 }),
    ]);
    mockCreateAppPasswordSession.mockResolvedValue({
      did: 'did:plc:rabble',
      accessJwt: 'jwt',
      service: 'https://bsky.social',
    });
    mockPublishPopularShowAnnouncement.mockResolvedValue({ ok: false, error: 'PDS unreachable' });

    await announcePopularShow();

    expect(mockSpaceUpdate).toHaveBeenCalledWith({
      where: { id: 'sp1' },
      data: { announceAttempts: MAX_ANNOUNCE_ATTEMPTS, announcedAt: expect.any(Date) },
    });
  });
});
