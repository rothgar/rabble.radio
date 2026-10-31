// tests/flows/create-and-join-station.test.ts
//
// End-to-end style flow across the API route handlers: a host creates a show
// tagged with a station, the show is visible in the listing the stations page
// uses, a listener and the host join it (receiving audience / host LiveKit
// tokens), anonymous and unknown-show joins are rejected, and the host takes
// the show live.
//
// The spaces lib is replaced with an in-memory store (the real
// toPublicSpace / canonicalizeOrigin helpers are kept) so state written by one
// request is visible to the next without a database. Session, LiveKit,
// ATProto and recording helpers are mocked the same way the per-route tests
// do.

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { primaryTagOf } from '@/lib/tags';
import type { CreateSpaceInput, SpaceWithHost } from '@/lib/spaces';

const HOST = { did: 'did:plc:host123', handle: 'alice.bsky.social' };
const LISTENER = { did: 'did:plc:listener456', handle: 'bob.bsky.social' };
const STATION = 'Music';

const state = vi.hoisted(() => ({
  currentUser: null as { did: string; handle: string } | null,
  spaces: new Map<string, Record<string, unknown>>(),
  nextId: 1,
}));

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(async () => state.currentUser),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { did: string } }) => ({
        id: `u-${where.did}`,
        did: where.did,
        handle: where.did === HOST.did ? HOST.handle : LISTENER.handle,
        displayName: where.did === HOST.did ? 'Alice' : 'Bob',
        avatarUrl: null,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
      })),
    },
  },
}));

vi.mock('@/lib/spaces', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/spaces')>();

  const hostRow = (did: string) => ({
    id: `u-${did}`,
    did,
    handle: did === HOST.did ? HOST.handle : LISTENER.handle,
    displayName: did === HOST.did ? 'Alice' : 'Bob',
    avatarUrl: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  });

  const byId = async (id: string) =>
    (state.spaces.get(id) as SpaceWithHost | undefined) ?? null;

  return {
    ...actual,
    createSpace: vi.fn(async (input: CreateSpaceInput) => {
      const id = `sp${state.nextId++}`;
      const now = new Date();
      const row = {
        id,
        slug: `${input.title.toLowerCase().replace(/\s+/g, '-')}-${id}`,
        title: input.title,
        description: input.description ?? null,
        hostId: input.hostId,
        isLive: false,
        scheduledAt: null,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        emptySince: now,
        status: 'active',
        listenerCount: 0,
        speakerCount: 0,
        reactionCount: 0,
        tags: input.tags ?? [],
        createdAt: now,
        updatedAt: now,
        host: hostRow(input.hostId),
      };
      state.spaces.set(id, row);
      return row;
    }),
    getSpaces: vi.fn(async () => Array.from(state.spaces.values())),
    getSpacesForUser: vi.fn(async () => Array.from(state.spaces.values())),
    getSpaceById: vi.fn(byId),
    getSpaceBySlug: vi.fn(async (slug: string) =>
      Array.from(state.spaces.values()).find((s) => s.slug === slug) ?? null
    ),
    resolveSpaceForUser: vi.fn(async (identifier: string, userDid: string) => {
      const space = await byId(identifier);
      if (!space) return null;
      return { space, isHost: space.hostId === userDid };
    }),
    setSpaceLive: vi.fn(async (id: string, isLive: boolean) => {
      const row = state.spaces.get(id);
      if (!row) throw new Error(`no space ${id}`);
      const next = { ...row, isLive, status: isLive ? 'live' : 'active' };
      state.spaces.set(id, next);
      return next;
    }),
    tryExpireStaleSpaces: vi.fn(async () => 0),
  };
});

vi.mock('@/lib/livekit', () => ({
  createRoom: vi.fn(async () => undefined),
  getLiveKitClient: vi.fn(() => ({})),
  generateToken: vi.fn(
    async (input: { room: string; identity: string; role: string }) => ({
      token: `tok-${input.role}-${input.identity}`,
      wsUrl: 'wss://rabble-livekit.example',
    })
  ),
  createHostToken: vi.fn(async () => ({
    token: 'tok-host',
    wsUrl: 'wss://rabble-livekit.example',
  })),
  roomNameForSpace: (id: string) => `space-${id}`,
  startRecording: vi.fn(async () => null),
  LiveKitConfigError: class LiveKitConfigError extends Error {},
}));

vi.mock('@/lib/atproto', () => ({
  publishLiveStatus: vi.fn(async () => ({ ok: true, uri: 'at://live/1' })),
  deleteLiveStatus: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/recording', () => ({
  createRecording: vi.fn(async () => null),
  findActiveRecordingForSpace: vi.fn(async () => null),
  buildRecordingKey: vi.fn(() => 'recordings/key.ogg'),
}));

function jsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('flow: host creates a station show, users join, host goes live', () => {
  let showId = '';

  beforeAll(() => {
    state.spaces.clear();
    state.nextId = 1;
  });

  it('host creates a show tagged with the station', async () => {
    state.currentUser = HOST;
    const { POST } = await import('@/app/api/spaces/route');
    const res = await POST(
      jsonRequest('http://localhost/api/spaces', {
        title: 'Friday jams',
        description: 'Records and chat',
        tags: [STATION, 'Sports'],
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    showId = body.space.id;
    expect(showId).toBeTruthy();
    expect(body.space.tags).toEqual([STATION, 'Sports']);
    expect(body.space.host.handle).toBe(HOST.handle);
    expect(body.space.isLive).toBe(false);
    // The origin is canonicalized from PUBLIC_URL (loopback hosts are
    // replaced), so only assert the path.
    expect(body.space.shareableUrl).toMatch(new RegExp(`/show/${showId}$`));
  });

  it('the show is listed under its station for the stations page', async () => {
    const { getSpacesForUser, toPublicSpace } = await import('@/lib/spaces');
    const shows = (await getSpacesForUser(LISTENER.did)).map((s) =>
      toPublicSpace(s)
    );
    expect(shows).toHaveLength(1);
    expect(shows[0].id).toBe(showId);
    // primaryTagOf picks the earliest category in the canonical list, which
    // is how the stations page groups shows; Music sorts before Sports.
    expect(primaryTagOf(shows[0].tags)).toBe(STATION);
    expect(shows[0].tags).toContain(STATION);
  });

  it('GET /api/spaces returns the show to an anonymous viewer', async () => {
    state.currentUser = null;
    const { GET } = await import('@/app/api/spaces/route');
    const res = await GET(new NextRequest('http://localhost/api/spaces'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.spaces.map((s: { id: string }) => s.id)).toEqual([showId]);
  });

  it('a visitor without an account joins as an anonymous listener', async () => {
    state.currentUser = null;
    const { POST } = await import('@/app/api/spaces/[id]/join/route');
    const res = await POST(
      new NextRequest(`http://localhost/api/spaces/${showId}/join`, {
        method: 'POST',
      }),
      params(showId)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.anonymous).toBe(true);
    expect(body.role).toBe('audience');
    expect(body.identity).toMatch(/^anon:/);
    expect(body.token).toBe(`tok-audience-${body.identity}`);
  });

  it('an anonymous visitor cannot take the show live', async () => {
    state.currentUser = null;
    const { POST } = await import('@/app/api/spaces/[id]/live/route');
    const res = await POST(
      jsonRequest(`http://localhost/api/spaces/${showId}/live`, {
        action: 'start',
      }),
      params(showId)
    );
    expect(res.status).toBe(401);
  });

  it('a signed-in listener joins as audience and receives a token', async () => {
    state.currentUser = LISTENER;
    const { POST } = await import('@/app/api/spaces/[id]/join/route');
    const res = await POST(
      new NextRequest(`http://localhost/api/spaces/${showId}/join`, {
        method: 'POST',
      }),
      params(showId)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('audience');
    expect(body.token).toBe(`tok-audience-${LISTENER.did}`);
    expect(body.wsUrl).toBe('wss://rabble-livekit.example');
    expect(body.roomName).toBe(`space-${showId}`);
    expect(body.identity).toBe(LISTENER.did);
    expect(body.handle).toBe(LISTENER.handle);
  });

  it('the host joins as host', async () => {
    state.currentUser = HOST;
    const { POST } = await import('@/app/api/spaces/[id]/join/route');
    const res = await POST(
      new NextRequest(`http://localhost/api/spaces/${showId}/join`, {
        method: 'POST',
      }),
      params(showId)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('host');
    expect(body.token).toBe(`tok-host-${HOST.did}`);
  });

  it('joining by slug also works', async () => {
    state.currentUser = LISTENER;
    const { getSpaceById } = await import('@/lib/spaces');
    const row = await getSpaceById(showId);
    expect(row).not.toBeNull();
    const { POST } = await import('@/app/api/spaces/[id]/join/route');
    const res = await POST(
      new NextRequest(`http://localhost/api/spaces/${row!.slug}/join`, {
        method: 'POST',
      }),
      params(row!.slug)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.roomName).toBe(`space-${showId}`);
  });

  it('joining a show that does not exist returns 404', async () => {
    state.currentUser = LISTENER;
    const { POST } = await import('@/app/api/spaces/[id]/join/route');
    const res = await POST(
      new NextRequest('http://localhost/api/spaces/nope/join', {
        method: 'POST',
      }),
      params('nope')
    );
    expect(res.status).toBe(404);
  });

  it('a listener cannot take the show live', async () => {
    state.currentUser = LISTENER;
    const { POST } = await import('@/app/api/spaces/[id]/live/route');
    const res = await POST(
      jsonRequest(`http://localhost/api/spaces/${showId}/live`, {
        action: 'start',
      }),
      params(showId)
    );
    expect(res.status).toBe(403);
    const { getSpaceById } = await import('@/lib/spaces');
    expect((await getSpaceById(showId))!.isLive).toBe(false);
  });

  it('the host takes the show live and the listing reflects it', async () => {
    state.currentUser = HOST;
    const { POST } = await import('@/app/api/spaces/[id]/live/route');
    const res = await POST(
      jsonRequest(`http://localhost/api/spaces/${showId}/live`, {
        action: 'start',
      }),
      params(showId)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.space.isLive).toBe(true);

    const { getSpacesForUser, toPublicSpace } = await import('@/lib/spaces');
    const shows = (await getSpacesForUser(null)).map((s) => toPublicSpace(s));
    expect(shows[0].isLive).toBe(true);
    expect(shows[0].status).toBe('live');
  });

  it('the host ends the show', async () => {
    state.currentUser = HOST;
    const { POST } = await import('@/app/api/spaces/[id]/live/route');
    const res = await POST(
      jsonRequest(`http://localhost/api/spaces/${showId}/live`, {
        action: 'end',
      }),
      params(showId)
    );
    expect(res.status).toBe(200);
    const { getSpaceById } = await import('@/lib/spaces');
    expect((await getSpaceById(showId))!.isLive).toBe(false);
  });
});
