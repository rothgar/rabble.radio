// tests/lib/spaces.test.ts
//
// Exercises the spaces service functions against a mocked Prisma client.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockUserFindUnique,
  mockSpaceCreate,
  mockSpaceFindFirst,
  mockSpaceFindMany,
  mockSpaceFindUnique,
  mockSpaceUpdate,
  mockSpaceUpdateMany,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockSpaceCreate: vi.fn(),
  mockSpaceFindFirst: vi.fn(),
  mockSpaceFindMany: vi.fn(),
  mockSpaceFindUnique: vi.fn(),
  mockSpaceUpdate: vi.fn(),
  mockSpaceUpdateMany: vi.fn(),
}));

vi.mock('@/lib/metrics', () => ({
  startShowSession: vi.fn(async () => undefined),
  endShowSession: vi.fn(async () => undefined),
  recordJoin: vi.fn(async () => undefined),
  recordLeave: vi.fn(async () => undefined),
  recordStageChange: vi.fn(async () => undefined),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
    },
    space: {
      create: mockSpaceCreate,
      findFirst: mockSpaceFindFirst,
      findMany: mockSpaceFindMany,
      findUnique: mockSpaceFindUnique,
      update: mockSpaceUpdate,
      updateMany: mockSpaceUpdateMany,
    },
  },
}));

const {
  mockGetRoomParticipantSummary,
  mockRoomNameForSpace,
} = vi.hoisted(() => ({
  mockGetRoomParticipantSummary: vi.fn(),
  mockRoomNameForSpace: vi.fn(),
}));

vi.mock('@/lib/livekit', () => ({
  getRoomParticipantSummary: mockGetRoomParticipantSummary,
  roomNameForSpace: mockRoomNameForSpace,
}));

import {
  buildSpaceSlug,
  createSpace,
  defaultShowTitle,
  findDefaultHostedSpace,
  getHostedSpaces,
  isDefaultShowTitle,
  reopenSpace,
  updateSpace,
  expireStaleSpaces,
  getSpaces,
  getSpaceById,
  getSpaceBySlug,
  getSpacesForUser,
  generateSlugSuffix,
  toPublicSpace,
  SPACE_STATUS,
  EMPTY_SPACE_TTL_MS,
  UNREADABLE_SPACE_TTL_MS,
} from '@/lib/spaces';

const HOST_DID = 'did:plc:host123';

function makeHost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    did: HOST_DID,
    handle: 'alice.bsky.social',
    displayName: 'Alice',
    avatarUrl: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeSpaceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sp1',
    slug: 'my-room-abc12345',
    title: 'My room',
    description: null,
    hostId: HOST_DID,
    isLive: false,
    listenerCount: 0,
    speakerCount: 0,
    reactionCount: 0,
    createdAt: new Date('2025-01-02T00:00:00Z'),
    updatedAt: new Date('2025-01-02T00:00:00Z'),
    host: makeHost(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRoomParticipantSummary.mockResolvedValue({ speakers: 0, listeners: 0 });
  mockRoomNameForSpace.mockImplementation((id: string) => `space-${id}`);
});

describe('buildSpaceSlug', () => {
  it('slugifies a title and appends a suffix', () => {
    const slug = buildSpaceSlug('Hello, World!', 'xyz12345');
    expect(slug).toBe('hello-world-xyz12345');
  });

  it('handles unicode characters', () => {
    const slug = buildSpaceSlug('Café discussions', 'abc12345');
    expect(slug).toBe('cafe-discussions-abc12345');
  });

  it('falls back to just a suffix when title has no slug chars', () => {
    const slug = buildSpaceSlug('!!!', 'abc12345');
    expect(slug).toBe('abc12345');
  });

  it('generates a suffix of the requested length', () => {
    const suffix = generateSlugSuffix(4);
    expect(suffix).toMatch(/^[0-9a-z]{4}$/);
  });
});

