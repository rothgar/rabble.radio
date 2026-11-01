// tests/lib/spaces.test.ts
//
// Exercises the spaces service functions against a mocked Prisma client.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockUserFindUnique,
  mockSpaceCreate,
  mockSpaceFindMany,
  mockSpaceFindUnique,
  mockSpaceUpdate,
  mockSpaceUpdateMany,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockSpaceCreate: vi.fn(),
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
  recordReaction: vi.fn(async () => undefined),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
    },
    space: {
      create: mockSpaceCreate,
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
  expireStaleSpaces,
  getSpaces,
  getSpaceById,
  getSpaceBySlug,
  getSpacesForUser,
  incrementSpaceReactions,
  generateSlugSuffix,
  SPACE_STATUS,
  EMPTY_SPACE_TTL_MS,
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
      include: { host: true },
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
      include: { host: true },
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
      include: { host: true },
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
      { id: 'sp1', emptySince },
    ]);
    mockGetRoomParticipantSummary.mockResolvedValue(null);

    const count = await expireStaleSpaces(NOW);

    expect(count).toBe(0);
    expect(mockSpaceUpdate).not.toHaveBeenCalled();
  });
});

describe('incrementSpaceReactions', () => {
  it('increments the reaction counter and returns the new value', async () => {
    mockSpaceUpdate.mockResolvedValueOnce({ reactionCount: 7 });
    const count = await incrementSpaceReactions('sp1');
    expect(count).toBe(7);
    expect(mockSpaceUpdate).toHaveBeenCalledWith({
      where: { id: 'sp1' },
      data: { reactionCount: { increment: 1 } },
      select: { reactionCount: true },
    });
  });

  it('returns null on failure', async () => {
    mockSpaceUpdate.mockRejectedValueOnce(new Error('boom'));
    const count = await incrementSpaceReactions('sp1');
    expect(count).toBeNull();
  });
});
