// tests/api/reminders.test.ts — POST/GET /api/spaces/[id]/remind and GET /api/me/reminders

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSpaceById: vi.fn(),
  getSpaceBySlug: vi.fn(),
  hasReminder: vi.fn(),
  setReminder: vi.fn(),
  listReminders: vi.fn(),
  takeDueReminders: vi.fn(),
  takeDueHostFollows: vi.fn(),
  takeDueShowFollows: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getCurrentUser: m.getCurrentUser }));
vi.mock('@/lib/spaces', () => ({
  getSpaceById: m.getSpaceById,
  getSpaceBySlug: m.getSpaceBySlug,
  resolveSpace: async (id: string) => (await m.getSpaceById(id)) ?? (await m.getSpaceBySlug(id)),
}));
vi.mock('@/lib/reminders', () => ({
  hasReminder: m.hasReminder,
  setReminder: m.setReminder,
  listReminders: m.listReminders,
  takeDueReminders: m.takeDueReminders,
}));
vi.mock('@/lib/host-follows', () => ({ takeDueHostFollows: m.takeDueHostFollows }));
vi.mock('@/lib/show-follows', () => ({ takeDueShowFollows: m.takeDueShowFollows }));

import { GET as remindGet, POST as remindPost } from '@/app/api/spaces/[id]/remind/route';
import { GET as meReminders } from '@/app/api/me/reminders/route';

const ctx = { params: Promise.resolve({ id: 'sp1' }) };
const USER = { did: 'did:plc:a', handle: 'alice.test' };

beforeEach(() => {
  vi.clearAllMocks();
  m.getCurrentUser.mockResolvedValue(USER);
  m.getSpaceById.mockResolvedValue({ id: 'sp1' });
  m.takeDueHostFollows.mockResolvedValue([]);
  m.takeDueShowFollows.mockResolvedValue([]);
});

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/spaces/sp1/remind', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('/api/spaces/[id]/remind', () => {
  it('requires a session', async () => {
    m.getCurrentUser.mockResolvedValue(null);
    expect((await remindGet(new NextRequest('http://localhost/x'), ctx)).status).toBe(401);
    expect((await remindPost(post({ on: true }), ctx)).status).toBe(401);
  });

  it('404s for unknown shows (after a slug fallback)', async () => {
    m.getSpaceById.mockResolvedValue(null);
    m.getSpaceBySlug.mockResolvedValue(null);
    expect((await remindPost(post({ on: true }), ctx)).status).toBe(404);
    expect(m.getSpaceBySlug).toHaveBeenCalledWith('sp1');
  });

  it('reports the current state', async () => {
    m.hasReminder.mockResolvedValue(true);
    const res = await remindGet(new NextRequest('http://localhost/x'), ctx);
    expect(await res.json()).toEqual({ reminded: true });
  });

  it('validates the body and toggles the reminder', async () => {
    expect((await remindPost(post('{nope'), ctx)).status).toBe(400);
    expect((await remindPost(post({ on: 'yes' }), ctx)).status).toBe(400);
    m.setReminder.mockResolvedValue(true);
    const res = await remindPost(post({ on: true }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reminded: true });
    expect(m.setReminder).toHaveBeenCalledWith('sp1', USER.did, true);
  });
});

describe('GET /api/me/reminders', () => {
  it('requires a session', async () => {
    m.getCurrentUser.mockResolvedValue(null);
    expect((await meReminders(new NextRequest('http://localhost/api/me/reminders'))).status).toBe(401);
  });

  it('lists reminders by default and due ones with ?due=1', async () => {
    m.listReminders.mockResolvedValue([{ spaceId: 'sp1' }]);
    m.takeDueReminders.mockResolvedValue([{ spaceId: 'sp2', title: 'Live' }]);
    const all = await meReminders(new NextRequest('http://localhost/api/me/reminders'));
    expect(await all.json()).toEqual({ reminders: [{ spaceId: 'sp1' }] });
    const due = await meReminders(new NextRequest('http://localhost/api/me/reminders?due=1'));
    expect(await due.json()).toEqual({ due: [{ spaceId: 'sp2', title: 'Live' }] });
    expect(m.takeDueReminders).toHaveBeenCalledWith(USER.did);
    expect(m.takeDueHostFollows).toHaveBeenCalledWith(USER.did);
    expect(m.takeDueShowFollows).toHaveBeenCalledWith(USER.did);
  });

  it('merges host-follow due shows with reminder ones and drops duplicate spaceIds', async () => {
    m.takeDueReminders.mockResolvedValue([{ spaceId: 'sp2', title: 'Show reminder' }]);
    m.takeDueHostFollows.mockResolvedValue([
      { spaceId: 'sp2', title: 'Already counted' },
      { spaceId: 'sp3', title: 'Host follow' },
    ]);
    const res = await meReminders(new NextRequest('http://localhost/api/me/reminders?due=1'));
    expect(await res.json()).toEqual({
      due: [
        { spaceId: 'sp2', title: 'Show reminder' },
        { spaceId: 'sp3', title: 'Host follow' },
      ],
    });
  });

  it('answers 503 instead of hanging when a due-reminder lookup never settles', async () => {
    // The prod hang of #214: the Prisma client used to be shared across
    // requests, so one request's D1 query could carry another's lookup and
    // never settle for the request that awaited it. src/lib/db.ts now keys
    // the client per request; this bound (src/app/api/me/reminders/route.ts)
    // is the second layer so a future hang of any shape still answers.
    m.takeDueReminders.mockResolvedValue([]);
    m.takeDueHostFollows.mockReturnValue(new Promise<never[]>(() => undefined));
    vi.useFakeTimers();
    try {
      const pending = meReminders(new NextRequest('http://localhost/api/me/reminders?due=1'));
      await vi.advanceTimersByTimeAsync(10_000);
      expect((await pending).status).toBe(503);
    } finally {
      vi.useRealTimers();
    }
  });

  it('merges show-follow due shows, dropping duplicates already counted', async () => {
    m.takeDueReminders.mockResolvedValue([{ spaceId: 'sp2', title: 'Show reminder' }]);
    m.takeDueHostFollows.mockResolvedValue([{ spaceId: 'sp3', title: 'Host follow' }]);
    m.takeDueShowFollows.mockResolvedValue([
      { spaceId: 'sp2', title: 'Already counted' },
      { spaceId: 'sp4', title: 'Show follow' },
    ]);
    const res = await meReminders(new NextRequest('http://localhost/api/me/reminders?due=1'));
    expect(await res.json()).toEqual({
      due: [
        { spaceId: 'sp2', title: 'Show reminder' },
        { spaceId: 'sp3', title: 'Host follow' },
        { spaceId: 'sp4', title: 'Show follow' },
      ],
    });
  });
});
