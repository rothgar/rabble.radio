// src/lib/auth.ts
//
// Bluesky OAuth client singleton for the MVP.
//
// Two modes are supported:
//
//   - "loopback" (no PUBLIC_URL set): the local dev flow. Metadata is built
//     by `buildAtprotoLoopbackClientMetadata`; the PDS fetches it from a
//     short-lived local listener and the user pastes the redirect URL back
//     into the browser.
//
//   - "public"   (PUBLIC_URL set):     the hosted `private_key_jwt` flow.
//     The app serves a stable client metadata document at
//     `${PUBLIC_URL}/oauth-client-metadata.json` and a JWKS at
//     `${PUBLIC_URL}/.well-known/jwks.json`. The PDS fetches the JWKS to
//     verify the signed client assertions we mint with the configured
//     ES256 private key.
//
// The mode is chosen at process start from the PUBLIC_URL env var. All
// state/session stores are still in-memory Maps for the MVP single
// replica; TODO: replace with Redis before scaling out.

import {
  NodeOAuthClient,
  buildAtprotoLoopbackClientMetadata,
  JoseKey,
} from '@atproto/oauth-client-node';
import type {
  NodeSavedSession,
  NodeSavedSessionStore,
  NodeSavedState,
  NodeSavedStateStore,
  ClientMetadata,
  OAuthClientMetadataInput,
} from '@atproto/oauth-client-node';
import { importPKCS8 } from 'jose';
import { createLogger } from '@/lib/logger';

const APP_NAME = process.env.APP_NAME?.trim() || 'Rabble';
const PUBLIC_URL = process.env.PUBLIC_URL?.trim() || '';

const SCOPE = 'atproto transition:generic';

// Dev-only loopback metadata. The function derives a `client_id` from the
// `redirect_uris` you pass in (or picks sensible defaults).
const loopbackMetadata = buildAtprotoLoopbackClientMetadata({
  scope: SCOPE,
});

interface OAuthSessionLike {
  sub: string;
  did(): string;
}

interface OAuthClientLike {
  authorize(handle: string, options?: { state?: string; signal?: AbortSignal }): Promise<URL>;
  callback(
    params: URLSearchParams,
    options?: { state?: string; signal?: AbortSignal }
  ): Promise<{ session: OAuthSessionLike; state: string | null }>;
  revoke(sub: string): Promise<void>;
  restore(sub: string): Promise<OAuthSessionLike>;
}

/** Public JWK shape we serve from `/.well-known/jwks.json`. */
export interface PublicJwk {
  kty: string;
  crv?: string;
  x?: string;
  y?: string;
  n?: string;
  e?: string;
  alg?: string;
  use?: 'sig' | 'enc';
  kid?: string;
}

export interface PublicJwks {
  keys: PublicJwk[];
}

interface PublicInitResult {
  client: OAuthClientLike;
  metadata: ClientMetadata;
  jwks: PublicJwks;
}

declare global {
  // eslint-disable-next-line no-var
  var __bluesky_spaces_oauth_init__: Promise<PublicInitResult> | undefined;
  // eslint-disable-next-line no-var
  var __bluesky_spaces_oauth_loopback__: OAuthClientLike | undefined;
  // eslint-disable-next-line no-var
  var __bluesky_spaces_state_store__: NodeSavedStateStore | undefined;
  // eslint-disable-next-line no-var
  var __bluesky_spaces_session_store__: NodeSavedSessionStore | undefined;
}

const initLog = createLogger({ correlationId: 'oauth-init' });

function createMemoryStateStore(): NodeSavedStateStore {
  const map = new Map<string, NodeSavedState>();
  return {
    async get(key: string) {
      return map.get(key);
    },
    async set(key: string, value: NodeSavedState) {
      map.set(key, value);
    },
    async del(key: string) {
      map.delete(key);
    },
    async clear() {
      map.clear();
    },
  };
}

import { createPrismaSessionStore } from '@/lib/oauth-session-store';

function createMemorySessionStore(): NodeSavedSessionStore {
  const map = new Map<string, NodeSavedSession>();
  return {
    async get(key: string) {
      return map.get(key);
    },
    async set(key: string, value: NodeSavedSession) {
      map.set(key, value);
    },
    async del(key: string) {
      map.delete(key);
    },
    async clear() {
      map.clear();
    },
  };
}

