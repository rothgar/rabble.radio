// tests/lib/auth.test.ts
//
// Verifies the OAuth client metadata builder used for local development. The
// real OAuth flow requires a running PDS + browser interaction; here we
// confirm the loopback metadata has the shape Bluesky expects.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildAtprotoLoopbackClientMetadata,
} from '@atproto/oauth-client-node';
import { importPKCS8 } from 'jose';

/**
 * Reset the cached OAuth client / metadata / JWKS singletons so each test
 * sees a fresh init based on the current env values.
 */
function resetAuthState(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__bluesky_spaces_oauth_init__ = undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__bluesky_spaces_oauth_loopback__ = undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__bluesky_spaces_state_store__ = undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__bluesky_spaces_session_store__ = undefined;
}

function restoreEnv(prev: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(prev)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe('OAuth client metadata (loopback)', () => {
  it('builds metadata with a http://127.0.0.1 client_id', () => {
    const meta = buildAtprotoLoopbackClientMetadata({
      scope: 'atproto transition:generic',
    });
    expect(meta.client_id).toMatch(/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])/);
    expect(meta.scope).toContain('atproto');
    expect(Array.isArray(meta.redirect_uris)).toBe(true);
    expect(meta.redirect_uris.length).toBeGreaterThan(0);
    expect(meta.token_endpoint_auth_method).toBe('none');
  });

  it('each redirect_uri is a loopback URL', () => {
    const meta = buildAtprotoLoopbackClientMetadata({
      scope: 'atproto',
    });
    for (const uri of meta.redirect_uris) {
      expect(uri).toMatch(/^http:\/\/(127\.0\.0\.1|\[::1\])/);
    }
  });
});

describe('oauthMode()', () => {
  const prev: Record<string, string | undefined> = {};

  afterEach(() => {
    restoreEnv(prev);
    resetAuthState();
    vi.resetModules();
  });

  it('returns "loopback" when PUBLIC_URL is unset', async () => {
    prev.PUBLIC_URL = process.env.PUBLIC_URL;
    delete process.env.PUBLIC_URL;
    vi.resetModules();
    const { oauthMode } = await import('@/lib/auth');
    expect(oauthMode()).toBe('loopback');
  });

  it('returns "public" when PUBLIC_URL is set', async () => {
    prev.PUBLIC_URL = process.env.PUBLIC_URL;
    process.env.PUBLIC_URL = 'https://spaces.example.com';
    vi.resetModules();
    const { oauthMode } = await import('@/lib/auth');
    expect(oauthMode()).toBe('public');
  });
});

describe('resolvePublicClientId()', () => {
  const prev: Record<string, string | undefined> = {};

  afterEach(() => {
    restoreEnv(prev);
    resetAuthState();
    vi.resetModules();
  });

  it('defaults to ${PUBLIC_URL}/oauth-client-metadata.json', async () => {
    prev.BLUESKY_OAUTH_CLIENT_ID = process.env.BLUESKY_OAUTH_CLIENT_ID;
    delete process.env.BLUESKY_OAUTH_CLIENT_ID;
    vi.resetModules();
    const { resolvePublicClientId } = await import('@/lib/auth');
    expect(resolvePublicClientId('https://spaces.example.com')).toBe(
      'https://spaces.example.com/oauth-client-metadata.json'
    );
    expect(resolvePublicClientId('https://spaces.example.com/')).toBe(
      'https://spaces.example.com/oauth-client-metadata.json'
    );
  });

  it('honours BLUESKY_OAUTH_CLIENT_ID override', async () => {
    prev.BLUESKY_OAUTH_CLIENT_ID = process.env.BLUESKY_OAUTH_CLIENT_ID;
    process.env.BLUESKY_OAUTH_CLIENT_ID = 'https://other.example.com/meta';
    vi.resetModules();
    const { resolvePublicClientId } = await import('@/lib/auth');
    expect(resolvePublicClientId('https://spaces.example.com')).toBe(
      'https://other.example.com/meta'
    );
  });
});

