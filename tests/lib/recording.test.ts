// tests/lib/recording.test.ts
//
// Recording service on the Prisma model API: row mapping (D1 hands back
// strings for dates), podcast publishing and the expiry sweep.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  create: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  deleteObject: vi.fn(async () => true),
  getObjectSize: vi.fn(async () => 1234),
  getSignedDownloadUrl: vi.fn(async () => 'https://signed.example/file'),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    recording: {
      create: m.create,
      findFirst: m.findFirst,
      findMany: m.findMany,
      findUnique: m.findUnique,
      update: m.update,
      updateMany: m.updateMany,
    },
  },
}));

vi.mock('@/lib/storage', () => ({
  deleteObject: m.deleteObject,
  getObjectSize: m.getObjectSize,
  getSignedDownloadUrl: m.getSignedDownloadUrl,
  getStorageConfig: () => ({ bucket: 'rabble-dev-recordings' }),
}));

import {
  buildRecordingKey,
  createRecording,
  expireOldRecordings,
  getPublishedEpisodesForHost,
  getRecordingById,
  RecordingStateError,
  setRecordingPublished,
  toPublicRecording,
} from '@/lib/recording';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rec1',
    spaceId: 'sp1',
    egressId: 'eg1',
    status: 'available',
    startedAt: '2026-11-01T10:00:00.000Z',
    endedAt: '2026-11-01T11:00:00.000Z',
    expiresAt: '2026-12-01T10:00:00.000Z',
    s3Key: 'recordings/space-sp1-1.mp4',
    s3Bucket: 'rabble-dev-recordings',
    contentType: 'video/mp4',
    sizeBytes: 1234,
    downloadUrl: null,
    hostDid: 'did:plc:host',
    published: 0,
    publishedAt: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T11:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildRecordingKey', () => {
  it('sanitises the room name and appends the timestamp', () => {
    expect(buildRecordingKey('space/evil', new Date(5))).toBe('recordings/space_evil-5.mp4');
  });
});

describe('row mapping', () => {
  it('coerces string dates and numeric booleans from D1', async () => {
    m.findUnique.mockResolvedValueOnce(row({ published: 1, publishedAt: '2026-11-02T00:00:00.000Z' }));
    const rec = await getRecordingById('rec1');
    expect(rec?.startedAt).toBeInstanceOf(Date);
    expect(rec?.published).toBe(true);
    expect(rec?.publishedAt?.toISOString()).toBe('2026-11-02T00:00:00.000Z');
    const pub = toPublicRecording(rec!);
    expect(pub.startedAt).toBe('2026-11-01T10:00:00.000Z');
    expect(pub.published).toBe(true);
  });
});

describe('createRecording', () => {
  it('inserts a starting row with the default bucket and 30-day expiry', async () => {
    const now = new Date('2026-11-01T10:00:00Z');
    m.create.mockImplementationOnce(async ({ data }: { data: Record<string, unknown> }) =>
      row({ ...data, id: 'new', status: 'starting', published: false })
    );
    const rec = await createRecording({
      spaceId: 'sp1',
      hostDid: 'did:plc:host',
      egressId: 'eg9',
      s3Key: 'recordings/x.mp4',
      contentType: 'video/mp4',
      now,
    });
    expect(rec.status).toBe('starting');
    expect(rec.s3Bucket).toBe('rabble-dev-recordings');
    const data = m.create.mock.calls[0][0].data;
    expect(data.expiresAt.getTime() - now.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe('setRecordingPublished', () => {
  it('publishes an available recording and stamps publishedAt once', async () => {
    const now = new Date('2026-11-03T00:00:00Z');
    m.findUnique.mockResolvedValueOnce(row());
    m.update.mockImplementationOnce(async ({ data }: { data: Record<string, unknown> }) =>
      row({ ...data })
    );
    const rec = await setRecordingPublished('rec1', true, now);
    expect(rec?.published).toBe(true);
    expect(m.update).toHaveBeenCalledWith({
      where: { id: 'rec1' },
      data: { published: true, publishedAt: now },
    });
  });

  it('unpublishing clears publishedAt', async () => {
    m.findUnique.mockResolvedValueOnce(row({ published: 1, publishedAt: '2026-11-02T00:00:00.000Z' }));
    m.update.mockImplementationOnce(async ({ data }: { data: Record<string, unknown> }) => row(data));
    const rec = await setRecordingPublished('rec1', false);
    expect(rec?.published).toBe(false);
    expect(m.update.mock.calls[0][0].data).toEqual({ published: false, publishedAt: null });
  });

  it('refuses to publish a recording that is not available', async () => {
    m.findUnique.mockResolvedValueOnce(row({ status: 'starting' }));
    await expect(setRecordingPublished('rec1', true)).rejects.toBeInstanceOf(RecordingStateError);
    expect(m.update).not.toHaveBeenCalled();
  });

  it('returns null for an unknown recording', async () => {
    m.findUnique.mockResolvedValueOnce(null);
    expect(await setRecordingPublished('nope', true)).toBeNull();
  });
});

describe('getPublishedEpisodesForHost', () => {
  it('returns recordings with their station details', async () => {
    m.findMany.mockResolvedValueOnce([
      {
        ...row({ published: 1 }),
        space: { id: 'sp1', title: 'Friday jams', description: null, tags: [{ tag: 'Music' }] },
      },
    ]);
    const episodes = await getPublishedEpisodesForHost('did:plc:host');
    expect(episodes).toHaveLength(1);
    expect(episodes[0].space).toEqual({
      id: 'sp1',
      title: 'Friday jams',
      description: null,
      tags: ['Music'],
    });
    expect(episodes[0].recording.published).toBe(true);
    expect(m.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { hostDid: 'did:plc:host', published: true, status: 'available' },
      })
    );
  });
});

describe('expireOldRecordings', () => {
  it('deletes the object and marks unpublished rows expired', async () => {
    m.findMany.mockResolvedValueOnce([row()]);
    const n = await expireOldRecordings(new Date('2027-01-01T00:00:00Z'));
    expect(n).toBe(1);
    expect(m.deleteObject).toHaveBeenCalledWith('recordings/space-sp1-1.mp4', 'rabble-dev-recordings');
    expect(m.update).toHaveBeenCalledWith({
      where: { id: 'rec1' },
      data: { status: 'expired', downloadUrl: null },
    });
    // Published episodes are excluded by the query itself.
    expect(m.findMany.mock.calls[0][0].where.published).toBe(false);
  });
});