function getStateStore(): NodeSavedStateStore {
  if (!globalThis.__bluesky_spaces_state_store__) {
    globalThis.__bluesky_spaces_state_store__ = createMemoryStateStore();
  }
  return globalThis.__bluesky_spaces_state_store__;
}

function getSessionStore(): NodeSavedSessionStore {
  if (!globalThis.__bluesky_spaces_session_store__) {
    // Persist OAuth sessions in Postgres so they survive server restarts
    // and can be shared across replicas.
    globalThis.__bluesky_spaces_session_store__ = createPrismaSessionStore();
  }
  return globalThis.__bluesky_spaces_session_store__;
}

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, '');
}

/**
 * Derive the public-mode client_id from env (with fallback to
 * `${PUBLIC_URL}/oauth-client-metadata.json`).
 */
export function resolvePublicClientId(publicUrl: string): string {
  const explicit = process.env.BLUESKY_OAUTH_CLIENT_ID?.trim();
  if (explicit) return explicit;
  return `${normalizeBaseUrl(publicUrl)}/oauth-client-metadata.json`;
}

/**
 * Derive the public-mode redirect URI from env (with fallback to
 * `${PUBLIC_URL}/api/auth/bluesky/callback`).
 */
export function resolvePublicRedirectUri(publicUrl: string): string {
  const explicit = process.env.BLUESKY_OAUTH_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  return `${normalizeBaseUrl(publicUrl)}/api/auth/bluesky/callback`;
}

/**
 * Build the hosted client metadata document for the public OAuth flow.
 *
 * `logo_uri` is included only when LOGO_URL is set so the PDS does not
 * 404 on a missing asset.
 */
function buildPublicMetadata(publicUrl: string): OAuthClientMetadataInput {
  const base = normalizeBaseUrl(publicUrl);
  const logo = process.env.LOGO_URL?.trim() || '';
  const metadata: OAuthClientMetadataInput = {
    client_id: resolvePublicClientId(base),
    client_name: APP_NAME,
    client_uri: base,
    redirect_uris: [resolvePublicRedirectUri(base)],
    scope: SCOPE,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'private_key_jwt',
    token_endpoint_auth_signing_alg: 'ES256',
    dpop_bound_access_tokens: true,
    jwks_uri: `${base}/.well-known/jwks.json`,
  };
  if (logo) {
    metadata.logo_uri = logo;
  }
  return metadata;
}

/**
 * Load the JWKS private key from JWKS_PRIVATE_KEY, returning the loaded
 * JoseKey.
 */
async function loadPrivateKey(): Promise<JoseKey> {
  const pem = process.env.JWKS_PRIVATE_KEY?.trim();
  if (!pem) {
    throw new Error(
      'JWKS_PRIVATE_KEY is required when PUBLIC_URL is set. Generate one with `pnpm gen:jwks`.'
    );
  }

  // Pick a kid. Prefer one exported alongside the matching JWKS_PUBLIC_KEY so
  // the JWKS the PDS fetches lines up with the assertion signer. Fall back
  // to JWKS_KID env var, then to a stable default.
  const operatorJwks = resolveOperatorJwks();
  const kidFromJwks = operatorJwks?.keys?.find(
    (k) => typeof k.kid === 'string'
  )?.kid;
  const kid =
    kidFromJwks ||
    process.env.JWKS_KID?.trim() ||
    'rabble-oauth-key-1';

  // JoseKey.fromImportable accepts a KeyLike (jose's CryptoKey) plus a kid.
  // We need extractable=true because JoseKey re-exports the JWK internally.
  const cryptoKey = await importPKCS8(pem, 'ES256', { extractable: true });
  return JoseKey.fromImportable(cryptoKey, kid);
}

/**
 * Build the public JWKS from the loaded JoseKey. Strips private material
 * (the `d` coordinate for EC keys). Falls back to operator-supplied
 * JWKS_PUBLIC_KEY if provided.
 */
function buildPublicJwks(joseKey: JoseKey): PublicJwks {
  const jwk = joseKey.jwk as Record<string, unknown>;
  // Strip private key material.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { d: _d, oth: _oth, ...pub } = jwk;
  return {
    keys: [
      {
        ...pub,
        alg: (jwk.alg as string | undefined) ?? 'ES256',
        use: 'sig',
      } as PublicJwk,
    ],
  };
}