describe('resolvePublicRedirectUri()', () => {
  const prev: Record<string, string | undefined> = {};

  afterEach(() => {
    restoreEnv(prev);
    resetAuthState();
    vi.resetModules();
  });

  it('defaults to ${PUBLIC_URL}/api/auth/bluesky/callback', async () => {
    prev.BLUESKY_OAUTH_REDIRECT_URI = process.env.BLUESKY_OAUTH_REDIRECT_URI;
    delete process.env.BLUESKY_OAUTH_REDIRECT_URI;
    vi.resetModules();
    const { resolvePublicRedirectUri } = await import('@/lib/auth');
    expect(resolvePublicRedirectUri('https://spaces.example.com')).toBe(
      'https://spaces.example.com/api/auth/bluesky/callback'
    );
  });
});

describe('getPublicClientMetadata()', () => {
  const prev: Record<string, string | undefined> = {};
  let generatedPem: string | undefined;

  beforeEach(async () => {
    for (const k of [
      'PUBLIC_URL',
      'JWKS_PRIVATE_KEY',
      'JWKS_PUBLIC_KEY',
      'BLUESKY_OAUTH_CLIENT_ID',
      'BLUESKY_OAUTH_REDIRECT_URI',
      'LOGO_URL',
    ]) {
      prev[k] = process.env[k];
    }
    const { generateKeyPair, exportPKCS8 } = await import('jose');
    const { privateKey } = await generateKeyPair('ES256', { extractable: true });
    generatedPem = await exportPKCS8(privateKey);
  });

  afterEach(() => {
    restoreEnv(prev);
    resetAuthState();
    vi.resetModules();
  });

  it('returns a hosted client metadata document when PUBLIC_URL is set', async () => {
    process.env.PUBLIC_URL = 'https://spaces.example.com';
    process.env.JWKS_PRIVATE_KEY = generatedPem!;
    vi.resetModules();

    const { getPublicClientMetadata } = await import('@/lib/auth');
    const metadata = await getPublicClientMetadata();

    expect(metadata.client_id).toBe(
      'https://spaces.example.com/oauth-client-metadata.json'
    );
    expect(metadata.client_name).toBe('Rabble');
    expect(metadata.client_uri).toBe('https://spaces.example.com');
    expect(metadata.redirect_uris).toEqual([
      'https://spaces.example.com/api/auth/bluesky/callback',
    ]);
    expect(metadata.scope).toBe('atproto transition:generic');
    expect(metadata.grant_types).toEqual(['authorization_code', 'refresh_token']);
    expect(metadata.response_types).toEqual(['code']);
    expect(metadata.token_endpoint_auth_method).toBe('private_key_jwt');
    expect(metadata.token_endpoint_auth_signing_alg).toBe('ES256');
    expect(metadata.dpop_bound_access_tokens).toBe(true);
    expect(metadata.jwks_uri).toBe(
      'https://spaces.example.com/.well-known/jwks.json'
    );
  });

  it('includes logo_uri only when LOGO_URL is set', async () => {
    process.env.PUBLIC_URL = 'https://spaces.example.com';
    process.env.JWKS_PRIVATE_KEY = generatedPem!;
    process.env.LOGO_URL = 'https://spaces.example.com/logo.png';
    vi.resetModules();

    const { getPublicClientMetadata } = await import('@/lib/auth');
    const metadata = await getPublicClientMetadata();
    expect(metadata.logo_uri).toBe('https://spaces.example.com/logo.png');
  });

  it('throws when PUBLIC_URL is unset', async () => {
    delete process.env.PUBLIC_URL;
    delete process.env.JWKS_PRIVATE_KEY;
    vi.resetModules();

    const { getPublicClientMetadata } = await import('@/lib/auth');
    await expect(getPublicClientMetadata()).rejects.toThrow(/PUBLIC_URL/);
  });

  it('throws when JWKS_PRIVATE_KEY is missing', async () => {
    process.env.PUBLIC_URL = 'https://spaces.example.com';
    delete process.env.JWKS_PRIVATE_KEY;
    vi.resetModules();

    const { getPublicClientMetadata } = await import('@/lib/auth');
    await expect(getPublicClientMetadata()).rejects.toThrow(/JWKS_PRIVATE_KEY/);
  });
});

