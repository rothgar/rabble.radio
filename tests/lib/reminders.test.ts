// tests/lib/reminders.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  upsert: vi.fn(),
  deleteMany: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ prisma: { showReminder: m } }));

import {
  getRemindedSpaceIds,
  hasReminder,
  listReminders,
  setReminder,
  takeDueReminders,
} from '@/lib/reminders';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('setReminder / hasReminder', () => {
  it('upserts when turning on and deletes when turning off', async () => {
    expect(await setReminder('sp1', 'did:a', true)).toBe(true);
    expect(m.upsert).toHaveBeenCalledWith({
      where: { spaceId_did: { spaceId: 'sp1', did: 'did:a' } },
      create: { spaceId: 'sp1', did: 'did:a' },
      update: {},
    });
    expect(await setReminder('sp1', 'did:a', false)).toBe(false);
    expect(m.deleteMany).toHaveBeenCalledWith({ where: { spaceId: 'sp1', did: 'did:a' } });
  });

  it('reports whether a reminder exists', async () => {
    m.findUnique.mockResolvedValueOnce({ spaceId: 'sp1', did: 'did:a' });
    expect(await hasReminder('sp1', 'did:a')).toBe(true);
    m.findUnique.mockResolvedValueOnce(null);
    expect(await hasReminder('sp1', 'did:a')).toBe(false);
  });
});

describe('getRemindedSpaceIds', () => {
  it('returns an empty set for anonymous viewers without querying', async () => {
    expect(await getRemindedSpaceIds(null, ['sp1'])).toEqual(new Set());
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it('returns the subset of ids with reminders', async () => {
    m.findMany.mockResolvedValueOnce([{ spaceId: 'sp2' }]);
    expect(await getRemindedSpaceIds('did:a', ['sp1', 'sp2'])).toEqual(new Set(['sp2']));
  });
});

describe('listReminders', () => {
  it('flattens the show details', async () => {
    m.findMany.mockResolvedValueOnce([
      {
        spaceId: 'sp1',
        notifiedAt: null,
        space: { id: 'sp1', title: 'T', status: 'scheduled', scheduledAt: '2026-11-08T10:00:00.000Z', isLive: 0 },
      },
    ]);
    expect(await listReminders('did:a')).toEqual([
      { spaceId: 'sp1', title: 'T', status: 'scheduled', scheduledAt: '2026-11-08T10:00:00.000Z', isLive: false, notifiedAt: null },
    ]);
  });
});

describe('takeDueReminders', () => {
  it('returns reminders for on-air shows and marks them notified', async () => {
    const NOW = new Date('2026-11-07T00:00:00Z');
    m.findMany.mockResolvedValueOnce([
      {
        spaceId: 'sp1',
        space: { id: 'sp1', title: 'Live now', host: { did: 'did:h', handle: 'h.test', displayName: null, avatarUrl: null } },
      },
    ]);
    const due = await takeDueReminders('did:a', NOW);
    expect(m.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { did: 'did:a', notifiedAt: null, space: { isLive: true } } })
    );
    expect(due).toEqual([
      { spaceId: 'sp1', title: 'Live now', host: { did: 'did:h', handle: 'h.test', displayName: null, avatarUrl: null } },
    ]);
    expect(m.updateMany).toHaveBeenCalledWith({
      where: { did: 'did:a', spaceId: { in: ['sp1'] } },
      data: { notifiedAt: NOW },
    });
  });

  it('does not write when nothing is due', async () => {
    m.findMany.mockResolvedValueOnce([]);
    expect(await takeDueReminders('did:a')).toEqual([]);
    expect(m.updateMany).not.toHaveBeenCalled();
  });
});
