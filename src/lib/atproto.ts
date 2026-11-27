// src/lib/atproto.ts
//
// Authenticated ATProto helper for the MVP. Publishes and deletes the host's
// `app.bsky.actor.status` self record (the "go live" banner) by calling
// `com.atproto.repo.putRecord` / `deleteRecord` directly with the OAuth
// access token. This avoids tying the helper to the Agent class API which
// changes between @atproto/api versions.

export interface BlueskySessionLike {
  did?: string;
  handle?: string;
}

export interface PublishLiveStatusInput {
  session: BlueskySessionLike;
  spaceUrl: string;
  title: string;
  /** Optional thumbnail URL embedded under the external embed. */
  thumb?: string;
  /** Optional correlation ID for tracing. */
  correlationId?: string;
}

export interface DeleteLiveStatusInput {
  session: BlueskySessionLike;
  /** Optional correlation ID for tracing. */
  correlationId?: string;
}

export interface LiveStatusResult {
  ok: boolean;
  record?: unknown;
  uri?: string;
  error?: string;
}

const COLLECTION = 'app.bsky.actor.status';
const RKEY = 'self';

interface PutRecordInput {
  repo: string;
  collection: string;
  rkey: string;
  record: Record<string, unknown>;
  /** Optional commit token for update validation. */
  swapCommit?: string;
  /** Override the PDS service URL. Defaults to the public PDS. */
  service?: string;
}

interface PutRecordResponse {
  uri?: string;
  cid?: string;
  commit?: { cid?: string; rev?: string };
}

interface DeleteRecordInput {
  repo: string;
  collection: string;
  rkey: string;
  service?: string;
}

export const PDS_SERVICE_URL = 'https://bsky.social';

/**
 * Build the record payload for the `app.bsky.actor.status` self record.
 * Exported for tests.
 */
export function buildLiveStatusRecord(input: PublishLiveStatusInput) {
  const external: {
    uri: string;
    title: string;
    description: string;
    thumb?: string;
  } = {
    uri: input.spaceUrl,
    title: input.title,
    description: input.title,
  };
  if (input.thumb) {
    external.thumb = input.thumb;
  }
  return {
    $type: COLLECTION,
    status: 'live' as const,
    embed: {
      $type: 'app.bsky.embed.external',
      external,
    },
    createdAt: new Date().toISOString(),
  };
}

/**
 * Minimal subset of the OAuthSession shape that we rely on. The full type
 * comes from `@atproto/oauth-client`, but we keep the dependency surface
 * small here so tests can mock it without pulling in the runtime.
 */
interface OAuthSessionLike {
  /**
   * Performs a DPoP-bound request to the PDS. The `pathname` is resolved
   * against the token's `aud`, so we pass an `/xrpc/...` pathname rather
   * than an absolute URL.
   */
  fetchHandler: (pathname: string, init?: RequestInit) => Promise<Response>;
}

async function resolveOAuthSession(did: string): Promise<OAuthSessionLike> {
  const { getOAuthClient } = await import('@/lib/auth');
  const { logger } = await import('@/lib/logger');
  const client = await getOAuthClient();
  logger.info('atproto.resolve_oauth_session.start', { did });
  let session: OAuthSessionLike | undefined;
  try {
    session = await (
      client as unknown as {
        restore: (sub: string) => Promise<OAuthSessionLike>;
      }
    ).restore(did);
  } catch (err) {
    logger.error('atproto.resolve_oauth_session.failed', { did, err });
    throw err;
  }
  if (!session || typeof session.fetchHandler !== 'function') {
    logger.error('atproto.resolve_oauth_session.failed', {
      did,
      err: new Error('restore returned no session with fetchHandler'),
    });
    throw new Error(`No OAuth session available for DID ${did}.`);
  }
  logger.info('atproto.resolve_oauth_session.success', { did });
  return session;
}

