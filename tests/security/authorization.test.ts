// tests/security/authorization.test.ts
//
// Consolidated security/authorization tests. Verifies:
//   - LiveKit audience tokens cannot publish audio (canPublish === false).
//   - LiveKit speaker/host tokens can publish audio (canPublish === true).
//   - Non-host users cannot POST /api/spaces/:id/posts (403).
//   - Non-host users cannot POST /api/spaces/:id/live (403).
//   - Non-host users cannot invoke host-only stage actions (403).
//   - OAuth callback with mismatched state returns 400.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Hoisted mocks
const {
  mockGetCurrentUser,
  mockResolveSpaceForUser,
  mockGetSpaceById,
  mockGetSpaceBySlug,
  mockInviteToStage,
  mockAcceptStageInvite,
  mockLeaveStage,
  mockRemoveFromStage,
  mockSetSpaceLive,
  mockPublishLiveStatus,
  mockDeleteLiveStatus,
  mockCreateSpacePost,
  mockFetchPostView,
  mockResolvePostUrl,
  mockUpsert,
  mockGetProfile,
  mockAuthorize,
  mockCallback,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockResolveSpaceForUser: vi.fn(),
  mockGetSpaceById: vi.fn(),
  mockGetSpaceBySlug: vi.fn(),
  mockInviteToStage: vi.fn(),
  mockAcceptStageInvite: vi.fn(),
  mockLeaveStage: vi.fn(),
  mockRemoveFromStage: vi.fn(),
  mockSetSpaceLive: vi.fn(),
  mockPublishLiveStatus: vi.fn(),
  mockDeleteLiveStatus: vi.fn(),
  mockCreateSpacePost: vi.fn(),
  mockFetchPostView: vi.fn(),
  mockResolvePostUrl: vi.fn(),
  mockUpsert: vi.fn(),
  mockGetProfile: vi.fn(),
  mockAuthorize: vi.fn(),
  mockCallback: vi.fn(),
}));

// @/lib/session uses cookies() + iron-session, which are mocked below. Mock
// getCurrentUser (which the auth helper inspects) but preserve the real
// getSession/setSession so OAuth state flows through the cookieJar.
vi.mock('@/lib/session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/session')>(
    '@/lib/session'
  );
  return { ...actual, getCurrentUser: mockGetCurrentUser };
});

vi.mock('@/lib/spaces', () => ({
  resolveSpaceForUser: mockResolveSpaceForUser,
  setSpaceLive: mockSetSpaceLive,
  getSpaceById: mockGetSpaceById,
  getSpaceBySlug: mockGetSpaceBySlug,
}));

vi.mock('@/lib/atproto', () => ({
  publishLiveStatus: mockPublishLiveStatus,
  deleteLiveStatus: mockDeleteLiveStatus,
}));

vi.mock('@/lib/posts', () => ({
  createSpacePost: mockCreateSpacePost,
}));

vi.mock('@/lib/bsky', () => ({
  fetchPostView: mockFetchPostView,
  resolvePostUrl: mockResolvePostUrl,
}));

