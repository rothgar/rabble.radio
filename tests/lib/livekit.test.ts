// tests/lib/livekit.test.ts
//
// Unit tests for the server-side LiveKit helpers. We mock the livekit-server-sdk
// module so we can verify token claims + room creation logic without hitting
// the network.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface FakeAccessToken {
  apiKey?: string;
  apiSecret?: string;
  identity?: string;
  name?: string;
  ttl?: number | string;
  grants: Record<string, unknown>[];
  toJwt: ReturnType<typeof vi.fn>;
  addGrant: (g: Record<string, unknown>) => void;
}

interface AccessTokenOptions {
  identity?: string;
  name?: string;
  ttl?: number | string;
}

interface FakeRoomServiceClient {
  createRoom: ReturnType<typeof vi.fn>;
}

const tokenInstances: FakeAccessToken[] = [];
const roomClients: FakeRoomServiceClient[] = [];

vi.mock('livekit-server-sdk', () => {
  function AccessToken(
    this: FakeAccessToken,
    apiKey?: string,
    apiSecret?: string,
    options?: AccessTokenOptions
  ) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.identity = options?.identity;
    this.name = options?.name;
    this.ttl = options?.ttl;
    this.grants = [];
    this.toJwt = vi.fn().mockResolvedValue('signed.jwt.token');
    this.addGrant = (grant: Record<string, unknown>): void => {
      this.grants.push(grant);
    };
    tokenInstances.push(this);
  }
  (AccessToken as unknown as {
    prototype: { addGrant: (g: Record<string, unknown>) => void };
  }).prototype.addGrant = function (this: FakeAccessToken, grant: Record<string, unknown>) {
    this.grants.push(grant);
  };

  function RoomServiceClient(this: FakeRoomServiceClient) {
    this.createRoom = vi.fn().mockResolvedValue(undefined);
    roomClients.push(this);
  }

  return {
    AccessToken: AccessToken as unknown as new (
      apiKey?: string,
      apiSecret?: string
    ) => FakeAccessToken,
    RoomServiceClient: RoomServiceClient as unknown as new (
      host: string,
      apiKey?: string,
      apiSecret?: string
    ) => FakeRoomServiceClient,
  };
});

import {
  __resetLiveKitCacheForTests,
  createHostToken,
  createRoom,
  generateToken,
  getLiveKitClient,
  getLiveKitConfig,
  getLiveKitWsUrl,
  LiveKitConfigError,
  roomNameForSpace,
} from '@/lib/livekit';

const ENV_KEYS = [
  'LIVEKIT_URL',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
] as const;

const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  __resetLiveKitCacheForTests();
  for (const k of ENV_KEYS) originalEnv[k] = process.env[k];
  process.env.LIVEKIT_URL = 'ws://livekit.test:7880';
  process.env.LIVEKIT_API_KEY = 'test-key';
  process.env.LIVEKIT_API_SECRET = 'test-secret-with-enough-length-1234567890';
  tokenInstances.length = 0;
  roomClients.length = 0;
  for (const t of tokenInstances) {
    t.toJwt.mockClear();
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (originalEnv[k] === undefined) delete process.env[k];
    else process.env[k] = originalEnv[k];
  }
});

function lastToken(): FakeAccessToken {
  const t = tokenInstances[tokenInstances.length - 1];
  if (!t) throw new Error('expected an AccessToken instance');
  return t;
}

function lastRoomClient(): FakeRoomServiceClient {
  const c = roomClients[roomClients.length - 1];
  if (!c) throw new Error('expected a RoomServiceClient instance');
  return c;
}

describe('getLiveKitConfig', () => {
  it('throws when LIVEKIT_URL is missing', () => {
    __resetLiveKitCacheForTests();
    delete process.env.LIVEKIT_URL;
    expect(() => getLiveKitConfig()).toThrow(LiveKitConfigError);
  });

  it('throws when LIVEKIT_API_KEY is missing', () => {
    __resetLiveKitCacheForTests();
    delete process.env.LIVEKIT_API_KEY;
    expect(() => getLiveKitConfig()).toThrow(LiveKitConfigError);
  });

  it('throws when LIVEKIT_API_SECRET is missing', () => {
    __resetLiveKitCacheForTests();
    delete process.env.LIVEKIT_API_SECRET;
    expect(() => getLiveKitConfig()).toThrow(LiveKitConfigError);
  });

  it('returns the config when all vars are set', () => {
    const cfg = getLiveKitConfig();
    expect(cfg.url).toBe('ws://livekit.test:7880');
    expect(cfg.apiKey).toBe('test-key');
    expect(cfg.apiSecret.length).toBeGreaterThan(0);
  });
});

describe('getLiveKitClient', () => {
  it('returns a RoomServiceClient constructed with env credentials', () => {
    const client = getLiveKitClient();
    expect(client).toBeDefined();
    expect(roomClients).toHaveLength(1);
  });

  it('caches the client across calls', () => {
    const a = getLiveKitClient();
    const b = getLiveKitClient();
    expect(a).toBe(b);
    expect(roomClients).toHaveLength(1);
  });
});

