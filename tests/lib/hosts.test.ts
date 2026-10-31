// tests/lib/hosts.test.ts
//
// Exercises the getTopHosts ranking logic against a mocked Prisma client.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSpaceFindMany } = vi.hoisted(() => ({
  mockSpaceFindMany: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    space: {
      findMany: mockSpaceFindMany,
    },
  },
}));

import { getTopHosts } from '@/lib/hosts';

const NOW = new Date('2025-01-02T00:00:00Z');

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
    id: 'sp',
    slug: 'sp',
    title: 'Room',
    description: null,
    hostId: 'did:plc:host1',
    isLive: false,
    listenerCount: 0,
    speakerCount: 0,
    reactionCount: 0,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getTopHosts', () => {
  it('ranks hosts by popularity and boosts those with upcoming scheduled spaces', async () => {
    mockSpaceFindMany.mockResolvedValueOnce([
      // Host A: very popular, no upcoming.
      space({
        id: 'a1',
        hostId: 'did:plc:hostA',
        host: host('did:plc:hostA', 'alice.bsky.social'),
        listenerCount: 100,
        speakerCount: 5,
        reactionCount: 50,
        status: 'live',
      }),
      // Host B: low popularity but has an upcoming scheduled space.
      space({
        id: 'b1',
        hostId: 'did:plc:hostB',
        host: host('did:plc:hostB', 'bob.bsky.social'),
        listenerCount: 1,
        speakerCount: 0,
        reactionCount: 0,
        status: 'scheduled',
        scheduledAt: new Date('2025-02-01T00:00:00Z'),
      }),
    ]);

    const hosts = await getTopHosts(10, NOW);

    // Host B (has upcoming) ranks first despite lower popularity.
    expect(hosts[0].host.handle).toBe('bob.bsky.social');
    expect(hosts[0].upcoming).toHaveLength(1);
    expect(hosts[0].upcoming[0].id).toBe('b1');
    expect(hosts[1].host.handle).toBe('alice.bsky.social');
    expect(hosts[1].popularity).toBe(155);
  });

  it('does not list past scheduled spaces as upcoming', async () => {
    mockSpaceFindMany.mockResolvedValueOnce([
      space({
        id: 's2',
        hostId: 'did:plc:hostA',
        host: host('did:plc:hostA', 'alice.bsky.social'),
        status: 'scheduled',
        scheduledAt: new Date('2024-12-01T00:00:00Z'),
      }),
    ]);

    const hosts = await getTopHosts(10, NOW);
    expect(hosts).toHaveLength(1);
    expect(hosts[0].popularity).toBe(0);
    expect(hosts[0].upcoming).toHaveLength(0);
  });

  it('respects the limit', async () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      space({
        id: `sp${i}`,
        hostId: `did:plc:host${i}`,
        host: host(`did:plc:host${i}`, `h${i}.bsky.social`),
        listenerCount: i,
        status: 'live',
      })
    );
    mockSpaceFindMany.mockResolvedValueOnce(many);
    const hosts = await getTopHosts(10, NOW);
    expect(hosts.length).toBe(10);
  });
});