vi.mock('@/lib/stage', () => ({
  inviteToStage: mockInviteToStage,
  acceptStageInvite: mockAcceptStageInvite,
  leaveStage: mockLeaveStage,
  removeFromStage: mockRemoveFromStage,
  StageError: class StageError extends Error {
    code: string;
    status: number;
    constructor(code: string, status: number, message: string) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

vi.mock('@/lib/auth', () => ({
  getOAuthClient: () => ({
    authorize: mockAuthorize,
    callback: mockCallback,
  }),
  oauthMode: () => 'loopback',
  appName: 'Rabble',
}));

vi.mock('@/lib/db', () => ({
  prisma: { user: { upsert: mockUpsert } },
}));

vi.mock('@atproto/api', () => ({
  Agent: class {
    getProfile = mockGetProfile;
  },
}));

// Stub iron-session with an in-memory store so we can drive OAuth callback
// state-mismatch flows.
const cookieJar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => {
    const read = (name: string) => {
      const value = cookieJar.get(name);
      return value ? { name, value } : undefined;
    };
    const all = () =>
      Array.from(cookieJar.entries()).map(([name, value]) => ({ name, value }));
    return {
      get: read,
      set: (cookie: { name: string; value: string }) =>
        cookieJar.set(cookie.name, cookie.value),
      delete: (name: string) => cookieJar.delete(name),
      getAll: all,
      has: (name: string) => cookieJar.has(name),
      [Symbol.iterator]: all()[Symbol.iterator],
    };
  },
}));

vi.mock('iron-session', () => ({
  getIronSession: async () => {
    const SESSION_KEY = 'bs_spaces_session';
    const raw = cookieJar.get(SESSION_KEY);
    let data: Record<string, unknown> = {};
    if (raw) {
      try {
        data = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
      } catch {
        data = {};
      }
    }
    const persist = () => {
      cookieJar.set(
        SESSION_KEY,
        Buffer.from(JSON.stringify(data), 'utf8').toString('base64')
      );
    };
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_t, prop) {
        if (prop === 'save') return persist;
        if (prop === 'destroy') {
          return () => {
            data = {};
            cookieJar.delete(SESSION_KEY);
          };
        }
        if (typeof prop === 'string') return data[prop];
        return undefined;
      },
      set(_t, prop, value) {
        if (typeof prop === 'string') data[prop] = value;
        return true;
      },
      deleteProperty(_t, prop) {
        if (typeof prop === 'string') delete data[prop];
        return true;
      },
      has(_t, prop) {
        return typeof prop === 'string' && prop in data;
      },
    };
    return new Proxy({ save: persist, destroy: () => {
      data = {};
      cookieJar.delete(SESSION_KEY);
    } }, handler);
  },
}));

beforeEach(() => {
  cookieJar.clear();
  vi.resetAllMocks();
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? 'a'.repeat(64);
  process.env.LIVEKIT_URL = 'ws://livekit:7880';
  process.env.LIVEKIT_API_KEY = 'devkey';
  process.env.LIVEKIT_API_SECRET = 'a'.repeat(32);
});

// ---------------------------------------------------------------------------
// LiveKit token grant checks
// ---------------------------------------------------------------------------

describe('LiveKit token grants', () => {
  it('audience token has canPublish=false', async () => {
    const { generateToken } = await import('@/lib/livekit');
    const { token } = await generateToken({
      room: 'space-sp1',
      identity: 'did:plc:listener',
      role: 'audience',
    });
    expect(token).toBeTruthy();
    // JWT payload is base64url-encoded JSON in segment [1].
    const payloadB64 = token.split('.')[1];
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64').toString('utf8')
    ) as { video?: { canPublish?: boolean; canSubscribe?: boolean } };
    expect(payload.video?.canPublish).toBe(false);
    expect(payload.video?.canSubscribe).toBe(true);
  });

  it('speaker token has canPublish=true', async () => {
    const { generateToken } = await import('@/lib/livekit');
    const { token } = await generateToken({
      room: 'space-sp1',
      identity: 'did:plc:speaker',
      role: 'speaker',
    });
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64').toString('utf8')
    ) as { video?: { canPublish?: boolean; canSubscribe?: boolean } };
    expect(payload.video?.canPublish).toBe(true);
    expect(payload.video?.canSubscribe).toBe(true);
  });

  it('host token has canPublish=true', async () => {
    const { generateToken } = await import('@/lib/livekit');
    const { token } = await generateToken({
      room: 'space-sp1',
      identity: 'did:plc:host',
      role: 'host',
    });
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64').toString('utf8')
    ) as { video?: { canPublish?: boolean; canSubscribe?: boolean } };
    expect(payload.video?.canPublish).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Host-only route authorization (non-host returns 403)
// ---------------------------------------------------------------------------

function makeSpace() {
  return {
    id: 'sp1',
    slug: 'room',
    title: 'Room',
    description: null,
    hostId: 'did:plc:host123',
    isLive: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    host: {
      did: 'did:plc:host123',
      handle: 'alice.bsky.social',
      displayName: 'Alice',
      avatarUrl: null,
    },
  };
}

function jsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/spaces/[id]/posts — host only', () => {
  it('returns 403 when non-host tries to share', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:listener',
      handle: 'bob.bsky.social',
    });
    mockResolveSpaceForUser.mockResolvedValueOnce({
      space: makeSpace(),
      isHost: false,
    });
    const { POST } = await import('@/app/api/spaces/[id]/posts/route');
    const res = await POST(
      jsonRequest('http://localhost/api/spaces/sp1/posts', {
        postUrl: 'https://bsky.app/profile/alice.bsky.social/post/abc',
      }),
      { params: Promise.resolve({ id: 'sp1' }) }
    );
    expect(res.status).toBe(403);
  });
});