function resolveOperatorJwks(): PublicJwks | null {
  const raw = process.env.JWKS_PUBLIC_KEY?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PublicJwks;
    if (parsed && Array.isArray(parsed.keys)) {
      return parsed;
    }
    return null;
  } catch (err) {
    initLog.warn('oauth.init.jwks_public_key_invalid', {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function initPublicOAuth(): Promise<PublicInitResult> {
  if (!PUBLIC_URL) {
    throw new Error(
      'initPublicOAuth() called but PUBLIC_URL is not set; this is a bug.'
    );
  }
  const joseKey = await loadPrivateKey();
  const metadata = buildPublicMetadata(PUBLIC_URL) as unknown as ClientMetadata;

  // Operator-supplied JWKS wins (lets them pin alg/use/extra keys during
  // rotation). Otherwise derive from the loaded key, ensuring sig + alg.
  const jwks = resolveOperatorJwks() ?? buildPublicJwks(joseKey);

  initLog.info('oauth.init.public', {
    clientId: metadata.client_id,
    jwksUri: metadata.jwks_uri,
    keys: jwks.keys.length,
  });

  const client = new NodeOAuthClient({
    clientMetadata: metadata,
    keyset: [joseKey],
    stateStore: getStateStore(),
    sessionStore: getSessionStore(),
    responseMode: 'query',
  });

  return {
    client: client as unknown as OAuthClientLike,
    metadata,
    jwks,
  };
}

function initLoopbackOAuth(): OAuthClientLike {
  initLog.info('oauth.init.loopback');
  const client = new NodeOAuthClient({
    clientMetadata: loopbackMetadata,
    stateStore: getStateStore(),
    sessionStore: getSessionStore(),
    responseMode: 'query',
  });
  return client as unknown as OAuthClientLike;
}

function getPublicInit(): Promise<PublicInitResult> {
  if (globalThis.__bluesky_spaces_oauth_init__) {
    return globalThis.__bluesky_spaces_oauth_init__;
  }
  globalThis.__bluesky_spaces_oauth_init__ = initPublicOAuth();
  return globalThis.__bluesky_spaces_oauth_init__;
}

/**
 * Returns the OAuth client singleton. The first call (per process) builds
 * the client asynchronously; concurrent callers share the same Promise.
 *
 * In loopback mode the client is built synchronously (no JWKS to load).
 *
 * State and session stores are in-memory Maps. Acceptable for MVP single
 * replica; TODO: replace with Redis before scaling out.
 */
export function getOAuthClient(): Promise<OAuthClientLike> {
  if (PUBLIC_URL) {
    return getPublicInit().then((r) => r.client);
  }
  if (!globalThis.__bluesky_spaces_oauth_loopback__) {
    globalThis.__bluesky_spaces_oauth_loopback__ = initLoopbackOAuth();
  }
  return Promise.resolve(globalThis.__bluesky_spaces_oauth_loopback__);
}

/**
 * Returns the validated hosted client metadata document. Throws when the
 * app is running in loopback mode (no PUBLIC_URL) because the document is
 * only meaningful in public mode.
 */
export async function getPublicClientMetadata(): Promise<ClientMetadata> {
  if (!PUBLIC_URL) {
    throw new Error(
      'getPublicClientMetadata() called without PUBLIC_URL set; loopback mode does not serve a metadata document.'
    );
  }
  const { metadata } = await getPublicInit();
  return metadata;
}

/**
 * Returns the JWKS to serve from `/.well-known/jwks.json`. Throws when the
 * app is running in loopback mode (no PUBLIC_URL).
 */
export async function getPublicJwks(): Promise<PublicJwks> {
  if (!PUBLIC_URL) {
    throw new Error(
      'getPublicJwks() called without PUBLIC_URL set; loopback mode does not serve a JWKS.'
    );
  }
  const { jwks } = await getPublicInit();
  return jwks;
}

export function oauthMode(): 'loopback' | 'public' {
  return PUBLIC_URL ? 'public' : 'loopback';
}

/**
 * Test-only: clear the cached OAuth client + metadata + JWKS. Production
 * code should never call this; the singleton is reused across requests.
 */
export function __resetOAuthClientForTests(): void {
  globalThis.__bluesky_spaces_oauth_init__ = undefined;
  globalThis.__bluesky_spaces_oauth_loopback__ = undefined;
  globalThis.__bluesky_spaces_state_store__ = undefined;
  globalThis.__bluesky_spaces_session_store__ = undefined;
}

export const appName = APP_NAME;
