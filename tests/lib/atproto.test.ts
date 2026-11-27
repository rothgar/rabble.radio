// tests/lib/atproto.test.ts
//
// Verifies the atproto helper builds the right putRecord/deleteRecord
// payloads and parses responses through the `@atproto/api` Agent. The OAuth
// client is mocked to return a session whose `fetchHandler` we capture and
// assert against.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fetchHandlerMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getOAuthClient: () => ({
    restore: async (_did: string) => ({
      fetchHandler: fetchHandlerMock,
    }),
  }),
}));

import {
  APP_PROFILE_PLATFORM,
  buildAppProfileRecord,
  buildLiveStatusRecord,
  createAppPasswordSession,
  deleteLiveStatus,
  fetchBlockedDids,
  publishAppProfile,
  publishLiveStatus,
} from '@/lib/atproto';

const session = { did: 'did:plc:host123', handle: 'alice.bsky.social' };

// A syntactically valid CID (the `Agent` validates XRPC responses against
// the lexicon, including `cid`'s format) and TID, for response fixtures.
const VALID_CID =
  'bafyreie5cz5vcfwsx2wxzvqglpqzyyr4lnvxrfm2w2apxdpdqcngozv2vu';
const VALID_TID = '3jzfcijpj2z2a';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function jsonErrorResponse(
  status: number,
  error: string,
  message: string
): Response {
  return jsonResponse({ error, message }, status);
}

async function decodeBody(body: unknown): Promise<Record<string, unknown>> {
  return JSON.parse(new TextDecoder().decode(body as Uint8Array));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildLiveStatusRecord', () => {
  it('includes external embed with title and uri', () => {
    const record = buildLiveStatusRecord({
      session,
      spaceUrl: 'https://example.com/spaces/abc',
      title: 'My space',
    });
    expect(record.$type).toBe('app.bsky.actor.status');
    expect(record.status).toBe('live');
    expect(record.embed.$type).toBe('app.bsky.embed.external');
    expect(record.embed.external.uri).toBe('https://example.com/spaces/abc');
    expect(record.embed.external.title).toBe('My space');
    expect(typeof record.createdAt).toBe('string');
  });

  it('attaches thumb when supplied', () => {
    const record = buildLiveStatusRecord({
      session,
      spaceUrl: 'https://example.com/spaces/x',
      title: 'Room',
      thumb: 'https://example.com/thumb.jpg',
    });
    expect(record.embed.external.thumb).toBe('https://example.com/thumb.jpg');
  });
});

