// src/lib/atproto-runtime.ts
//
// Pieces the atproto OAuth client needs that differ between Node and
// Cloudflare Workers.
//
// The stock atproto resolvers build requests with `redirect: "error"`, which
// workerd refuses ("use manual and check the status"). So handles and DID
// documents are resolved here with plain fetch, and the fetch handed to the
// OAuth client emulates `redirect: "error"` with `manual` plus a throw.

export const HANDLE_RESOLVER_URL = 'https://bsky.social';
export const PLC_DIRECTORY_URL = 'https://plc.directory';

export interface ResolvedIdentity {
  did: string;
  didDoc: DidDocumentLike;
  handle: string;
}

export interface DidDocumentLike {
  id: string;
  alsoKnownAs?: string[];
  service?: Array<{ id: string; type: string; serviceEndpoint: string | Record<string, unknown> }>;
  [key: string]: unknown;
}

const HANDLE_INVALID = 'handle.invalid';

/** `redirect: "error"` emulation for runtimes that only know follow/manual. */
export const workerFetch: typeof fetch = async (input, init) => {
  const wantsError =
    init?.redirect === 'error' || (input instanceof Request && input.redirect === 'error');
  if (!wantsError) return fetch(input, init);
  const response =
    input instanceof Request
      ? await fetch(new Request(input, { ...init, redirect: 'manual' }))
      : await fetch(input, { ...init, redirect: 'manual' });
  if (response.status >= 300 && response.status < 400) {
    throw new TypeError(`Unexpected redirect (${response.status}) fetching ${response.url}`);
  }
  return response;
};

export async function resolveHandleToDid(
  handle: string,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}
): Promise<string> {
  const f = options.fetchImpl ?? fetch;
  const url = new URL('/xrpc/com.atproto.identity.resolveHandle', HANDLE_RESOLVER_URL);
  url.searchParams.set('handle', handle);
  const res = await f(url, { signal: options.signal, redirect: 'manual' });
  if (res.status !== 200) {
    throw new Error(`Could not resolve handle ${handle} (HTTP ${res.status})`);
  }
  const body = (await res.json()) as { did?: string };
  if (!body.did) throw new Error(`Could not resolve handle ${handle}`);
  return body.did;
}

export function didDocumentUrl(did: string): string {
  if (did.startsWith('did:plc:')) {
    return `${PLC_DIRECTORY_URL}/${encodeURIComponent(did)}`;
  }
  if (did.startsWith('did:web:')) {
    const host = decodeURIComponent(did.slice('did:web:'.length)).replace(/:/g, '/');
    return `https://${host}/.well-known/did.json`;
  }
  throw new Error(`Unsupported DID method: ${did}`);
}

export async function resolveDidDocument(
  did: string,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}
): Promise<DidDocumentLike> {
  const f = options.fetchImpl ?? fetch;
  const res = await f(didDocumentUrl(did), {
    signal: options.signal,
    redirect: 'manual',
    headers: { accept: 'application/did+ld+json,application/json' },
  });
  if (res.status !== 200) {
    throw new Error(`Could not fetch DID document for ${did} (HTTP ${res.status})`);
  }
  const doc = (await res.json()) as DidDocumentLike;
  if (doc.id !== did) throw new Error(`DID document id mismatch for ${did}`);
  return doc;
}

export function handleFromDidDocument(doc: DidDocumentLike): string {
  const aka = (doc.alsoKnownAs ?? []).find((a) => a.startsWith('at://'));
  return aka ? aka.slice('at://'.length) : HANDLE_INVALID;
}

/**
 * Identity resolver for the atproto OAuth client. Accepts a handle or a DID,
 * verifies the handle bidirectionally, and returns the DID document.
 */
export const identityResolver = {
  async resolve(
    identifier: string,
    options?: { signal?: AbortSignal; noCache?: boolean }
  ): Promise<ResolvedIdentity> {
    const isDid = identifier.startsWith('did:');
    const did = isDid ? identifier : await resolveHandleToDid(identifier, options);
    const didDoc = await resolveDidDocument(did, options);
    const handle = handleFromDidDocument(didDoc);
    if (!isDid && handle.toLowerCase() !== identifier.toLowerCase()) {
      throw new Error(`Handle ${identifier} does not match its DID document`);
    }
    return { did, didDoc, handle };
  },
};