describe('createSpace', () => {
  it('creates a space with a derived slug and trimmed description', async () => {
    mockUserFindUnique.mockResolvedValueOnce(makeHost());
    mockSpaceCreate.mockImplementationOnce(async ({ data }) =>
      makeSpaceRow({
        slug: data.slug,
        title: data.title,
        description: data.description,
      })
    );

    const space = await createSpace(
      {
        title: '  My new space  ',
        description: '  talking about things  ',
        hostId: HOST_DID,
      },
      { slugFactory: () => 'fixed-slug' }
    );

    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { did: HOST_DID },
      select: { did: true },
    });
    expect(mockSpaceCreate).toHaveBeenCalledOnce();
    const args = mockSpaceCreate.mock.calls[0][0];
    expect(args.data).toMatchObject({
      slug: 'fixed-slug',
      title: 'My new space',
      description: 'talking about things',
      hostId: HOST_DID,
    });
    expect(space.title).toBe('My new space');
    expect(space.host.handle).toBe('alice.bsky.social');
  });

  it('stores null description when blank', async () => {
    mockUserFindUnique.mockResolvedValueOnce(makeHost());
    mockSpaceCreate.mockImplementationOnce(async ({ data }) =>
      makeSpaceRow({ slug: data.slug, description: data.description })
    );

    await createSpace(
      { title: 't', description: '   ', hostId: HOST_DID },
      { slugFactory: () => 'fixed-slug' }
    );
    const args = mockSpaceCreate.mock.calls[0][0];
    expect(args.data.description).toBeNull();
  });

  it('throws when title is empty', async () => {
    await expect(
      createSpace({ title: '   ', hostId: HOST_DID })
    ).rejects.toThrow(/title/i);
    expect(mockSpaceCreate).not.toHaveBeenCalled();
  });

  it('throws when host does not exist', async () => {
    mockUserFindUnique.mockResolvedValueOnce(null);
    await expect(
      createSpace({ title: 'hi', hostId: 'did:plc:missing' })
    ).rejects.toThrow(/host/i);
    expect(mockSpaceCreate).not.toHaveBeenCalled();
  });

  it('defaults isDefaultTitled to false, and passes it through when set', async () => {
    mockUserFindUnique.mockResolvedValue(makeHost());
    mockSpaceCreate.mockImplementation(async ({ data }) => makeSpaceRow({ title: data.title }));

    await createSpace(
      { title: 'Custom title', hostId: HOST_DID },
      { slugFactory: () => 'fixed-slug' }
    );
    expect(mockSpaceCreate.mock.calls[0][0].data.isDefaultTitled).toBe(false);

    await createSpace(
      { title: 'The Alice show', hostId: HOST_DID, isDefaultTitled: true },
      { slugFactory: () => 'fixed-slug' }
    );
    expect(mockSpaceCreate.mock.calls[1][0].data.isDefaultTitled).toBe(true);
  });
});

describe('getSpaces', () => {
  it('returns spaces ordered by createdAt desc with hosts', async () => {
    mockSpaceFindMany.mockResolvedValueOnce([
      makeSpaceRow({ id: 'sp2' }),
      makeSpaceRow({ id: 'sp1' }),
    ]);
    const spaces = await getSpaces();
    expect(mockSpaceFindMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      include: { host: true, tags: { select: { tag: true } } },
    });
    expect(spaces).toHaveLength(2);
    expect(spaces[0].id).toBe('sp2');
  });
});

