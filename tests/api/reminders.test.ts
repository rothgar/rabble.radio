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
}));

vi.mock('@/lib/session', () => ({ getCurrentUser: m.getCurrentUser }));
vi.mock('@/lib/spaces', () => ({ getSpaceById: m.getSpaceById, getSpaceBySlug: m.getSpaceBySlug }));
vi.mock('@/lib/reminders', () => ({
  hasReminder: m.hasReminder,
  setReminder: m.setReminder,
  listReminders: m.listReminders,
  takeDueReminders: m.takeDueReminders,
}));

import { GET as remindGet, POST as remindPost } from '@/app/api/spaces/[id]/remind/route';
import { GET as meReminders } from '@/app/api/me/reminders/route';

const ctx = { params: Promise.resolve({ id: 'sp1' }) };
const USER = { did: 'did:plc:a', handle: 'alice.test' };

beforeEach(() => {
  vi.clearAllMocks();
  m.getCurrentUser.mockResolvedValue(USER);
  m.getSpaceById.mockResolvedValue({ id: 'sp1' });
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
  });
});
