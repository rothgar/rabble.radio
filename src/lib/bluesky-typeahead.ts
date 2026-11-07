// src/lib/bluesky-typeahead.ts
//
// Client-side helpers for the sign-in handle field: account suggestions
// from Bluesky's public AppView (app.bsky.actor.searchActorsTypeahead needs
// no auth) and a remembered last handle so the field prefills on return.

export const APPVIEW = 'https://public.api.bsky.app';
export const TYPEAHEAD_LIMIT = 6;
export const LAST_HANDLE_KEY = 'rabble.lastHandle';

export interface ActorSuggestion {
  did: string;
  handle: string;
  displayName: string | null;
  avatar: string | null;
}

interface TypeaheadResponse {
  actors?: Array<{
    did?: unknown;
    handle?: unknown;
    displayName?: unknown;
    avatar?: unknown;
  }>;
}

export interface TypeaheadOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  limit?: number;
}

/**
 * Accounts matching a partial handle or name. Empty for blank queries,
 * throws on HTTP errors and aborts; callers decide how to surface that.
 */
export async function searchActorsTypeahead(
  query: string,
  { fetchImpl = fetch, signal, limit = TYPEAHEAD_LIMIT }: TypeaheadOptions = {}
): Promise<ActorSuggestion[]> {
  const q = query.trim().replace(/^@/, '');
  if (!q) return [];
  const url = new URL('/xrpc/app.bsky.actor.searchActorsTypeahead', APPVIEW);
  url.searchParams.set('q', q);
  url.searchParams.set('limit', String(limit));
  const res = await fetchImpl(url.toString(), { headers: { accept: 'application/json' }, signal });
  if (!res.ok) throw new Error(`searchActorsTypeahead failed: HTTP ${res.status}`);
  const body = (await res.json()) as TypeaheadResponse;
  const out: ActorSuggestion[] = [];
  for (const a of body.actors ?? []) {
    if (typeof a.did !== 'string' || typeof a.handle !== 'string') continue;
    if (a.handle === 'handle.invalid') continue;
    out.push({
      did: a.did,
      handle: a.handle,
      displayName: typeof a.displayName === 'string' && a.displayName.trim() ? a.displayName : null,
      avatar: typeof a.avatar === 'string' ? a.avatar : null,
    });
  }
  return out;
}

/** The handle used at the last successful sign-in attempt, if the browser kept it. */
export function recallHandle(storage: Pick<Storage, 'getItem'> | null = safeStorage()): string {
  try {
    return storage?.getItem(LAST_HANDLE_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function rememberHandle(handle: string, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(LAST_HANDLE_KEY, handle.trim());
  } catch {
    // Private mode or blocked storage: the browser's own autofill still works.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