describe('getSpaceById / getSpaceBySlug', () => {
  it('getSpaceById returns space or null', async () => {
    mockSpaceFindUnique.mockResolvedValueOnce(makeSpaceRow());
    const a = await getSpaceById('sp1');
    expect(mockSpaceFindUnique).toHaveBeenCalledWith({
      where: { id: 'sp1' },
      include: { host: true, tags: { select: { tag: true } } },
    });
    expect(a?.id).toBe('sp1');

    mockSpaceFindUnique.mockResolvedValueOnce(null);
    const b = await getSpaceById('nope');
    expect(b).toBeNull();
  });

  it('getSpaceBySlug returns space or null', async () => {
    mockSpaceFindUnique.mockResolvedValueOnce(makeSpaceRow());
    const a = await getSpaceBySlug('my-room-abc12345');
    expect(mockSpaceFindUnique).toHaveBeenCalledWith({
      where: { slug: 'my-room-abc12345' },
      include: { host: true, tags: { select: { tag: true } } },
    });
    expect(a?.slug).toBe('my-room-abc12345');

    mockSpaceFindUnique.mockResolvedValueOnce(null);
    const b = await getSpaceBySlug('nope');
    expect(b).toBeNull();
  });
});

describe('getSpacesForUser', () => {
  it('excludes expired spaces from the host branch of the default list', async () => {
    mockSpaceFindMany.mockResolvedValueOnce([]);
    await getSpacesForUser(HOST_DID, new Date('2025-01-02T00:00:00Z'));
    const where = mockSpaceFindMany.mock.calls[0][0].where;
    expect(where.OR[0]).toEqual({
      hostId: HOST_DID,
      status: { not: SPACE_STATUS.EXPIRED },
    });
  });
});

describe('expireStaleSpaces', () => {
  const NOW = new Date('2025-01-02T00:00:00Z');

  it('expires an empty active space empty for longer than the TTL', async () => {
    mockSpaceUpdateMany.mockResolvedValueOnce({ count: 0 });
    const emptySince = new Date(NOW.getTime() - EMPTY_SPACE_TTL_MS - 1000);
    mockSpaceFindMany.mockResolvedValueOnce([
      { id: 'sp1', emptySince },
    ]);
    mockGetRoomParticipantSummary.mockResolvedValue({ speakers: 0, listeners: 0 });

    const count = await expireStaleSpaces(NOW);

    expect(count).toBe(1);
    expect(mockSpaceUpdate).toHaveBeenCalledWith({
      where: { id: 'sp1' },
      data: { isLive: false, status: SPACE_STATUS.EXPIRED },
    });
  });

  it('starts the empty countdown the first time a room is observed empty', async () => {
    mockSpaceUpdateMany.mockResolvedValueOnce({ count: 0 });
    mockSpaceFindMany.mockResolvedValueOnce([
      { id: 'sp1', emptySince: null },
    ]);
    mockGetRoomParticipantSummary.mockResolvedValue({ speakers: 0, listeners: 0 });

    const count = await expireStaleSpaces(NOW);

    expect(count).toBe(0);
    expect(mockSpaceUpdate).toHaveBeenCalledWith({
      where: { id: 'sp1' },
      data: { emptySince: NOW },
    });
  });

  it('resets the countdown and records metrics when the room is occupied', async () => {
    mockSpaceUpdateMany.mockResolvedValueOnce({ count: 0 });
    const emptySince = new Date(NOW.getTime() - EMPTY_SPACE_TTL_MS - 1000);
    mockSpaceFindMany.mockResolvedValueOnce([
      { id: 'sp1', emptySince },
    ]);
    mockGetRoomParticipantSummary.mockResolvedValue({ speakers: 2, listeners: 5 });

    const count = await expireStaleSpaces(NOW);

    expect(count).toBe(0);
    expect(mockSpaceUpdate).toHaveBeenCalledWith({
      where: { id: 'sp1' },
      data: {
        speakerCount: 2,
        listenerCount: 5,
        emptySince: null,
      },
    });
  });

  it('records occupancy metrics for an empty-but-not-yet-expired room', async () => {
    mockSpaceUpdateMany.mockResolvedValueOnce({ count: 0 });
    mockSpaceFindMany.mockResolvedValueOnce([
      { id: 'sp1', emptySince: null },
    ]);
    mockGetRoomParticipantSummary.mockResolvedValue({ speakers: 1, listeners: 3 });

    await expireStaleSpaces(NOW);

    expect(mockSpaceUpdate).toHaveBeenCalledWith({
      where: { id: 'sp1' },
      data: { speakerCount: 1, listenerCount: 3, emptySince: null },
    });
  });

  it('fails safe and does not expire when LiveKit is unreachable', async () => {
    mockSpaceUpdateMany.mockResolvedValueOnce({ count: 0 });
    const emptySince = new Date(NOW.getTime() - EMPTY_SPACE_TTL_MS - 1000);
    mockSpaceFindMany.mockResolvedValueOnce([
      { id: 'sp1', emptySince, updatedAt: new Date(NOW.getTime() - 60 * 60 * 1000) },
    ]);
    mockGetRoomParticipantSummary.mockResolvedValue(null);

    const count = await expireStaleSpaces(NOW);

    expect(count).toBe(0);
    expect(mockSpaceUpdate).not.toHaveBeenCalled();
  });

  it('expires a live show LiveKit has been unreadable for longer than UNREADABLE_SPACE_TTL_MS', async () => {
    mockSpaceUpdateMany.mockResolvedValueOnce({ count: 0 });
    mockSpaceFindMany.mockResolvedValueOnce([
      {
        id: 'sp-stuck',
        emptySince: null,
        updatedAt: new Date(NOW.getTime() - UNREADABLE_SPACE_TTL_MS - 1000),
      },
    ]);
    mockGetRoomParticipantSummary.mockResolvedValue(null);

    const count = await expireStaleSpaces(NOW);

    expect(count).toBe(1);
    expect(mockSpaceUpdate).toHaveBeenCalledWith({
      where: { id: 'sp-stuck' },
      data: { isLive: false, status: SPACE_STATUS.EXPIRED },
    });
  });
});

