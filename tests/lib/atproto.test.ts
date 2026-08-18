// tests/lib/atproto.test.ts
//
// Verifies the atproto helper builds the right putRecord/deleteRecord
// payloads and parses responses. The OAuth client is mocked to return a
// session whose `fetchHandler` we capture and assert against.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchHandlerMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getOAuthClient: () => ({
    restore: async (_did: string) => ({
      fetchHandler: fetchHandlerMock,
    }),
  }),
}));

import {
  buildLiveStatusRecord,
  deleteLiveStatus,
  publishLiveStatus,
} from '@/lib/atproto';

const session = { did: 'did:plc:host123', handle: 'alice.bsky.social' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
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
        cid: 'bafyreie...',
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
    expect(calledInit.method).toBe('POST');
    // Authorization is intentionally NOT set here — the session's fetchHandler
    // adds the DPoP-bound Authorization header.
    expect(
      (calledInit.headers as Record<string, string>).authorization
    ).toBeUndefined();
    expect((calledInit.headers as Record<string, string>).accept).toBe(
      'application/json'
    );
    expect(
      (calledInit.headers as Record<string, string>)['content-type']
    ).toBe('application/json');
    const body = JSON.parse(calledInit.body as string);
    expect(body.repo).toBe('did:plc:host123');
    expect(body.collection).toBe('app.bsky.actor.status');
    expect(body.rkey).toBe('self');
    expect(body.record.$type).toBe('app.bsky.actor.status');
    expect(body.record.status).toBe('live');
    expect(body.record.embed.$type).toBe('app.bsky.embed.external');
    expect(body.record.embed.external.uri).toBe(
      'https://example.com/spaces/abc'
    );
    expect(body.record.embed.external.title).toBe('My space');
    expect(typeof body.record.createdAt).toBe('string');
  });

  it('returns ok=false when PDS returns an error', async () => {
    fetchHandlerMock.mockResolvedValueOnce(
      new Response('boom', { status: 500 })
    );
    const result = await publishLiveStatus({
      session,
      spaceUrl: 'https://example.com/spaces/y',
      title: 'Room',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/500/);
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
      jsonResponse({ commit: { cid: 'c', rev: 'r' } })
    );
    const result = await deleteLiveStatus({ session });
    expect(result.ok).toBe(true);

    const [calledPathname, calledInit] = fetchHandlerMock.mock.calls[0];
    expect(String(calledPathname)).toBe('/xrpc/com.atproto.repo.deleteRecord');
    expect(calledInit.method).toBe('POST');
    expect(
      (calledInit.headers as Record<string, string>).authorization
    ).toBeUndefined();
    const body = JSON.parse(calledInit.body as string);
    expect(body).toEqual({
      repo: 'did:plc:host123',
      collection: 'app.bsky.actor.status',
      rkey: 'self',
    });
  });

  it('returns ok=false when deleteRecord fails', async () => {
    fetchHandlerMock.mockResolvedValueOnce(
      new Response('bad', { status: 400 })
    );
    const result = await deleteLiveStatus({ session });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/400/);
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
