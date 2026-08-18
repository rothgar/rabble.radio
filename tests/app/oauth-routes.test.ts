// tests/app/oauth-routes.test.ts
//
// Tests for the public OAuth routes:
//   GET /oauth-client-metadata.json
//   GET /.well-known/jwks.json

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateKeyPair, exportPKCS8, exportJWK } from 'jose';

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

const originalEnv: Record<string, string | undefined> = {};
let generatedPem: string | undefined;
let generatedJwk: Record<string, unknown> | undefined;

async function setPublicMode(): Promise<void> {
  process.env.PUBLIC_URL = 'https://spaces.example.com';
  process.env.JWKS_PRIVATE_KEY = generatedPem!;
  process.env.JWKS_PUBLIC_KEY = JSON.stringify({ keys: [generatedJwk] });
}

beforeEach(async () => {
  for (const k of [
    'PUBLIC_URL',
    'JWKS_PRIVATE_KEY',
    'JWKS_PUBLIC_KEY',
    'BLUESKY_OAUTH_CLIENT_ID',
    'BLUESKY_OAUTH_REDIRECT_URI',
    'LOGO_URL',
  ]) {
    originalEnv[k] = process.env[k];
  }
  const { publicKey, privateKey } = await generateKeyPair('ES256', {
    extractable: true,
  });
  generatedPem = await exportPKCS8(privateKey);
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-kid-1';
  jwk.use = 'sig';
  jwk.alg = 'ES256';
  generatedJwk = jwk as Record<string, unknown>;
});

afterEach(() => {
  restoreEnv(originalEnv);
  resetAuthState();
  vi.resetModules();
});

describe('GET /oauth-client-metadata.json', () => {
  it('serves the hosted client metadata when PUBLIC_URL is set', async () => {
    await setPublicMode();
    const { GET } = await import('@/app/oauth-client-metadata.json/route');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(res.headers.get('cache-control')).toMatch(/max-age=3600/);
    const body = await res.json();
    expect(body.client_id).toBe(
      'https://spaces.example.com/oauth-client-metadata.json'
    );
    expect(body.token_endpoint_auth_method).toBe('private_key_jwt');
    expect(body.jwks_uri).toBe(
      'https://spaces.example.com/.well-known/jwks.json'
    );
    expect(body.dpop_bound_access_tokens).toBe(true);
    expect(body.grant_types).toEqual(['authorization_code', 'refresh_token']);
  });

  it('returns 404 in loopback mode', async () => {
    delete process.env.PUBLIC_URL;
    delete process.env.JWKS_PRIVATE_KEY;
    const { GET } = await import('@/app/oauth-client-metadata.json/route');
    const res = await GET();
    expect(res.status).toBe(404);
  });
});

describe('GET /.well-known/jwks.json', () => {
  it('serves the JWKS when PUBLIC_URL is set', async () => {
    await setPublicMode();
    const { GET } = await import('@/app/.well-known/jwks.json/route');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(res.headers.get('cache-control')).toMatch(/max-age=3600/);
    const body = await res.json();
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0].kid).toBe('test-kid-1');
    expect(body.keys[0].use).toBe('sig');
    expect(body.keys[0].alg).toBe('ES256');
    // No private material.
    expect(body.keys[0].d).toBeUndefined();
  });

  it('returns 404 in loopback mode', async () => {
    delete process.env.PUBLIC_URL;
    delete process.env.JWKS_PRIVATE_KEY;
    const { GET } = await import('@/app/.well-known/jwks.json/route');
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('returns 500 when JWKS_PRIVATE_KEY is missing', async () => {
    process.env.PUBLIC_URL = 'https://spaces.example.com';
    delete process.env.JWKS_PRIVATE_KEY;
    delete process.env.JWKS_PUBLIC_KEY;
    const { GET } = await import('@/app/.well-known/jwks.json/route');
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('oauth_jwks_unavailable');
  });
});
