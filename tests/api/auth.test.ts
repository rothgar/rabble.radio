// tests/api/auth.test.ts
//
// Exercises the auth flow handlers with the OAuth client mocked. Confirms that
// - /api/auth/bluesky redirects to an authorize URL
// - /api/auth/bluesky/callback persists a User row and sets the session cookie
// - /api/auth/logout clears the cookie and redirects to "/"
// - /api/me returns the current user or 401

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Hoisted mocks
const {
  mockAuthorize,
  mockCallback,
  mockRevoke,
  mockRestore,
  mockUpsert,
  mockGetProfile,
} = vi.hoisted(() => {
  return {
    mockAuthorize: vi.fn(),
    mockCallback: vi.fn(),
    mockRevoke: vi.fn(),
    mockRestore: vi.fn(),
    mockUpsert: vi.fn(),
    mockGetProfile: vi.fn(),
  };
});

vi.mock('@/lib/auth', () => {
  return {
    getOAuthClient: () => ({
      authorize: mockAuthorize,
      callback: mockCallback,
      revoke: mockRevoke,
      restore: mockRestore,
    }),
    oauthMode: () => 'loopback',
    appName: 'Rabble',
  };
});

vi.mock('@/lib/db', () => {
  const user = {
    upsert: mockUpsert,
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  };
  return {
    prisma: { user },
  };
});

vi.mock('@atproto/api', () => {
  return {
    Agent: class {
      getProfile = mockGetProfile;
    },
  };
});

// Stub iron-session with an in-memory store so we can introspect saves.
const cookieJar = new Map<string, string>();
vi.mock('next/headers', () => {
  return {
    cookies: async () => {
      const read = (name: string) => {
        const value = cookieJar.get(name);
        return value ? { name, value } : undefined;
      };
      const write = (
        name: string,
        value: string,
        opts: { maxAge?: number; path?: string; httpOnly?: boolean; sameSite?: string; secure?: boolean } = {}
      ) => {
        if (!value) {
          cookieJar.delete(name);
          return;
        }
        cookieJar.set(name, value);
        void opts;
      };
      const all = () =>
        Array.from(cookieJar.entries()).map(([name, value]) => ({ name, value }));
      return {
        get: read,
        set: (cookie: { name: string; value: string }) =>
          write(cookie.name, cookie.value),
        delete: (name: string) => cookieJar.delete(name),
        getAll: all,
        has: (name: string) => cookieJar.has(name),
        [Symbol.iterator]: all()[Symbol.iterator],
      };
    },
  };
});

