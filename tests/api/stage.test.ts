// tests/api/stage.test.ts
//
// Exercises POST /api/spaces/[id]/stage with mocked session and stage
// service. Verifies authz + state transitions at the route boundary.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetCurrentUser,
  mockInviteToStage,
  mockAcceptStageInvite,
  mockLeaveStage,
  mockRemoveFromStage,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockInviteToStage: vi.fn(),
  mockAcceptStageInvite: vi.fn(),
  mockLeaveStage: vi.fn(),
  mockRemoveFromStage: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getCurrentUser: mockGetCurrentUser,
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

const HOST = {
  did: 'did:plc:host123',
  handle: 'alice.bsky.social',
};
const LISTENER = {
  did: 'did:plc:listener',
  handle: 'bob.bsky.social',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockInviteToStage.mockResolvedValue({ ok: true, invite: {} });
  mockAcceptStageInvite.mockResolvedValue({
    token: 'speaker.jwt',
    wsUrl: 'ws://livekit:7880',
    role: 'speaker',
    roomName: 'space-sp1',
    identity: 'did:plc:listener',
  });
  mockLeaveStage.mockResolvedValue({
    token: 'audience.jwt',
    wsUrl: 'ws://livekit:7880',
    role: 'audience',
    roomName: 'space-sp1',
    identity: 'did:plc:listener',
  });
  mockRemoveFromStage.mockResolvedValue({
    token: 'audience.jwt',
    wsUrl: 'ws://livekit:7880',
    role: 'audience',
    roomName: 'space-sp1',
    identity: 'did:plc:listener',
  });
});

function buildRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/spaces/sp1/stage', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/spaces/[id]/stage', () => {
  it('requires authentication', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/spaces/[id]/stage/route');
    const res = await POST(buildRequest({ action: 'invite', targetIdentity: 'x' }), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects invalid JSON with 400', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(HOST);
    const { POST } = await import('@/app/api/spaces/[id]/stage/route');
    const req = new NextRequest('http://localhost/api/spaces/sp1/stage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    });
    const res = await POST(req, {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(400);
    expect(mockInviteToStage).not.toHaveBeenCalled();
  });

  it('invite action delegates to inviteToStage with host DID', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(HOST);
    const { POST } = await import('@/app/api/spaces/[id]/stage/route');
    const res = await POST(
      buildRequest({ action: 'invite', targetIdentity: 'did:plc:listener' }),
      { params: Promise.resolve({ id: 'sp1' }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockInviteToStage).toHaveBeenCalledWith({
      spaceId: 'sp1',
      hostDid: HOST.did,
      targetIdentity: 'did:plc:listener',
    });
  });

  it('invite requires targetIdentity', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(HOST);
    const { POST } = await import('@/app/api/spaces/[id]/stage/route');
    const res = await POST(buildRequest({ action: 'invite' }), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(400);
    expect(mockInviteToStage).not.toHaveBeenCalled();
  });

  it('accept action returns a speaker token', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(LISTENER);
    const { POST } = await import('@/app/api/spaces/[id]/stage/route');
    const res = await POST(buildRequest({ action: 'accept' }), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      token: 'speaker.jwt',
      role: 'speaker',
      identity: 'did:plc:listener',
    });
    expect(mockAcceptStageInvite).toHaveBeenCalledWith({
      spaceId: 'sp1',
      userDid: LISTENER.did,
      displayName: LISTENER.handle,
    });
  });

  it('leave action returns an audience token', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(LISTENER);
    const { POST } = await import('@/app/api/spaces/[id]/stage/route');
    const res = await POST(buildRequest({ action: 'leave' }), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('audience');
    expect(mockLeaveStage).toHaveBeenCalledWith({
      spaceId: 'sp1',
      userDid: LISTENER.did,
      displayName: LISTENER.handle,
    });
  });

  it('remove action returns an audience token for the target', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(HOST);
    const { POST } = await import('@/app/api/spaces/[id]/stage/route');
    const res = await POST(
      buildRequest({ action: 'remove', targetIdentity: 'did:plc:listener' }),
      { params: Promise.resolve({ id: 'sp1' }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('audience');
    expect(mockRemoveFromStage).toHaveBeenCalledWith({
      spaceId: 'sp1',
      hostDid: HOST.did,
      targetIdentity: 'did:plc:listener',
    });
  });

  it('remove requires targetIdentity', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(HOST);
    const { POST } = await import('@/app/api/spaces/[id]/stage/route');
    const res = await POST(buildRequest({ action: 'remove' }), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(400);
    expect(mockRemoveFromStage).not.toHaveBeenCalled();
  });

  it('rejects unknown actions with 400', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(HOST);
    const { POST } = await import('@/app/api/spaces/[id]/stage/route');
    const res = await POST(buildRequest({ action: 'kick' }), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(400);
  });

  it('maps StageError(403) to HTTP 403', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(HOST);
    const { StageError } = await import('@/lib/stage');
    mockInviteToStage.mockRejectedValueOnce(
      new StageError('forbidden', 403, 'nope')
    );
    const { POST } = await import('@/app/api/spaces/[id]/stage/route');
    const res = await POST(
      buildRequest({ action: 'invite', targetIdentity: 'x' }),
      { params: Promise.resolve({ id: 'sp1' }) }
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('forbidden');
  });

  it('maps StageError(404) to HTTP 404', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(LISTENER);
    const { StageError } = await import('@/lib/stage');
    mockAcceptStageInvite.mockRejectedValueOnce(
      new StageError('no_pending_invite', 404, 'none')
    );
    const { POST } = await import('@/app/api/spaces/[id]/stage/route');
    const res = await POST(buildRequest({ action: 'accept' }), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('no_pending_invite');
  });

  it('returns 500 on unexpected errors', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(LISTENER);
    mockLeaveStage.mockRejectedValueOnce(new Error('boom'));
    const { POST } = await import('@/app/api/spaces/[id]/stage/route');
    const res = await POST(buildRequest({ action: 'leave' }), {
      params: Promise.resolve({ id: 'sp1' }),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('stage_failed');
  });

  it('returns 404 when params id is missing', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(HOST);
    const { POST } = await import('@/app/api/spaces/[id]/stage/route');
    const res = await POST(buildRequest({ action: 'leave' }), {
      params: Promise.resolve({ id: '' }),
    });
    expect(res.status).toBe(404);
  });
});