describe('publishLiveStatus', () => {
  it('writes app.bsky.actor.status/self with external embed', async () => {
    fetchHandlerMock.mockResolvedValueOnce(
      jsonResponse({
        uri: 'at://did:plc:host123/app.bsky.actor.status/self',
        cid: VALID_CID,
      })
    );

    const result = await publishLiveStatus({
      session,
      spaceUrl: 'https://example.com/spaces/abc',
      title: 'My space',
    });

    expect(result.ok).toBe(true);
    expect(result.uri).toBe(
      'at://did:plc:host123/app.bsky.actor.status/self'
    );

    expect(fetchHandlerMock).toHaveBeenCalledTimes(1);
    const [calledPathname, calledInit] = fetchHandlerMock.mock.calls[0];
    expect(String(calledPathname)).toBe('/xrpc/com.atproto.repo.putRecord');
    expect(String(calledInit.method).toLowerCase()).toBe('post');
    // Authorization is intentionally NOT set here — the session's fetchHandler
    // adds the DPoP-bound Authorization header.
    expect((calledInit.headers as Headers).get('authorization')).toBeNull();
    expect((calledInit.headers as Headers).get('content-type')).toBe(
      'application/json'
    );
    const body = await decodeBody(calledInit.body);
    expect(body.repo).toBe('did:plc:host123');
    expect(body.collection).toBe('app.bsky.actor.status');
    expect(body.rkey).toBe('self');
    const record = body.record as Record<string, unknown>;
    expect(record.$type).toBe('app.bsky.actor.status');
    expect(record.status).toBe('live');
    const embed = record.embed as Record<string, unknown>;
    expect(embed.$type).toBe('app.bsky.embed.external');
    const external = embed.external as Record<string, unknown>;
    expect(external.uri).toBe('https://example.com/spaces/abc');
    expect(external.title).toBe('My space');
    expect(typeof record.createdAt).toBe('string');
  });

  it('returns ok=false when PDS returns an error', async () => {
    fetchHandlerMock.mockResolvedValueOnce(
      jsonErrorResponse(500, 'InternalServerError', 'boom')
    );
    const result = await publishLiveStatus({
      session,
      spaceUrl: 'https://example.com/spaces/y',
      title: 'Room',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/boom/);
  });

  it('returns ok=false when fetch throws', async () => {
    fetchHandlerMock.mockRejectedValueOnce(new Error('network down'));
    const result = await publishLiveStatus({
      session,
      spaceUrl: 'https://example.com/spaces/y',
      title: 'Room',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/network down/);
  });

  it('rejects when session has no DID', async () => {
    const result = await publishLiveStatus({
      session: {},
      spaceUrl: 'https://example.com',
      title: 'Room',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/DID/);
    expect(fetchHandlerMock).not.toHaveBeenCalled();
  });

  it('rejects when spaceUrl missing', async () => {
    const result = await publishLiveStatus({
      session,
      spaceUrl: '',
      title: 'Room',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/spaceUrl/);
    expect(fetchHandlerMock).not.toHaveBeenCalled();
  });
});

describe('deleteLiveStatus', () => {
  it('calls com.atproto.repo.deleteRecord for status/self', async () => {
    fetchHandlerMock.mockResolvedValueOnce(
      jsonResponse({ commit: { cid: VALID_CID, rev: VALID_TID } })
    );
    const result = await deleteLiveStatus({ session });
    expect(result.ok).toBe(true);

    const [calledPathname, calledInit] = fetchHandlerMock.mock.calls[0];
    expect(String(calledPathname)).toBe('/xrpc/com.atproto.repo.deleteRecord');
    expect(String(calledInit.method).toLowerCase()).toBe('post');
    expect((calledInit.headers as Headers).get('authorization')).toBeNull();
    const body = await decodeBody(calledInit.body);
    expect(body).toEqual({
      repo: 'did:plc:host123',
      collection: 'app.bsky.actor.status',
      rkey: 'self',
    });
  });

  it('returns ok=false when deleteRecord fails', async () => {
    fetchHandlerMock.mockResolvedValueOnce(
      jsonErrorResponse(400, 'InvalidRequest', 'bad request')
    );
    const result = await deleteLiveStatus({ session });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/bad request/);
  });

  it('returns ok=false when fetch throws', async () => {
    fetchHandlerMock.mockRejectedValueOnce(new Error('offline'));
    const result = await deleteLiveStatus({ session });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/offline/);
  });

  it('rejects when session has no DID', async () => {
    const result = await deleteLiveStatus({ session: {} });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/DID/);
    expect(fetchHandlerMock).not.toHaveBeenCalled();
  });
});

describe('fetchBlockedDids', () => {
  function blocksResponse(dids: string[], cursor?: string): Response {
    return jsonResponse({
      blocks: dids.map((did) => ({
        did,
        handle: `${did.split(':').pop()}.test`,
      })),
      cursor,
    });
  }

  it('calls getBlocks with no actor param, through the OAuth session', async () => {
    fetchHandlerMock.mockResolvedValueOnce(
      blocksResponse(['did:plc:blocka', 'did:plc:blockb'])
    );
    const out = await fetchBlockedDids('did:plc:host123');
    expect(out).toEqual(['did:plc:blocka', 'did:plc:blockb']);

    const [calledPathname, calledInit] = fetchHandlerMock.mock.calls[0];
    expect(String(calledPathname)).toMatch(/^\/xrpc\/app\.bsky\.graph\.getBlocks\?/);
    expect(String(calledPathname)).not.toMatch(/actor=/);
    expect(String(calledInit.method).toLowerCase()).toBe('get');
    expect((calledInit.headers as Headers).get('authorization')).toBeNull();
  });

  it('pages through the cursor', async () => {
    fetchHandlerMock
      .mockResolvedValueOnce(blocksResponse(['did:plc:blocka'], 'c1'))
      .mockResolvedValueOnce(blocksResponse(['did:plc:blockb']));
    const out = await fetchBlockedDids('did:plc:host123');
    expect(out).toEqual(['did:plc:blocka', 'did:plc:blockb']);
    const second = new URL(`https://x${fetchHandlerMock.mock.calls[1][0]}`);
    expect(second.searchParams.get('cursor')).toBe('c1');
  });

  it('stops at the cap', async () => {
    fetchHandlerMock.mockImplementation(async () =>
      blocksResponse(
        Array.from({ length: 100 }, (_, i) => `did:plc:block${i}`),
        'more'
      )
    );
    const out = await fetchBlockedDids('did:plc:host123', 150);
    expect(out).toHaveLength(150);
  });

  it('throws on HTTP errors', async () => {
    fetchHandlerMock.mockResolvedValueOnce(
      jsonErrorResponse(500, 'InternalServerError', 'boom')
    );
    await expect(fetchBlockedDids('did:plc:host123')).rejects.toThrow(/boom/);
  });
});

describe('buildAppProfileRecord', () => {
  it('builds a community.lexicon.app.profile record', () => {
    const record = buildAppProfileRecord({
      name: 'Rabble',
      description: 'Live audio spaces for Bluesky.',
      links: [{ uri: 'https://rabble.radio', label: 'Website' }],
      platforms: [APP_PROFILE_PLATFORM.web],
    });
    expect(record.$type).toBe('community.lexicon.app.profile');
    expect(record.name).toBe('Rabble');
    expect(record.links).toEqual([
      { uri: 'https://rabble.radio', label: 'Website' },
    ]);
    expect(record.platforms).toEqual([APP_PROFILE_PLATFORM.web]);
    expect(typeof record.createdAt).toBe('string');
  });

  it('rejects an empty links array', () => {
    expect(() => buildAppProfileRecord({ name: 'Rabble', links: [] })).toThrow(
      /links/
    );
  });

  it('rejects more than 12 links', () => {
    const links = Array.from({ length: 13 }, (_, i) => ({
      uri: `https://example.com/${i}`,
    }));
    expect(() => buildAppProfileRecord({ name: 'Rabble', links })).toThrow(
      /links/
    );
  });
});

describe('createAppPasswordSession', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('authenticates and returns the session', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        did: 'did:plc:app123',
        handle: 'rabble.bsky.social',
        accessJwt: 'jwt-token',
      })
    );

    const session = await createAppPasswordSession({
      identifier: 'rabble.bsky.social',
      password: 'xxxx-xxxx-xxxx-xxxx',
    });

    expect(session).toEqual({
      did: 'did:plc:app123',
      handle: 'rabble.bsky.social',
      accessJwt: 'jwt-token',
      service: 'https://bsky.social',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://bsky.social/xrpc/com.atproto.server.createSession'
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      identifier: 'rabble.bsky.social',
      password: 'xxxx-xxxx-xxxx-xxxx',
    });
  });

  it('throws when createSession fails', async () => {
    fetchMock.mockResolvedValueOnce(new Response('bad creds', { status: 401 }));
    await expect(
      createAppPasswordSession({ identifier: 'x', password: 'y' })
    ).rejects.toThrow(/401/);
  });

  it('throws when the response is missing did or accessJwt', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await expect(
      createAppPasswordSession({ identifier: 'x', password: 'y' })
    ).rejects.toThrow(/did or accessJwt/);
  });
});

