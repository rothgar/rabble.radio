// src/lib/session.ts
//
// iron-session wrapper for the Bluesky Spaces MVP. Stores the authenticated
// DID and handle in a sealed cookie. The cookie name is `bs_spaces_session`
// and the encryption key is derived from SESSION_SECRET.

import { cookies } from 'next/headers';
import { getIronSession, type SessionOptions } from 'iron-session';

export interface BlueskySession {
  did?: string;
  handle?: string;
}

export interface AppSessionData {
  bluesky?: BlueskySession;
}

const COOKIE_NAME = 'bs_spaces_session';

function sessionOptions(): SessionOptions {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      'SESSION_SECRET environment variable is required for signed session cookies.'
    );
  }
  if (secret.length < 32) {
    throw new Error(
      'SESSION_SECRET must be at least 32 characters long.'
    );
  }
  return {
    password: secret,
    cookieName: COOKIE_NAME,
    cookieOptions: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    },
  };
}

/**
 * Read the current session from request cookies (server components / route
 * handlers). Always returns an object; properties are undefined until
 * `setSession` is called.
 */
export async function getSession(): Promise<AppSessionData> {
  const cookieStore = await cookies();
  const session = await getIronSession<AppSessionData>(
    cookieStore,
    sessionOptions()
  );
  return session;
}

/**
 * Persist session data. Mutates the cookie store so subsequent calls to
 * `getSession` reflect the new values.
 */
export async function setSession(data: BlueskySession): Promise<void> {
  const cookieStore = await cookies();
  const session = await getIronSession<AppSessionData>(
    cookieStore,
    sessionOptions()
  );
  session.bluesky = data;
  await session.save();
}

/**
 * Clear the session cookie.
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const session = await getIronSession<AppSessionData>(
    cookieStore,
    sessionOptions()
  );
  session.destroy();
}

/**
 * Returns the public subset of the authenticated user (if any). Pulled from the
 * Prisma User row so callers always get fresh displayName/avatarUrl.
 */
export async function getCurrentUser(): Promise<{
  did: string;
  handle: string;
} | null> {
  const session = await getSession();
  if (!session.bluesky?.did || !session.bluesky?.handle) {
    return null;
  }
  return {
    did: session.bluesky.did,
    handle: session.bluesky.handle,
  };
}