describe('POST /api/spaces/[id]/live — host only', () => {
  it('returns 403 when non-host tries to start live', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:listener',
      handle: 'bob.bsky.social',
    });
    mockResolveSpaceForUser.mockResolvedValueOnce({
      space: makeSpace(),
      isHost: false,
    });
    const { POST } = await import('@/app/api/spaces/[id]/live/route');
    const res = await POST(
      jsonRequest('http://localhost/api/spaces/sp1/live', { action: 'start' }),
      { params: Promise.resolve({ id: 'sp1' }) }
    );
    expect(res.status).toBe(403);
  });
});

describe('POST /api/spaces/[id]/stage — host-only actions', () => {
  it('returns 403 when non-host tries to invite', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:listener',
      handle: 'bob.bsky.social',
    });
    // The stage route uses the lib/stage service which throws StageError with
    // status=403 when called by a non-host for host-only actions.
    const { StageError } = await import('@/lib/stage');
    mockInviteToStage.mockRejectedValueOnce(
      new (StageError as unknown as new (
        code: string,
        status: number,
        msg: string
      ) => Error)('forbidden', 403, 'Only the host can invite speakers.')
    );
    const { POST } = await import('@/app/api/spaces/[id]/stage/route');
    const res = await POST(
      jsonRequest('http://localhost/api/spaces/sp1/stage', {
        action: 'invite',
        targetIdentity: 'did:plc:listener2',
      }),
      { params: Promise.resolve({ id: 'sp1' }) }
    );
    expect(res.status).toBe(403);
  });

  it('returns 403 when non-host tries to remove a speaker', async () => {
    mockGetCurrentUser.mockResolvedValueOnce({
      did: 'did:plc:listener',
      handle: 'bob.bsky.social',
    });
    const { StageError } = await import('@/lib/stage');
    mockRemoveFromStage.mockRejectedValueOnce(
      new (StageError as unknown as new (
        code: string,
        status: number,
        msg: string
      ) => Error)('forbidden', 403, 'Only the host can remove speakers.')
    );
    const { POST } = await import('@/app/api/spaces/[id]/stage/route');
    const res = await POST(
      jsonRequest('http://localhost/api/spaces/sp1/stage', {
        action: 'remove',
        targetIdentity: 'did:plc:speaker',
      }),
      { params: Promise.resolve({ id: 'sp1' }) }
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// OAuth state-mismatch rejection
// ---------------------------------------------------------------------------

describe('GET /api/auth/bluesky/callback — state mismatch', () => {
  it('returns 400 when state does not match session', async () => {
    cookieJar.set(
      'bs_spaces_session',
      Buffer.from(JSON.stringify({ oauthState: 'expected' }), 'utf8').toString('base64')
    );
    const { GET } = await import('@/app/api/auth/bluesky/callback/route');
    const req = new NextRequest(
      'http://localhost/api/auth/bluesky/callback?code=abc&state=wrong'
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('oauth_state_mismatch');
  });
});