describe('getPublicJwks()', () => {
  const prev: Record<string, string | undefined> = {};
  let generatedPem: string | undefined;

  beforeEach(async () => {
    for (const k of ['PUBLIC_URL', 'JWKS_PRIVATE_KEY', 'JWKS_PUBLIC_KEY']) {
      prev[k] = process.env[k];
    }
    const { generateKeyPair, exportPKCS8 } = await import('jose');
    const { privateKey } = await generateKeyPair('ES256', { extractable: true });
    generatedPem = await exportPKCS8(privateKey);
  });

  afterEach(() => {
    restoreEnv(prev);
    resetAuthState();
    vi.resetModules();
  });

  it('derives JWKS from the private key when JWKS_PUBLIC_KEY is not set', async () => {
    process.env.PUBLIC_URL = 'https://spaces.example.com';
    process.env.JWKS_PRIVATE_KEY = generatedPem!;
    delete process.env.JWKS_PUBLIC_KEY;
    vi.resetModules();

    const { getPublicJwks } = await import('@/lib/auth');
    const jwks = await getPublicJwks();
    expect(jwks.keys).toHaveLength(1);
    const k = jwks.keys[0];
    expect(k.kty).toBe('EC');
    expect(k.crv).toBe('P-256');
    expect(k.use).toBe('sig');
    expect(k.alg).toBe('ES256');
    expect(k.kid).toBeTruthy();
    // Private material must NOT be exposed.
    expect((k as unknown as Record<string, unknown>).d).toBeUndefined();
  });

  it('uses JWKS_PUBLIC_KEY override when set', async () => {
    process.env.PUBLIC_URL = 'https://spaces.example.com';
    process.env.JWKS_PRIVATE_KEY = generatedPem!;
    process.env.JWKS_PUBLIC_KEY = JSON.stringify({
      keys: [{ kid: 'rotated-key', kty: 'EC', crv: 'P-256', x: 'a', y: 'b' }],
    });
    vi.resetModules();

    const { getPublicJwks } = await import('@/lib/auth');
    const jwks = await getPublicJwks();
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0].kid).toBe('rotated-key');
  });

  it('throws when PUBLIC_URL is unset', async () => {
    delete process.env.PUBLIC_URL;
    delete process.env.JWKS_PRIVATE_KEY;
    vi.resetModules();

    const { getPublicJwks } = await import('@/lib/auth');
    await expect(getPublicJwks()).rejects.toThrow(/PUBLIC_URL/);
  });
});

describe('getOAuthClient() in public mode', () => {
  const prev: Record<string, string | undefined> = {};
  let generatedPem: string | undefined;

  beforeEach(async () => {
    for (const k of ['PUBLIC_URL', 'JWKS_PRIVATE_KEY', 'JWKS_PUBLIC_KEY']) {
      prev[k] = process.env[k];
    }
    const { generateKeyPair, exportPKCS8 } = await import('jose');
    const { privateKey } = await generateKeyPair('ES256', { extractable: true });
    generatedPem = await exportPKCS8(privateKey);
    // Silence the unused-var lint while still asserting the import works.
    void importPKCS8;
  });

  afterEach(() => {
    restoreEnv(prev);
    resetAuthState();
    vi.resetModules();
  });

  it('returns a promise that resolves to a client in public mode', async () => {
    process.env.PUBLIC_URL = 'https://spaces.example.com';
    process.env.JWKS_PRIVATE_KEY = generatedPem!;
    vi.resetModules();

    const { getOAuthClient } = await import('@/lib/auth');
    const client = await getOAuthClient();
    expect(typeof client.authorize).toBe('function');
    expect(typeof client.callback).toBe('function');
    expect(typeof client.restore).toBe('function');
    expect(typeof client.revoke).toBe('function');
  });
});