describe('publishAppProfile', () => {
  const fetchMock = vi.fn();
  const session = {
    did: 'did:plc:app123',
    handle: 'rabble.bsky.social',
    accessJwt: 'jwt-token',
    service: 'https://bsky.social',
  };

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes community.lexicon.app.profile/self with a bearer token', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        uri: 'at://did:plc:app123/community.lexicon.app.profile/self',
        cid: VALID_CID,
      })
    );

    const result = await publishAppProfile({
      session,
      profile: { name: 'Rabble', links: [{ uri: 'https://rabble.radio' }] },
    });

    expect(result.ok).toBe(true);
    expect(result.uri).toBe(
      'at://did:plc:app123/community.lexicon.app.profile/self'
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://bsky.social/xrpc/com.atproto.repo.putRecord'
    );
    expect((init.headers as Headers).get('authorization')).toBe(
      'Bearer jwt-token'
    );
    expect((init.headers as Headers).get('content-type')).toBe(
      'application/json'
    );
    const body = await decodeBody(init.body);
    expect(body.repo).toBe('did:plc:app123');
    expect(body.collection).toBe('community.lexicon.app.profile');
    expect(body.rkey).toBe('self');
    expect((body.record as Record<string, unknown>).name).toBe('Rabble');
  });

  it('returns ok=false when the PDS errors', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonErrorResponse(500, 'InternalServerError', 'boom')
    );
    const result = await publishAppProfile({
      session,
      profile: { name: 'Rabble', links: [{ uri: 'https://rabble.radio' }] },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/boom/);
  });
});