describe('roomNameForSpace', () => {
  it('prefixes the space id with "space-"', () => {
    expect(roomNameForSpace('abc123')).toBe('space-abc123');
  });

  it('sanitises unsafe characters', () => {
    expect(roomNameForSpace('a/b c')).toBe('space-a_b_c');
  });
});

describe('generateToken', () => {
  it('mints a host token with publish + subscribe + data rights', async () => {
    const { token, wsUrl } = await generateToken({
      room: 'space-1',
      identity: 'did:plc:host',
      role: 'host',
      name: 'alice',
    });
    expect(token).toBe('signed.jwt.token');
    expect(wsUrl).toBe('ws://livekit.test:7880');
    expect(tokenInstances).toHaveLength(1);
    const t = lastToken();
    expect(t.identity).toBe('did:plc:host');
    expect(t.name).toBe('alice');
    expect(t.grants).toHaveLength(1);
    expect(t.grants[0]).toMatchObject({
      roomJoin: true,
      room: 'space-1',
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
  });

  it('treats "speaker" like host (publish + subscribe + data)', async () => {
    await generateToken({
      room: 'space-1',
      identity: 'did:plc:speaker',
      role: 'speaker',
    });
    const t = lastToken();
    expect(t.grants[0]).toMatchObject({
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
  });

  it('mints an audience token with subscribe-only rights', async () => {
    await generateToken({
      room: 'space-1',
      identity: 'did:plc:listener',
      role: 'audience',
    });
    const t = lastToken();
    expect(t.grants[0]).toMatchObject({
      roomJoin: true,
      room: 'space-1',
      canPublish: false,
      canSubscribe: true,
      canPublishData: false,
    });
  });

  it('rejects empty room name', async () => {
    await expect(
      generateToken({ room: '', identity: 'x', role: 'host' })
    ).rejects.toBeInstanceOf(LiveKitConfigError);
  });

  it('rejects empty identity', async () => {
    await expect(
      generateToken({ room: 'space-1', identity: '', role: 'host' })
    ).rejects.toBeInstanceOf(LiveKitConfigError);
  });
});

describe('createRoom', () => {
  it('creates the room with sensible defaults', async () => {
    await createRoom('abc123');
    const c = lastRoomClient();
    expect(c.createRoom).toHaveBeenCalledTimes(1);
    expect(c.createRoom).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'space-abc123' })
    );
  });

  it('treats "already exists" errors as success', async () => {
    __resetLiveKitCacheForTests();
    tokenInstances.length = 0;
    roomClients.length = 0;
    (getLiveKitClient().createRoom as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error('already exists'), { code: 'already_exists' })
    );
    await expect(createRoom('abc123')).resolves.toBeUndefined();
  });

  it('rethrows unexpected errors', async () => {
    __resetLiveKitCacheForTests();
    tokenInstances.length = 0;
    roomClients.length = 0;
    (getLiveKitClient().createRoom as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));
    await expect(createRoom('abc123')).rejects.toThrow('boom');
  });
});

describe('getLiveKitWsUrl', () => {
  it('returns the configured ws URL', () => {
    expect(getLiveKitWsUrl()).toBe('ws://livekit.test:7880');
  });
});

describe('createHostToken', () => {
  it('returns a populated token, wsUrl, roomName, and identity', async () => {
    const result = await createHostToken('abc123', {
      did: 'did:plc:host',
      handle: 'alice.bsky.social',
    });
    expect(result.token).toBeTruthy();
    expect(typeof result.token).toBe('string');
    expect(result.token.length).toBeGreaterThan(0);
    expect(result.wsUrl).toBe('ws://livekit.test:7880');
    expect(result.roomName).toBeTruthy();
    expect(result.identity).toBeTruthy();
  });

  it('uses roomNameForSpace to derive the LiveKit room name', async () => {
    const spaceId = 'xyz789';
    const result = await createHostToken(spaceId, {
      did: 'did:plc:host',
      handle: 'alice.bsky.social',
    });
    expect(result.roomName).toBe(roomNameForSpace(spaceId));
  });

  it('sets identity to the user did', async () => {
    const result = await createHostToken('abc123', {
      did: 'did:plc:host',
      handle: 'alice.bsky.social',
    });
    expect(result.identity).toBe('did:plc:host');
  });

  it('creates the room and mints a host-scoped JWT', async () => {
    await createHostToken('abc123', {
      did: 'did:plc:host',
      handle: 'alice.bsky.social',
    });
    // room should have been created
    expect(roomClients.length).toBeGreaterThan(0);
    const client = lastRoomClient();
    expect(client.createRoom).toHaveBeenCalledTimes(1);
    expect(client.createRoom).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'space-abc123' })
    );
    // token should have been minted with host role and matching identity
    expect(tokenInstances).toHaveLength(1);
    const t = lastToken();
    expect(t.identity).toBe('did:plc:host');
    expect(t.name).toBe('alice.bsky.social');
    expect(t.grants).toHaveLength(1);
    expect(t.grants[0]).toMatchObject({
      roomJoin: true,
      room: 'space-abc123',
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
  });
});