describe('updateSpace', () => {
  it('trims the title, nulls an empty description and replaces the tag set', async () => {
    mockSpaceUpdate.mockResolvedValueOnce({
      id: 'sp1',
      title: 'Morning show',
      description: null,
      tags: [{ tag: 'Music' }],
      host: { did: 'did:plc:host' },
    });
    const updated = await updateSpace('sp1', {
      title: '  Morning show ',
      description: '   ',
      tags: ['Music', 'not-a-category'],
    });
    expect(updated.tags).toEqual(['Music']);
    const args = mockSpaceUpdate.mock.calls[0][0];
    expect(args.where).toEqual({ id: 'sp1' });
    expect(args.data.title).toBe('Morning show');
    expect(args.data.description).toBeNull();
    expect(args.data.tags).toEqual({ deleteMany: {}, create: [{ tag: 'Music' }] });
  });

  it('only touches the fields that were supplied', async () => {
    mockSpaceUpdate.mockResolvedValueOnce({ id: 'sp1', title: 'Kept', tags: [], host: {} });
    await updateSpace('sp1', { tags: ['Gaming'] });
    const args = mockSpaceUpdate.mock.calls[0][0];
    expect(args.data).toEqual({ tags: { deleteMany: {}, create: [{ tag: 'Gaming' }] } });
  });

  it('rejects an empty title', async () => {
    await expect(updateSpace('sp1', { title: '  ' })).rejects.toThrow(/Title is required/);
    expect(mockSpaceUpdate).not.toHaveBeenCalled();
  });

  it('turns the per-show podcast feed on or off', async () => {
    mockSpaceUpdate.mockResolvedValueOnce({ id: 'sp1', title: 'Kept', tags: [], host: {} });
    await updateSpace('sp1', { podcastFeedEnabled: true });
    const args = mockSpaceUpdate.mock.calls[0][0];
    expect(args.data).toEqual({ podcastFeedEnabled: true });
  });

  it('clears isDefaultTitled when the host edits the title themselves', async () => {
    mockSpaceUpdate.mockResolvedValueOnce({ id: 'sp1', title: 'My real show', tags: [], host: {} });
    await updateSpace('sp1', { title: 'My real show' });
    const args = mockSpaceUpdate.mock.calls[0][0];
    expect(args.data).toEqual({ title: 'My real show', isDefaultTitled: false });
  });

  it('puts music back on stage whenever the mood changes (issue #111)', async () => {
    mockSpaceUpdate.mockResolvedValueOnce({ id: 'sp1', title: 'Kept', tags: [], host: {} });
    await updateSpace('sp1', { musicMood: 'lounge' });
    expect(mockSpaceUpdate.mock.calls[0][0].data).toEqual({ musicMood: 'lounge', musicOnStage: true });
  });

  it('moves music off stage without losing the mood', async () => {
    mockSpaceUpdate.mockResolvedValueOnce({ id: 'sp1', title: 'Kept', tags: [], host: {} });
    await updateSpace('sp1', { musicOnStage: false });
    expect(mockSpaceUpdate.mock.calls[0][0].data).toEqual({ musicOnStage: false });
  });
});

