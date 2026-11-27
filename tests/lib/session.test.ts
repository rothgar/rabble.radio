// tests/lib/session.test.ts
//
// getCurrentUser reads the session cookie and, once a DID is present, checks
// the User row's bannedAt so a platform ban (src/lib/admin.ts) takes effect
// on the very next request even for an already-signed-in browser.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFindUnique } = vi.hoisted(() => ({ mockFindUnique: vi.fn() }));

vi.mock('@/lib/db', () => ({ prisma: { user: { findUnique: mockFindUnique } } }));

const cookieJar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value ? { name, value } : undefined;
    },
    set: () => undefined,
    delete: () => undefined,
  }),
}));

vi.mock('iron-session', () => ({
  getIronSession: async () => {
    const raw = cookieJar.get('bs_spaces_session');
    const data: Record<string, unknown> = raw ? JSON.parse(raw) : {};
    return new Proxy(data, {
      get(target, prop) {
        if (prop === 'save' || prop === 'destroy') return () => undefined;
        return target[prop as string];
      },
    });
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  cookieJar.clear();
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? 'a'.repeat(64);
});

describe('getCurrentUser', () => {
  it('returns null when there is no session', async () => {
    const { getCurrentUser } = await import('@/lib/session');
    expect(await getCurrentUser()).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('returns the session user when not banned', async () => {
    cookieJar.set('bs_spaces_session', JSON.stringify({ bluesky: { did: 'did:plc:a', handle: 'alice.test' } }));
    mockFindUnique.mockResolvedValueOnce({ bannedAt: null, displayName: null });
    const { getCurrentUser } = await import('@/lib/session');
    expect(await getCurrentUser()).toEqual({ did: 'did:plc:a', handle: 'alice.test', displayName: null });
  });

  it('includes the display name when the user row has one', async () => {
    cookieJar.set('bs_spaces_session', JSON.stringify({ bluesky: { did: 'did:plc:a', handle: 'alice.test' } }));
    mockFindUnique.mockResolvedValueOnce({ bannedAt: null, displayName: 'Alice Example' });
    const { getCurrentUser } = await import('@/lib/session');
    expect(await getCurrentUser()).toEqual({
      did: 'did:plc:a',
      handle: 'alice.test',
      displayName: 'Alice Example',
    });
  });

  it('returns null for a banned did even with a valid session cookie', async () => {
    cookieJar.set('bs_spaces_session', JSON.stringify({ bluesky: { did: 'did:plc:a', handle: 'alice.test' } }));
    mockFindUnique.mockResolvedValueOnce({ bannedAt: new Date('2026-11-18T00:00:00Z') });
    const { getCurrentUser } = await import('@/lib/session');
    expect(await getCurrentUser()).toBeNull();
  });
});

describe('isSafeRedirectPath', () => {
  it('accepts same-origin paths and rejects anything the URL parser could turn into another host', async () => {
    const { isSafeRedirectPath } = await import('@/lib/session');
    expect(isSafeRedirectPath('/')).toBe(true);
    expect(isSafeRedirectPath('/show/abc?x=1#top')).toBe(true);
    expect(isSafeRedirectPath('https://evil.example')).toBe(false);
    expect(isSafeRedirectPath('//evil.example')).toBe(false);
    expect(isSafeRedirectPath('/\\evil.example')).toBe(false);
    expect(isSafeRedirectPath('/\\/evil.example')).toBe(false);
    expect(isSafeRedirectPath('/show\n')).toBe(false);
    expect(isSafeRedirectPath('')).toBe(false);
  });
});
