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

import {
  buildSpaceSlug,
  createSpace,
  expireStaleSpaces,
  getSpaces,
  getSpaceById,
  getSpaceBySlug,
  generateSlugSuffix,
  isSpaceVisible,
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
    createdAt: new Date('2025-01-02T00:00:00Z'),
    updatedAt: new Date('2025-01-02T00:00:00Z'),
    host: makeHost(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
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