describe('toPublicSpace', () => {
  it('omits the per-show feed URL when the feed is disabled', () => {
    const space = toPublicSpace(
      makeSpaceRow({ podcastFeedEnabled: false, tags: [] }) as never,
      'https://rabble.example'
    );
    expect(space.podcastFeedEnabled).toBe(false);
    expect(space.podcastFeedUrl).toBeNull();
  });

  it('builds a stable feed URL scoped to the show when enabled', () => {
    const space = toPublicSpace(
      makeSpaceRow({ podcastFeedEnabled: true, tags: [] }) as never,
      'https://rabble.example'
    );
    expect(space.podcastFeedEnabled).toBe(true);
    expect(space.podcastFeedUrl).toBe(
      'https://rabble.example/podcast/alice.bsky.social/show/sp1/feed.xml'
    );
  });

  it('flags a show with a name of its own as named', () => {
    const space = toPublicSpace(makeSpaceRow({ title: 'My room', tags: [] }) as never, 'https://rabble.example');
    expect(space.isNamedShow).toBe(true);
  });

  it('does not flag a host\'s default-titled show as named', () => {
    const space = toPublicSpace(
      makeSpaceRow({ title: 'The Alice show', tags: [] }) as never,
      'https://rabble.example'
    );
    expect(space.isNamedShow).toBe(false);
  });

  it('defaults musicOnStage to true for rows that predate the column', () => {
    const space = toPublicSpace(makeSpaceRow({ tags: [] }) as never, 'https://rabble.example');
    expect(space.musicOnStage).toBe(true);
  });
});

describe('getHostedSpaces', () => {
  it('lists every status for the host, most recently live first', async () => {
    mockSpaceFindMany.mockResolvedValueOnce([
      { id: 'a', tags: [{ tag: 'Music' }], host: {} },
      { id: 'b', tags: [], host: {} },
    ]);
    const rows = await getHostedSpaces('did:plc:host');
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(rows[0].tags).toEqual(['Music']);
    expect(mockSpaceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { hostId: 'did:plc:host' },
        orderBy: [{ lastLiveAt: 'desc' }, { createdAt: 'desc' }],
      })
    );
  });
});

describe('defaultShowTitle', () => {
  it('builds a title from the handle when there is no display name', () => {
    expect(defaultShowTitle('alice.bsky.social')).toBe('The @alice.bsky.social show');
    expect(defaultShowTitle('@bob')).toBe('The @bob show');
  });

  it('prefers the display name over the handle when one is set (issue #23)', () => {
    expect(defaultShowTitle('alice.bsky.social', 'Alice Example')).toBe(
      'The Alice Example show'
    );
  });

  it('falls back to the handle when the display name is blank', () => {
    expect(defaultShowTitle('alice.bsky.social', '  ')).toBe('The @alice.bsky.social show');
  });
});

