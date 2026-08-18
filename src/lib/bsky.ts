// src/lib/bsky.ts
//
// Helpers for fetching public Bluesky post views. Used by the host-only post
// sharing endpoint to translate a bsky.app URL into an AT-URI and pull the
// latest embed from the AppView.

export interface ResolvedPostRef {
  atUri: string;
  handle: string;
  postId: string;
}

export interface PostView {
  uri: string;
  cid: string;
  indexedAt?: string;
  author?: { did?: string; handle?: string; displayName?: string };
  record?: { text?: string; createdAt?: string };
  embed?: unknown;
}

const APPVIEW_ENDPOINT = 'https://public.api.bsky.app';

/**
 * Parse a Bluesky post URL into its AT-URI. Accepts:
 *   - https://bsky.app/profile/<handle>/post/<rkey>
 *   - https://atproto.com/.../profile/<handle>/post/<rkey>
 *   - at://did:plc:.../app.bsky.feed.post/<rkey>
 */
export function resolvePostUrl(url: string): ResolvedPostRef {
  if (!url || typeof url !== 'string') {
    throw new Error('Post URL is required.');
  }
  const trimmed = url.trim();

  if (trimmed.startsWith('at://')) {
    // at://did:plc:abc/app.bsky.feed.post/rkey
    const m = trimmed.match(
      /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([A-Za-z0-9._-]+)$/
    );
    if (!m) {
      throw new Error('Invalid AT-URI. Expected at://<did>/app.bsky.feed.post/<rkey>.');
    }
    const [, did, postId] = m;
    return { atUri: trimmed, handle: did, postId };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid post URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Post URL must be http or https.');
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  // /profile/<handle>/post/<rkey>
  const profileIdx = segments.findIndex((s) => s === 'profile');
  if (profileIdx === -1) {
    throw new Error(
      'Could not find a profile segment in the post URL. Expected /profile/<handle>/post/<rkey>.'
    );
  }
  const handle = segments[profileIdx + 1];
  const postIdx = segments.findIndex((s) => s === 'post');
  if (postIdx === -1 || !segments[postIdx + 1]) {
    throw new Error('Could not find a post id in the URL.');
  }
  if (!handle) {
    throw new Error('Could not resolve post handle from URL.');
  }
  const postId = segments[postIdx + 1];
  // Without resolving handle to DID we use the handle-based AT-URI form, which
  // AppView accepts. If a DID is needed callers can resolve with resolveHandle
  // from @atproto/api; for the MVP this is sufficient.
  const atUri = `at://${handle}/app.bsky.feed.post/${postId}`;
  return { atUri, handle, postId };
}

/**
 * Fetch a post view from the public Bluesky AppView using getPosts.
 */
export async function fetchPostView(atUri: string): Promise<PostView> {
  const endpoint = new URL('/xrpc/app.bsky.feed.getPosts', APPVIEW_ENDPOINT);
  endpoint.searchParams.set('uris', atUri);

  let response: Response;
  try {
    response = await fetch(endpoint.toString(), {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : 'Failed to contact Bluesky AppView.'
    );
  }

  if (!response.ok) {
    throw new Error(
      `Bluesky AppView returned ${response.status} for ${atUri}.`
    );
  }

  const body = (await response.json()) as { posts?: PostView[] };
  const post = body.posts?.[0];
  if (!post) {
    throw new Error('Bluesky AppView returned no post for that URI.');
  }
  return post;
}
