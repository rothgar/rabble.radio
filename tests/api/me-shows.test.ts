// tests/api/me-shows.test.ts — GET /api/me/shows

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getHostedSpaces: vi.fn(),
  getJoinedShows: vi.fn(),
  decoratePublicSpaces: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getCurrentUser: m.getCurrentUser }));
vi.mock('@/lib/spaces', () => ({
  getHostedSpaces: m.getHostedSpaces,
  defaultPublicOrigin: () => 'https://rabble.rodeo',
  originFromRequest: (request: Request) => new URL(request.url).origin,
  toPublicSpace: (s: { id: string; title: string }, origin: string) => ({
    id: s.id,
    title: s.title,
    shareableUrl: `${origin}/show/${s.id}`,
  }),
}));
vi.mock('@/lib/metrics', () => ({ getJoinedShows: m.getJoinedShows }));
vi.mock('@/lib/space-extras', () => ({ decoratePublicSpaces: m.decoratePublicSpaces }));

import { GET } from '@/app/api/me/shows/route';

const req = () => new NextRequest('https://rabble.rodeo/api/me/shows');

beforeEach(() => {
  vi.clearAllMocks();
  m.decoratePublicSpaces.mockImplementation(async (spaces: unknown[]) =>
    spaces.map((s) => ({ ...(s as object), replay: null, reminded: false }))
  );
});

describe('GET /api/me/shows', () => {
  it('requires a session', async () => {
    m.getCurrentUser.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(m.getHostedSpaces).not.toHaveBeenCalled();
  });

  it('returns hosted shows with share URLs and joined show summaries', async () => {
    m.getCurrentUser.mockResolvedValue({ did: 'did:plc:me', handle: 'me.test' });
    m.getHostedSpaces.mockResolvedValue([{ id: 'sp1', title: 'Friday jams' }]);
    m.getJoinedShows.mockResolvedValue([
      {
        sessionId: 'sess1',
        role: 'audience',
        joinedAt: new Date('2026-11-01T10:00:00Z'),
        leftAt: null,
        stageSeconds: 0,
        session: { startedAt: new Date(), endedAt: null, durationSeconds: 0, uniqueListeners: 1 },
        space: {
          id: 'sp9',
          title: 'Other',
          status: 'live',
          isLive: true,
          tags: ['Music'],
          host: { did: 'did:plc:h', handle: 'h.test', displayName: null, avatarUrl: null },
        },
      },
    ]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { hosted: unknown[]; joined: unknown[] };
    expect(body.hosted).toEqual([
      { id: 'sp1', title: 'Friday jams', shareableUrl: 'https://rabble.rodeo/show/sp1', replay: null, reminded: false },
    ]);
    expect(m.decoratePublicSpaces).toHaveBeenCalledWith(expect.any(Array), 'did:plc:me');
    expect(body.joined).toEqual([
      {
        sessionId: 'sess1',
        role: 'audience',
        joinedAt: '2026-11-01T10:00:00.000Z',
        stageSeconds: 0,
        space: {
          id: 'sp9',
          title: 'Other',
          status: 'live',
          isLive: true,
          tags: ['Music'],
          host: { did: 'did:plc:h', handle: 'h.test', displayName: null, avatarUrl: null },
        },
      },
    ]);
  });
});
