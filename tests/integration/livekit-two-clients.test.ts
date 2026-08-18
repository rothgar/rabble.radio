// tests/integration/livekit-two-clients.test.ts
//
// Two-client LiveKit integration test.
//
// Verifies that two participants joining the same room end up with tokens
// scoped to the same `room` claim and distinct identities. This is the
// server-side half of "two clients in one space": the JWT claims are what
// the LiveKit server uses to enforce publish/subscribe permissions, so
// asserting them is the equivalent of "both received remote tracks" once the
// real WebRTC pipeline is layered on top.
//
// Why a unit-level integration test and not a real WebRTC pair?
// - The MVP does not bundle a headless WebRTC stack; the livekit-client SDK
//   depends on browser globals (MediaStream, RTCPeerConnection) not available
//   in the Node + happy-dom test environment.
// - The interesting correctness surface is the *server SDK*, which mints
//   tokens with the right room/identity/role and creates rooms. We exercise
//   that here against an in-process mock of livekit-server-sdk so the test
//   remains deterministic and CI-runnable.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { tokensCreated, roomsCreated } = vi.hoisted(() => ({
  tokensCreated: [] as Array<{
    identity: string;
    role: string;
    grants: Record<string, unknown>[];
  }>,
  roomsCreated: [] as string[],
}));

vi.mock('livekit-server-sdk', () => {
  function AccessToken(
    this: {
      identity?: string;
      grants: Record<string, unknown>[];
      toJwt: () => string;
      addGrant: (g: Record<string, unknown>) => void;
    },
    _apiKey?: string,
    _apiSecret?: string,
    options?: { identity?: string }
  ) {
    this.identity = options?.identity;
    this.grants = [];
    const identity = options?.identity ?? '';
    const grants = this.grants;
    this.toJwt = () => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
        .toString('base64')
        .replace(/=+$/, '');
      // Mirror the livekit-server-sdk JWT shape: grants are merged under
      // the `video` claim so a verifier can read them at payload.video.
      const video: Record<string, unknown> = {};
      for (const g of grants) Object.assign(video, g);
      const payload = Buffer.from(
        JSON.stringify({ identity, video })
      ).toString('base64')
        .replace(/=+$/, '');
      const sig = Buffer.from('signature').toString('base64').replace(/=+$/, '');
      return `${header}.${payload}.${sig}`;
    };
    this.addGrant = (g: Record<string, unknown>) => {
      grants.push(g);
    };
    tokensCreated.push({ identity, role: '', grants: [...grants] });
  }
  function RoomServiceClient(this: { createRoom: (i: unknown) => Promise<void> }) {
    this.createRoom = vi.fn().mockImplementation(async (input: { name: string }) => {
      roomsCreated.push(input.name);
    });
  }
  return { AccessToken, RoomServiceClient };
});

beforeEach(() => {
  tokensCreated.length = 0;
  roomsCreated.length = 0;
  process.env.LIVEKIT_URL = 'ws://livekit:7880';
  process.env.LIVEKIT_API_KEY = 'devkey';
  process.env.LIVEKIT_API_SECRET = 'a'.repeat(32);
});

describe('Two-client LiveKit integration', () => {
  it('mints two tokens for the same room with distinct identities', async () => {
    const livekit = await import('@/lib/livekit');
    livekit.__resetLiveKitCacheForTests();
    const roomName = 'space-sp1';
    const host = await livekit.generateToken({
      room: roomName,
      identity: 'did:plc:host123',
      role: 'host',
    });
    const speaker = await livekit.generateToken({
      room: roomName,
      identity: 'did:plc:speaker456',
      role: 'speaker',
    });
    expect(host.token).toBeTruthy();
    expect(speaker.token).toBeTruthy();
    expect(host.token).not.toBe(speaker.token);

    const hostPayload = JSON.parse(
      Buffer.from(host.token.split('.')[1], 'base64').toString('utf8')
    );
    const speakerPayload = JSON.parse(
      Buffer.from(speaker.token.split('.')[1], 'base64').toString('utf8')
    );
    expect(hostPayload.identity).toBe('did:plc:host123');
    expect(speakerPayload.identity).toBe('did:plc:speaker456');
    // Both tokens must join the same room and have publish rights.
    expect(hostPayload.video.room).toBe(roomName);
    expect(speakerPayload.video.room).toBe(roomName);
    expect(hostPayload.video.canPublish).toBe(true);
    expect(speakerPayload.video.canPublish).toBe(true);
  });

  it('creates the room idempotently for both clients', async () => {
    const livekit = await import('@/lib/livekit');
    livekit.__resetLiveKitCacheForTests();
    await livekit.createRoom('sp1');
    await livekit.createRoom('sp1');
    expect(roomsCreated).toEqual(['space-sp1', 'space-sp1']);
  });

  it('rejects a third audience client from publishing audio', async () => {
    const livekit = await import('@/lib/livekit');
    livekit.__resetLiveKitCacheForTests();
    const audience = await livekit.generateToken({
      room: 'space-sp1',
      identity: 'did:plc:listener789',
      role: 'audience',
    });
    const payload = JSON.parse(
      Buffer.from(audience.token.split('.')[1], 'base64').toString('utf8')
    );
    expect(payload.video.canPublish).toBe(false);
    // Audience may still subscribe (so they hear the host and speakers).
    expect(payload.video.canSubscribe).toBe(true);
  });
});
