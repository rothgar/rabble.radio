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

export function __resetAtprotoAgentForTests(): void {
  // Test helper retained for backwards compatibility; no cached state to clear
  // when we go straight to fetch.
}

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
}): Promise<T> {
  const pathname = `/xrpc/${input.nsid}`;
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
