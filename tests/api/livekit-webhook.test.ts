// tests/api/livekit-webhook.test.ts
//
// POST /api/livekit/webhook turns LiveKit participant events into presence
// records. The SDK's WebhookReceiver is mocked so signature handling is
// exercised without real keys.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockReceive, mockGetSpaceById, mockRecordJoin, mockRecordLeave } = vi.hoisted(() => ({
  mockReceive: vi.fn(),
  mockGetSpaceById: vi.fn(),
  mockRecordJoin: vi.fn(async () => undefined),
  mockRecordLeave: vi.fn(async () => undefined),
}));

vi.mock('livekit-server-sdk', () => ({
  WebhookReceiver: class {
    receive = mockReceive;
  },
}));

vi.mock('@/lib/livekit', () => ({
  getLiveKitConfig: () => ({ url: 'ws://livekit:7880', apiKey: 'devkey', apiSecret: 'secret' }),
  LiveKitConfigError: class LiveKitConfigError extends Error {},
  spaceIdFromRoomName: (room: string) => (room.startsWith('space-') ? room.slice(6) : null),
}));

vi.mock('@/lib/spaces', () => ({ getSpaceById: mockGetSpaceById }));
vi.mock('@/lib/metrics', () => ({ recordJoin: mockRecordJoin, recordLeave: mockRecordLeave }));
vi.mock('@/lib/db', () => ({ prisma: {} }));

const space = { id: 'sp1', hostId: 'did:plc:host' };

function post(body: unknown, authorization = 'signed'): NextRequest {
  return new NextRequest('http://localhost/api/livekit/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/webhook+json', authorization },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSpaceById.mockResolvedValue(space);
});

describe('POST /api/livekit/webhook', () => {
  it('rejects events that fail signature verification', async () => {
    mockReceive.mockRejectedValueOnce(new Error('invalid token'));
    const { POST } = await import('@/app/api/livekit/webhook/route');
    const res = await POST(post({ event: 'participant_joined' }, 'bad'));
    expect(res.status).toBe(401);
    expect(mockRecordJoin).not.toHaveBeenCalled();
  });

  it('passes the raw body and Authorization header to the receiver', async () => {
    mockReceive.mockResolvedValueOnce({ event: 'room_started', room: { name: 'space-sp1' } });
    const { POST } = await import('@/app/api/livekit/webhook/route');
    const res = await POST(post({ event: 'room_started' }, 'Bearer abc'));
    expect(res.status).toBe(200);
    expect(mockReceive).toHaveBeenCalledWith(JSON.stringify({ event: 'room_started' }), 'Bearer abc');
    expect(await res.json()).toEqual({ ok: true, ignored: 'room_started' });
  });

  it('records a host join with the host role', async () => {
    mockReceive.mockResolvedValueOnce({
      event: 'participant_joined',
      room: { name: 'space-sp1' },
      participant: { identity: 'did:plc:host', permission: { canPublish: true } },
    });
    const { POST } = await import('@/app/api/livekit/webhook/route');
    const res = await POST(post({}));
    expect(res.status).toBe(200);
    expect(mockRecordJoin).toHaveBeenCalledWith({ spaceId: 'sp1', identity: 'did:plc:host', role: 'host' });
  });

  it('derives speaker vs listener from publish permission', async () => {
    mockReceive.mockResolvedValueOnce({
      event: 'participant_joined',
      room: { name: 'space-sp1' },
      participant: { identity: 'did:plc:guest', permission: { canPublish: true } },
    });
    mockReceive.mockResolvedValueOnce({
      event: 'participant_joined',
      room: { name: 'space-sp1' },
      participant: { identity: 'anon:1', permission: { canPublish: false } },
    });
    const { POST } = await import('@/app/api/livekit/webhook/route');
    await POST(post({}));
    await POST(post({}));
    expect(mockRecordJoin).toHaveBeenNthCalledWith(1, { spaceId: 'sp1', identity: 'did:plc:guest', role: 'speaker' });
    expect(mockRecordJoin).toHaveBeenNthCalledWith(2, { spaceId: 'sp1', identity: 'anon:1', role: 'listener' });
  });

  it('records leaves', async () => {
    mockReceive.mockResolvedValueOnce({
      event: 'participant_left',
      room: { name: 'space-sp1' },
      participant: { identity: 'anon:1' },
    });
    const { POST } = await import('@/app/api/livekit/webhook/route');
    await POST(post({}));
    expect(mockRecordLeave).toHaveBeenCalledWith({ spaceId: 'sp1', identity: 'anon:1' });
  });

  it('ignores rooms that are not shows or no longer exist', async () => {
    mockReceive.mockResolvedValueOnce({
      event: 'participant_joined',
      room: { name: 'lan-probe-room' },
      participant: { identity: 'x' },
    });
    mockReceive.mockResolvedValueOnce({
      event: 'participant_joined',
      room: { name: 'space-gone' },
      participant: { identity: 'x' },
    });
    mockGetSpaceById.mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/livekit/webhook/route');
    const a = await POST(post({}));
    const b = await POST(post({}));
    expect(await a.json()).toEqual({ ok: true, ignored: 'participant_joined' });
    expect(await b.json()).toEqual({ ok: true, ignored: 'unknown_space' });
    expect(mockRecordJoin).not.toHaveBeenCalled();
  });
});
