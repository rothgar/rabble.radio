// tests/lib/space-extras.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicSpace } from '@/types';

const m = vi.hoisted(() => ({
  getLatestAvailableRecordings: vi.fn(),
  getRemindedSpaceIds: vi.fn(),
}));

vi.mock('@/lib/recording', async () => {
  const actual = await vi.importActual<typeof import('@/lib/recording')>('@/lib/recording');
  return { ...actual, getLatestAvailableRecordings: m.getLatestAvailableRecordings };
});
vi.mock('@/lib/reminders', () => ({ getRemindedSpaceIds: m.getRemindedSpaceIds }));
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/lib/storage', () => ({
  deleteObject: vi.fn(),
  getObjectSize: vi.fn(),
  getSignedDownloadUrl: vi.fn(),
  getStorageConfig: vi.fn(() => ({ bucket: 'b' })),
}));

import { decoratePublicSpaces, toPublicReplay } from '@/lib/space-extras';

function space(overrides: Partial<PublicSpace>): PublicSpace {
  return {
    id: 'sp1', slug: 'sp1', title: 'T', description: null, isLive: false, status: 'active',
    scheduledAt: null, expiresAt: null, listenerCount: 0, speakerCount: 0, reactionCount: 0,
    likeCount: 0, sessionCount: 0, totalListeners: 0, hostedSeconds: 0, lastLiveAt: null,
    tags: [], createdAt: '', updatedAt: '', shareableUrl: '',
    host: { did: 'did:h', handle: 'h', displayName: null, avatarUrl: null },
    replay: null, reminded: false,
    ...overrides,
  };
}

const rec = {
  id: 'rec1', spaceId: 'sp1', egressId: 'e', status: 'available' as const,
  startedAt: new Date('2026-11-07T00:00:00Z'), endedAt: new Date('2026-11-07T00:40:30Z'),
  expiresAt: new Date('2026-12-07T00:00:00Z'), s3Key: 'k', s3Bucket: 'b', contentType: 'audio/mp4',
  sizeBytes: 1234, downloadUrl: null, hostDid: 'did:h', published: false, publishedAt: null,
  createdAt: new Date(), updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  m.getLatestAvailableRecordings.mockResolvedValue(new Map());
  m.getRemindedSpaceIds.mockResolvedValue(new Set());
});

describe('toPublicReplay', () => {
  it('builds the stable audio URL and duration', () => {
    expect(toPublicReplay(rec)).toEqual({
      recordingId: 'rec1',
      audioUrl: '/api/recordings/rec1/audio',
      contentType: 'audio/mp4',
      startedAt: '2026-11-07T00:00:00.000Z',
      endedAt: '2026-11-07T00:40:30.000Z',
      durationSeconds: 2430,
      sizeBytes: 1234,
    });
  });
});

describe('decoratePublicSpaces', () => {
  it('attaches replays to off-air shows and reminders for the viewer', async () => {
    m.getLatestAvailableRecordings.mockResolvedValue(new Map([['sp1', rec]]));
    m.getRemindedSpaceIds.mockResolvedValue(new Set(['sp2']));
    const out = await decoratePublicSpaces(
      [space({ id: 'sp1' }), space({ id: 'sp2', status: 'scheduled' }), space({ id: 'sp3', isLive: true, status: 'live' })],
      'did:v'
    );
    expect(m.getLatestAvailableRecordings).toHaveBeenCalledWith(['sp1', 'sp2']);
    expect(m.getRemindedSpaceIds).toHaveBeenCalledWith('did:v', ['sp1', 'sp2', 'sp3']);
    expect(out[0].replay?.recordingId).toBe('rec1');
    expect(out[1].replay).toBeNull();
    expect(out[1].reminded).toBe(true);
    expect(out[2].replay).toBeNull();
  });

  it('still returns the rows when a lookup throws', async () => {
    m.getLatestAvailableRecordings.mockImplementation(() => {
      throw new Error('boom');
    });
    const out = await decoratePublicSpaces([space({})], null);
    expect(out).toHaveLength(1);
    expect(out[0].replay).toBeNull();
  });

  it('skips lookups for an empty list', async () => {
    expect(await decoratePublicSpaces([], 'did:v')).toEqual([]);
    expect(m.getLatestAvailableRecordings).not.toHaveBeenCalled();
  });
});
