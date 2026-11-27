// src/lib/post-json.ts
//
// Client-safe POST + parse. Every call site across the components was
// repeating the same `content-type` header, the same `res.json().catch(()
// => ({}))` guard against an empty or non-JSON body, and the same
// `body.message ?? body.error ?? fallback` shape for the error text.

/**
 * POSTs `body` as JSON to `url` and returns the parsed response body.
 * On a non-ok response it throws an `Error` whose message is the server's
 * `message` or `error`, falling back to `${fallback} (HTTP <status>).`
 * (or `Request failed (HTTP <status>).` with no `fallback`) when the server
 * gave neither.
 */
export async function postJson<T = unknown>(url: string, body?: unknown, fallback?: string): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const parsed = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) {
    throw new Error(parsed.message || parsed.error || `${fallback ?? 'Request failed'} (HTTP ${res.status}).`);
  }
  return parsed as T;
}
