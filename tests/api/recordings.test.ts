// tests/api/recordings.test.ts
//
// Podcast publishing routes: POST /api/recordings/[id]/publish and the
// stable enclosure URL GET /api/recordings/[id]/audio.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getRecordingById: vi.fn(),
  setRecordingPublished: vi.fn(),
  signedUrlFor: vi.fn(async () => 'https://signed.example/file.mp4'),
}));

vi.mock('@/lib/session', () => ({ getCurrentUser: m.getCurrentUser }));
vi.mock('@/lib/recording', () => ({
  getRecordingById: m.getRecordingById,
  setRecordingPublished: m.setRecordingPublished,
  signedUrlFor: m.signedUrlFor,
  toPublicRecording: (r: Record<string, unknown>) => ({ id: r.id, published: r.published }),
  RecordingStateError: class RecordingStateError extends Error {
    code = 'not_ready';
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function rec(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rec1',
    hostDid: 'did:plc:host',
    status: 'available',
    published: false,
    s3Key: 'k',
    s3Bucket: 'b',
    ...overrides,
  };
}
const ctx = { params: Promise.resolve({ id: 'rec1' }) };

function publishReq(body: unknown) {
  return new NextRequest('http://localhost/api/recordings/rec1/publish', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.getCurrentUser.mockResolvedValue({ did: 'did:plc:host', handle: 'alice.bsky.social' });
  m.getRecordingById.mockResolvedValue(rec());
  m.setRecordingPublished.mockImplementation(async (id: string, published: boolean) =>
    rec({ id, published })
  );
});

describe('POST /api/recordings/[id]/publish', () => {
  it('requires a session', async () => {
    m.getCurrentUser.mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/recordings/[id]/publish/route');
    expect((await POST(publishReq({ published: true }), ctx)).status).toBe(401);
  });

  it('rejects non-hosts', async () => {
    m.getCurrentUser.mockResolvedValueOnce({ did: 'did:plc:other', handle: 'bob' });
    const { POST } = await import('@/app/api/recordings/[id]/publish/route');
    expect((await POST(publishReq({ published: true }), ctx)).status).toBe(403);
    expect(m.setRecordingPublished).not.toHaveBeenCalled();
  });

  it('validates the flag', async () => {
    const { POST } = await import('@/app/api/recordings/[id]/publish/route');
    expect((await POST(publishReq({ published: 'yes' }), ctx)).status).toBe(400);
  });

  it('publishes for the host', async () => {
    const { POST } = await import('@/app/api/recordings/[id]/publish/route');
    const res = await POST(publishReq({ published: true }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ recording: { id: 'rec1', published: true } });
    expect(m.setRecordingPublished).toHaveBeenCalledWith('rec1', true);
  });

  it('maps a not-ready recording to 409', async () => {
    const { RecordingStateError } = await import('@/lib/recording');
    m.setRecordingPublished.mockRejectedValueOnce(new RecordingStateError('not_ready', 'still processing'));
    const { POST } = await import('@/app/api/recordings/[id]/publish/route');
    const res = await POST(publishReq({ published: true }), ctx);
    expect(res.status).toBe(409);
  });
});

describe('GET /api/recordings/[id]/audio', () => {
  const get = () => new NextRequest('http://localhost/api/recordings/rec1/audio');

  it('redirects anyone to a signed URL for a published recording', async () => {
    m.getRecordingById.mockResolvedValueOnce(rec({ published: true }));
    const { GET } = await import('@/app/api/recordings/[id]/audio/route');
    const res = await GET(get(), ctx);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://signed.example/file.mp4');
    // Public: no session lookup at all.
    expect(m.getCurrentUser).not.toHaveBeenCalled();
  });

  it('keeps unpublished recordings private to the host', async () => {
    const { GET } = await import('@/app/api/recordings/[id]/audio/route');
    m.getCurrentUser.mockResolvedValueOnce(null);
    expect((await GET(get(), ctx)).status).toBe(401);
    m.getCurrentUser.mockResolvedValueOnce({ did: 'did:plc:other', handle: 'bob' });
    expect((await GET(get(), ctx)).status).toBe(403);
    expect((await GET(get(), ctx)).status).toBe(302);
  });

  it('refuses recordings that are not ready', async () => {
    m.getRecordingById.mockResolvedValueOnce(rec({ status: 'starting' }));
    const { GET } = await import('@/app/api/recordings/[id]/audio/route');
    expect((await GET(get(), ctx)).status).toBe(409);
  });

  it('404s for unknown ids', async () => {
    m.getRecordingById.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/recordings/[id]/audio/route');
    expect((await GET(get(), ctx)).status).toBe(404);
  });
});