describe('isDefaultShowTitle', () => {
  it('matches the current default title shape', () => {
    expect(isDefaultShowTitle('The Alice Example show', 'alice.bsky.social', 'Alice Example')).toBe(true);
  });

  it('matches the pre-#23 handle-only shape', () => {
    expect(isDefaultShowTitle("@alice.bsky.social's show", 'alice.bsky.social', 'Alice Example')).toBe(true);
  });

  it('does not match a title the host chose', () => {
    expect(isDefaultShowTitle('The Weekly Deep Dive', 'alice.bsky.social', 'Alice Example')).toBe(false);
  });
});

describe('findDefaultHostedSpace', () => {
  it("looks up the host's isDefaultTitled, unscheduled show", async () => {
    mockSpaceFindFirst.mockResolvedValueOnce(makeSpaceRow({ id: 'd1', tags: [{ tag: 'Music' }] }));
    const row = await findDefaultHostedSpace('did:plc:host');
    expect(row?.id).toBe('d1');
    expect(row?.tags).toEqual(['Music']);
    expect(mockSpaceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          hostId: 'did:plc:host',
          isDefaultTitled: true,
          status: { not: 'scheduled' },
        },
        orderBy: [{ lastLiveAt: 'desc' }, { createdAt: 'desc' }],
      })
    );
  });

  it('returns null when the host has none', async () => {
    mockSpaceFindFirst.mockResolvedValueOnce(null);
    expect(await findDefaultHostedSpace('did:plc:host')).toBeNull();
  });

  it('still finds the default show after the host renames on Bluesky (issue #33)', async () => {
    // The row was created while the host was "alice.bsky.social" / no
    // display name, so its title is the old rendering — but the marker was
    // set at creation time and the lookup never recomputes or matches title.
    mockSpaceFindFirst.mockImplementationOnce(async ({ where }) =>
      where.isDefaultTitled === true
        ? makeSpaceRow({ id: 'd1', title: 'The @alice.bsky.social show' })
        : null
    );
    const row = await findDefaultHostedSpace('did:plc:host');
    expect(row?.id).toBe('d1');
  });
});

describe('reopenSpace', () => {
  it('puts an ended show back to active, off air, with a fresh empty countdown', async () => {
    const now = new Date('2026-11-07T12:00:00Z');
    mockSpaceFindUnique.mockResolvedValueOnce({ status: 'ended' });
    mockSpaceUpdate.mockResolvedValueOnce(makeSpaceRow({ id: 'sp1', status: 'active', tags: [] }));
    const row = await reopenSpace('sp1', now);
    expect(row.id).toBe('sp1');
    expect(mockSpaceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sp1' },
        data: {
          status: 'active',
          isLive: false,
          scheduledAt: null,
          emptySince: now,
          expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
        },
      })
    );
  });

  it('leaves a show that is on air untouched', async () => {
    mockSpaceFindUnique
      .mockResolvedValueOnce({ status: 'live' })
      .mockResolvedValueOnce(makeSpaceRow({ id: 'sp1', status: 'live', isLive: true, tags: [] }));
    const row = await reopenSpace('sp1');
    expect(row.isLive).toBe(true);
    expect(mockSpaceUpdate).not.toHaveBeenCalled();
  });

  it('refreshes the title when a newTitle is given (issue #44)', async () => {
    const now = new Date('2026-11-07T12:00:00Z');
    mockSpaceFindUnique.mockResolvedValueOnce({ status: 'expired' });
    mockSpaceUpdate.mockResolvedValueOnce(
      makeSpaceRow({ id: 'sp1', status: 'active', title: 'The Alice Renamed show', tags: [] })
    );
    const row = await reopenSpace('sp1', now, 'The Alice Renamed show');
    expect(row.title).toBe('The Alice Renamed show');
    expect(mockSpaceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sp1' },
        data: {
          status: 'active',
          isLive: false,
          scheduledAt: null,
          emptySince: now,
          expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
          title: 'The Alice Renamed show',
        },
      })
    );
  });
});