async function callXrpc<T>(input: {
  method: 'PUT' | 'GET' | 'POST' | 'DELETE';
  nsid: string;
  fetch: (
    input: string,
    init?: RequestInit
  ) => Promise<Response>;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}): Promise<T> {
  const pathname = input.query
    ? `/xrpc/${input.nsid}?${new URLSearchParams(input.query).toString()}`
    : `/xrpc/${input.nsid}`;
  const headers: Record<string, string> = {
    accept: 'application/json',
  };
  if (input.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  // Note: we deliberately do NOT set the Authorization header here. The
  // session's fetchHandler adds a DPoP-bound Authorization header based on
  // the current token set (and refreshes the token on 401 invalid_token).
  const response = await input.fetch(pathname, {
    method: input.method,
    headers,
    body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
  });
  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch {
      // ignore
    }
    throw new Error(
      `XRPC ${input.nsid} failed with ${response.status}${detail ? `: ${detail}` : ''}`
    );
  }
  if (response.status === 204) {
    return undefined as unknown as T;
  }
  return (await response.json()) as T;
}

/**
 * Publish the `app.bsky.actor.status` self record so the host shows as live
 * with an external embed pointing at the space URL.
 */
export async function publishLiveStatus(
  input: PublishLiveStatusInput
): Promise<LiveStatusResult> {
  const { logger } = await import('@/lib/logger');
  const log = logger.child({ correlationId: input.correlationId, did: input.session.did });
  if (!input.session.did) {
    log.warn('atproto.publish.missing_did');
    return { ok: false, error: 'Session is missing user DID.' };
  }
  if (!input.spaceUrl) {
    log.warn('atproto.publish.missing_space_url');
    return { ok: false, error: 'spaceUrl is required.' };
  }
  try {
    const session = await resolveOAuthSession(input.session.did);
    const params: PutRecordInput = {
      repo: input.session.did,
      collection: COLLECTION,
      rkey: RKEY,
      record: buildLiveStatusRecord(input),
    };
    const data = await callXrpc<PutRecordResponse>({
      method: 'POST',
      nsid: 'com.atproto.repo.putRecord',
      fetch: session.fetchHandler.bind(session),
      body: params as unknown as Record<string, unknown>,
    });
    log.info('atproto.publish.success', { uri: data.uri });
    return { ok: true, record: data, uri: data.uri };
  } catch (err) {
    log.error('atproto.publish.failed', { err });
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Failed to publish live status record.',
    };
  }
}

/**
 * Delete the `app.bsky.actor.status` self record.
 */
export async function deleteLiveStatus(
  input: DeleteLiveStatusInput
): Promise<LiveStatusResult> {
  const { logger } = await import('@/lib/logger');
  const log = logger.child({ correlationId: input.correlationId, did: input.session.did });
  if (!input.session.did) {
    log.warn('atproto.delete.missing_did');
    return { ok: false, error: 'Session is missing user DID.' };
  }
  try {
    const session = await resolveOAuthSession(input.session.did);
    const params: DeleteRecordInput = {
      repo: input.session.did,
      collection: COLLECTION,
      rkey: RKEY,
    };
    await callXrpc<unknown>({
      method: 'POST',
      nsid: 'com.atproto.repo.deleteRecord',
      fetch: session.fetchHandler.bind(session),
      body: params as unknown as Record<string, unknown>,
    });
    log.info('atproto.delete.success');
    return { ok: true };
  } catch (err) {
    log.error('atproto.delete.failed', { err });
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Failed to delete live status record.',
    };
  }
}

const APP_PROFILE_COLLECTION = 'community.lexicon.app.profile';

/** Known `platforms` values for `community.lexicon.app.profile`. */
export const APP_PROFILE_PLATFORM = {
  web: 'community.lexicon.app.defs#platformWeb',
  ios: 'community.lexicon.app.defs#platformIOS',
  android: 'community.lexicon.app.defs#platformAndroid',
} as const;

export interface AppProfileLink {
  /** The destination URL. The first link in the array is the primary one. */
  uri: string;
  label?: string;
}

export interface AppProfileInput {
  name: string;
  description?: string;
  /** 1-12 entries, primary destination first. */
  links: AppProfileLink[];
  /** `APP_PROFILE_PLATFORM` values this app ships on. */
  platforms?: string[];
  tags?: string[];
  createdAt?: string;
}

/**
 * Session for a script running outside the browser, authenticated with an
 * app password via `com.atproto.server.createSession` rather than the
 * web app's OAuth flow. Its `fetchHandler` matches `OAuthSessionLike` so it
 * can go through the same `callXrpc` path as the OAuth-backed helpers above.
 */
