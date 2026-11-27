// src/lib/api.ts
//
// Shared helpers for route handlers under src/app/api: the session check,
// JSON body parsing, and error envelope that nearly every route hand-rolled
// before this module existed. Each returns a plain NextResponse on failure
// so callers can `if (x instanceof NextResponse) return x;` and keep going
// with a narrowed success value otherwise.

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';

export interface CurrentUser {
  did: string;
  handle: string;
  displayName: string | null;
}

/** Build the `{ error, message? }` envelope (merging in any extra fields) used across routes. */
export function jsonError(
  status: number,
  error: string,
  message?: string,
  extra?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    { ...extra, error, ...(message !== undefined ? { message } : {}) },
    { status }
  );
}

/**
 * The current session's user, or a 401 Response when signed out. `extra`
 * merges additional fields into the 401 body (e.g. `{ ok: false }` for the
 * handful of routes whose envelope carries that flag).
 */
export async function requireUser(
  extra?: Record<string, unknown>
): Promise<CurrentUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, 'unauthorized', undefined, extra);
  return user;
}

/**
 * Parse the request body as JSON, or a 400 `invalid_json` Response. `message`
 * lets callers keep whatever wording their route already returned.
 */
export async function readJson<T>(
  request: Request,
  message = 'Request body must be JSON.',
  extra?: Record<string, unknown>
): Promise<T | NextResponse> {
  try {
    return (await request.json()) as T;
  } catch {
    return jsonError(400, 'invalid_json', message, extra);
  }
}
