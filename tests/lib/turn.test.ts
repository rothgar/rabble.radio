// tests/lib/turn.test.ts
//
// Cloudflare TURN credential minting used by POST /api/spaces/[id]/join.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_TURN_TTL_SECONDS,
  TurnError,
  getIceServers,
  getTurnConfig,
  isTurnConfigured,
  normalizeIceServers,
} from '@/lib/turn';

const cloudflareBody = {
  iceServers: [
    { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
    {
      urls: [
        'turn:turn.cloudflare.com:3478?transport=udp',
        'turn:turn.cloudflare.com:53?transport=udp',
        'turns:turn.cloudflare.com:443?transport=tcp',
      ],
      username: 'cf-user',
      credential: 'cf-pass',
    },
  ],
};

function jsonResponse(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('getTurnConfig / isTurnConfigured', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is unconfigured when either variable is missing or blank', () => {
    expect(getTurnConfig({})).toBeNull();
    expect(getTurnConfig({ CLOUDFLARE_TURN_KEY_ID: 'k' })).toBeNull();
    expect(getTurnConfig({ CLOUDFLARE_TURN_KEY_ID: 'k', CLOUDFLARE_TURN_API_TOKEN: '  ' })).toBeNull();
    expect(isTurnConfigured({})).toBe(false);
  });

  it('reads and trims both variables', () => {
    expect(
      getTurnConfig({ CLOUDFLARE_TURN_KEY_ID: ' key ', CLOUDFLARE_TURN_API_TOKEN: 'tok\n' })
    ).toEqual({ keyId: 'key', apiToken: 'tok' });
    vi.stubEnv('CLOUDFLARE_TURN_KEY_ID', 'key');
    vi.stubEnv('CLOUDFLARE_TURN_API_TOKEN', 'tok');
    expect(isTurnConfigured()).toBe(true);
  });
});

describe('normalizeIceServers', () => {
  it('drops port-53 URLs, empty entries and non-string values', () => {
    const servers = normalizeIceServers([
      ...cloudflareBody.iceServers,
      { urls: 'turn:turn.cloudflare.com:80?transport=tcp' },
      { urls: [] },
      null,
      { urls: [42] },
    ]);
    expect(servers).toEqual([
      { urls: ['stun:stun.cloudflare.com:3478'] },
      {
        urls: [
          'turn:turn.cloudflare.com:3478?transport=udp',
          'turns:turn.cloudflare.com:443?transport=tcp',
        ],
        username: 'cf-user',
        credential: 'cf-pass',
      },
      { urls: ['turn:turn.cloudflare.com:80?transport=tcp'] },
    ]);
  });

  it('returns an empty list for garbage input', () => {
    expect(normalizeIceServers(undefined)).toEqual([]);
    expect(normalizeIceServers('nope')).toEqual([]);
  });
});

describe('getIceServers', () => {
  const env = { CLOUDFLARE_TURN_KEY_ID: 'key123', CLOUDFLARE_TURN_API_TOKEN: 'secret-token' };
  let fetchImpl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchImpl = vi.fn();
  });

  it('returns null without calling Cloudflare when TURN is not configured', async () => {
    await expect(getIceServers({ env: {}, fetchImpl: fetchImpl as typeof fetch })).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts the TTL with the bearer token and returns normalized servers', async () => {
    fetchImpl.mockResolvedValue(jsonResponse(cloudflareBody));
    const servers = await getIceServers({ env, fetchImpl: fetchImpl as typeof fetch });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://rtc.live.cloudflare.com/v1/turn/keys/key123/credentials/generate-ice-servers'
    );
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
    expect(JSON.parse(init.body as string)).toEqual({ ttl: DEFAULT_TURN_TTL_SECONDS });
    expect(init.signal).toBeInstanceOf(AbortSignal);

    expect(servers).toEqual([
      { urls: ['stun:stun.cloudflare.com:3478'] },
      {
        urls: [
          'turn:turn.cloudflare.com:3478?transport=udp',
          'turns:turn.cloudflare.com:443?transport=tcp',
        ],
        username: 'cf-user',
        credential: 'cf-pass',
      },
    ]);
  });

  it('honours a custom TTL and ignores nonsense values', async () => {
    fetchImpl.mockImplementation(async () => jsonResponse(cloudflareBody));
    await getIceServers({ env, fetchImpl: fetchImpl as typeof fetch, ttlSeconds: 90.7 });
    await getIceServers({ env, fetchImpl: fetchImpl as typeof fetch, ttlSeconds: -5 });
    const bodies = fetchImpl.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
    expect(bodies).toEqual([{ ttl: 90 }, { ttl: DEFAULT_TURN_TTL_SECONDS }]);
  });

  it('throws TurnError on a non-2xx response', async () => {
    fetchImpl.mockResolvedValue(jsonResponse({ error: 'nope' }, 401));
    await expect(getIceServers({ env, fetchImpl: fetchImpl as typeof fetch })).rejects.toBeInstanceOf(
      TurnError
    );
  });

  it('wraps network failures in TurnError', async () => {
    fetchImpl.mockRejectedValue(new Error('ECONNRESET'));
    await expect(getIceServers({ env, fetchImpl: fetchImpl as typeof fetch })).rejects.toThrow(
      /ECONNRESET/
    );
  });

  it('throws TurnError when the response has no usable servers', async () => {
    fetchImpl.mockResolvedValue(jsonResponse({ iceServers: [{ urls: ['turn:turn.cloudflare.com:53'] }] }));
    await expect(getIceServers({ env, fetchImpl: fetchImpl as typeof fetch })).rejects.toBeInstanceOf(
      TurnError
    );
  });

  it('throws TurnError when the body is not JSON', async () => {
    fetchImpl.mockResolvedValue(new Response('<html>', { status: 200 }));
    await expect(getIceServers({ env, fetchImpl: fetchImpl as typeof fetch })).rejects.toBeInstanceOf(
      TurnError
    );
  });
});