export interface AppPasswordSession {
  did: string;
  handle?: string;
  accessJwt: string;
  service: string;
}

/**
 * Build the record payload for a `community.lexicon.app.profile#self`
 * record. Exported for tests and for the one-off publish script.
 */
export function buildAppProfileRecord(
  input: AppProfileInput
): Record<string, unknown> {
  if (input.links.length < 1 || input.links.length > 12) {
    throw new Error(
      `links must have between 1 and 12 entries (got ${input.links.length}).`
    );
  }
  return {
    $type: APP_PROFILE_COLLECTION,
    name: input.name,
    description: input.description,
    links: input.links,
    platforms: input.platforms,
    tags: input.tags,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

/**
 * Authenticate with an app password, for a script run outside the browser
 * where there's no stored OAuth session to restore.
 */
export async function createAppPasswordSession(input: {
  identifier: string;
  password: string;
  service?: string;
}): Promise<AppPasswordSession> {
  const service = input.service ?? PDS_SERVICE_URL;
  const response = await fetch(
    `${service}/xrpc/com.atproto.server.createSession`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identifier: input.identifier,
        password: input.password,
      }),
    }
  );
  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch {
      // ignore
    }
    throw new Error(
      `com.atproto.server.createSession failed with ${response.status}${detail ? `: ${detail}` : ''}`
    );
  }
  const data = (await response.json()) as {
    did?: string;
    handle?: string;
    accessJwt?: string;
  };
  if (!data.did || !data.accessJwt) {
    throw new Error(
      'com.atproto.server.createSession response is missing did or accessJwt.'
    );
  }
  return { did: data.did, handle: data.handle, accessJwt: data.accessJwt, service };
}

function fetchHandlerForAppPasswordSession(
  session: AppPasswordSession
): OAuthSessionLike['fetchHandler'] {
  return async (pathname, init) =>
    fetch(`${session.service}${pathname}`, {
      ...init,
      headers: {
        ...(init?.headers as Record<string, string> | undefined),
        authorization: `Bearer ${session.accessJwt}`,
      },
    });
}

/**
 * Publish the `community.lexicon.app.profile#self` record for the given
 * app-password session. Used by `scripts/publish-app-profile.ts`, not by
 * any user-triggered flow.
 */
export async function publishAppProfile(input: {
  session: AppPasswordSession;
  profile: AppProfileInput;
}): Promise<LiveStatusResult> {
  try {
    const data = await callXrpc<PutRecordResponse>({
      method: 'POST',
      nsid: 'com.atproto.repo.putRecord',
      fetch: fetchHandlerForAppPasswordSession(input.session),
      body: {
        repo: input.session.did,
        collection: APP_PROFILE_COLLECTION,
        rkey: RKEY,
        record: buildAppProfileRecord(input.profile),
      },
    });
    return { ok: true, record: data, uri: data.uri };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Failed to publish app profile record.',
    };
  }
}

interface GetBlocksPage {
  blocks?: Array<{ did?: string }>;
  cursor?: string;
}

const BLOCKS_PAGE_SIZE = 100;

/**
 * Page through the signed-in user's own block list. Unlike follows,
 * `app.bsky.graph.getBlocks` is scoped to the authenticated caller (there's
 * no `actor` param), so this needs the OAuth session rather than a plain
 * fetch. Throws when the session can't be restored or Bluesky errors.
 */
export async function fetchBlockedDids(did: string, max = 2000): Promise<string[]> {
  const session = await resolveOAuthSession(did);
  const out: string[] = [];
  let cursor: string | undefined;
  while (out.length < max) {
    const query: Record<string, string> = { limit: String(BLOCKS_PAGE_SIZE) };
    if (cursor) query.cursor = cursor;
    const page = await callXrpc<GetBlocksPage>({
      method: 'GET',
      nsid: 'app.bsky.graph.getBlocks',
      fetch: session.fetchHandler.bind(session),
      query,
    });
    const got: string[] = [];
    for (const b of page.blocks ?? []) {
      if (typeof b.did === 'string') got.push(b.did);
    }
    out.push(...got);
    if (!page.cursor || got.length === 0) break;
    cursor = page.cursor;
  }
  return out.slice(0, max);
}