// We also need to stub iron-session itself because Next's cookies stub doesn't
// implement the sealed cookie store it expects. We use a Proxy so the route
// handler can read/write arbitrary keys (e.g. `oauthState`, `bluesky`).
vi.mock('iron-session', () => {
  return {
    getIronSession: async () => {
      const SESSION_KEY = 'bs_spaces_session';
      const raw = cookieJar.get(SESSION_KEY);
      let data: Record<string, unknown> = {};
      if (raw) {
        try {
          data = JSON.parse(
            Buffer.from(raw, 'base64').toString('utf8')
          ) as Record<string, unknown>;
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
        get(_target, prop) {
          if (prop === 'save') return persist;
          if (prop === 'destroy') {
            return () => {
              data = {};
              cookieJar.delete(SESSION_KEY);
            };
          }
          if (typeof prop === 'string') {
            return data[prop];
          }
          return undefined;
        },
        set(_target, prop, value) {
          if (typeof prop === 'string') {
            data[prop] = value;
          }
          return true;
        },
        deleteProperty(_target, prop) {
          if (typeof prop === 'string') {
            delete data[prop];
          }
          return true;
        },
        has(_target, prop) {
          return typeof prop === 'string' && prop in data;
        },
      };
      const session = new Proxy<Record<string, unknown>>({}, handler);
      // Auto-persist on mutations performed via simple assignment.
      // The Proxy `set` trap mutates `data`, so we wrap save() to also be called
      // when the handler sets properties by re-reading from `data`. To keep
      // test ergonomics simple, we just expose `save` explicitly.
      void session;
      // Return the proxy directly; callers either use the explicit `save()`
      // method or use a typed session.
      return new Proxy(
        {
          save: persist,
          destroy: () => {
            data = {};
            cookieJar.delete(SESSION_KEY);
          },
        },
        handler
      );
    },
  };
});

beforeEach(() => {
  cookieJar.clear();
  vi.clearAllMocks();
  process.env.SESSION_SECRET =
    process.env.SESSION_SECRET ?? 'a'.repeat(64);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/auth/bluesky', () => {
  it('redirects to an authorize URL on success', async () => {
    const targetUrl = new URL('https://pds.local/authorize?x=1');
    mockAuthorize.mockResolvedValueOnce(targetUrl);

    const { GET } = await import('@/app/api/auth/bluesky/route');
    const req = new NextRequest('http://localhost/api/auth/bluesky?handle=alice.bsky.social');
    const res = await GET(req);

    expect(mockAuthorize).toHaveBeenCalledOnce();
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(targetUrl.toString());
  });

  it('returns 400 when handle is missing', async () => {
    const { GET } = await import('@/app/api/auth/bluesky/route');
    const req = new NextRequest('http://localhost/api/auth/bluesky');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when handle contains invalid characters', async () => {
    const { GET } = await import('@/app/api/auth/bluesky/route');
    const req = new NextRequest(
      'http://localhost/api/auth/bluesky?handle=' + encodeURIComponent('bad space')
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/bluesky/callback', () => {
  it('upserts the user and sets the session cookie', async () => {
    mockCallback.mockResolvedValueOnce({
      session: { sub: 'did:plc:abc', did: () => 'did:plc:abc' },
      state: null,
    });
    mockGetProfile.mockResolvedValueOnce({
      data: {
        did: 'did:plc:abc',
        handle: 'alice.bsky.social',
        displayName: 'Alice',
        avatar: 'https://cdn.local/avatar.png',
      },
    });
    mockUpsert.mockResolvedValueOnce({
      id: 'u1',
      did: 'did:plc:abc',
      handle: 'alice.bsky.social',
      displayName: 'Alice',
      avatarUrl: 'https://cdn.local/avatar.png',
    });

    const { GET } = await import('@/app/api/auth/bluesky/callback/route');
    const req = new NextRequest(
      'http://localhost/api/auth/bluesky/callback?code=abc&state=s1'
    );
    const res = await GET(req);

    expect(mockCallback).toHaveBeenCalledOnce();
    expect(mockUpsert).toHaveBeenCalledOnce();
    expect(mockUpsert.mock.calls[0][0]).toMatchObject({
      where: { did: 'did:plc:abc' },
      create: {
        did: 'did:plc:abc',
        handle: 'alice.bsky.social',
        displayName: 'Alice',
        avatarUrl: 'https://cdn.local/avatar.png',
      },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/spaces');
    expect(cookieJar.get('bs_spaces_session')).toBeTruthy();
  });

  it('returns 400 when state does not match', async () => {
    // Pre-populate the session with a different state
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
  });
});

describe('GET /api/auth/logout', () => {
  it('clears the session cookie and redirects to /', async () => {
    cookieJar.set(
      'bs_spaces_session',
      Buffer.from(JSON.stringify({ bluesky: { did: 'did:plc:abc' } }), 'utf8').toString('base64')
    );

    const { GET } = await import('@/app/api/auth/logout/route');
    const req = new NextRequest('http://localhost/api/auth/logout');
    const res = await GET(req);

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('http://localhost/');
    expect(cookieJar.has('bs_spaces_session')).toBe(false);
  });
});

describe('GET /api/me', () => {
  it('returns the authenticated user', async () => {
    cookieJar.set(
      'bs_spaces_session',
      Buffer.from(
        JSON.stringify({ bluesky: { did: 'did:plc:abc', handle: 'alice.bsky.social' } }),
        'utf8'
      ).toString('base64')
    );

    const findUnique = (await import('@/lib/db')).prisma.user.findUnique as ReturnType<typeof vi.fn>;
    findUnique.mockResolvedValueOnce({
      id: 'u1',
      did: 'did:plc:abc',
      handle: 'alice.bsky.social',
      displayName: 'Alice',
      avatarUrl: 'https://cdn.local/avatar.png',
    });

    const { GET } = await import('@/app/api/me/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      did: 'did:plc:abc',
      handle: 'alice.bsky.social',
      displayName: 'Alice',
    });
  });

  it('returns 401 when no session', async () => {
    const { GET } = await import('@/app/api/me/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
