// src/middleware.ts
//
// Redirects legacy /spaces, /space, and /shows routes to their /stations and
// /show equivalents, and protects the authenticated show pages by checking
// for a sealed session cookie. The public stations listing and anything else
// (the marketing home, health check, and OAuth routes) are allowed through.

import { NextResponse, type NextRequest } from 'next/server';
import { sealData, unsealData } from 'iron-session';

const COOKIE_NAME = 'bs_spaces_session';

/**
 * Rewrite legacy route paths to the current ones:
 *   /spaces     -> /stations
 *   /spaces/new -> /stations/new
 *   /shows      -> /stations
 *   /shows/new  -> /stations/new
 *   /space/[id] -> /show/[id]
 */
function legacyRedirect(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  let next: string | null = null;
  if (pathname === '/spaces' || pathname.startsWith('/spaces/')) {
    next = '/stations' + pathname.slice('/spaces'.length);
  } else if (pathname === '/shows' || pathname.startsWith('/shows/')) {
    next = '/stations' + pathname.slice('/shows'.length);
  } else if (/^\/space(\/.*)?$/.test(pathname)) {
    next = '/show' + pathname.slice('/space'.length);
  }
  if (!next) return null;
  const url = request.nextUrl.clone();
  url.pathname = next;
  return NextResponse.redirect(url);
}

function loginRedirect(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const url = new URL('/login', request.url);
  url.searchParams.set('next', pathname + search);
  return NextResponse.redirect(url);
}

function isProtectedPath(pathname: string): boolean {
  // Creating a show and viewing a show detail page require a session.
  if (pathname === '/stations/new' || pathname.startsWith('/stations/new/')) {
    return true;
  }
  if (/^\/show\/[^/]+\/?$/.test(pathname)) {
    return true;
  }
  return false;
}

function isPublicApi(pathname: string): boolean {
  return (
    pathname === '/api/health' ||
    pathname.startsWith('/api/auth/')
  );
}

function getSessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    return null;
  }
  return secret;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // First, redirect legacy routes to the current ones.
  const redirect = legacyRedirect(request);
  if (redirect) return redirect;

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  // Public APIs (health, OAuth) are always accessible regardless of session.
  void isPublicApi;

  const cookie = request.cookies.get(COOKIE_NAME);
  if (!cookie) {
    return loginRedirect(request);
  }

  const secret = getSessionSecret();
  if (!secret) {
    return loginRedirect(request);
  }

  try {
    const data = await unsealData<{ bluesky?: { did?: string } }>(cookie.value, {
      password: secret,
    });
    if (!data.bluesky?.did) {
      throw new Error('missing did');
    }
    return NextResponse.next();
  } catch {
    // Refresh the cookie seal with an empty session so downstream reads work.
    const empty = await sealData(
      { bluesky: undefined },
      { password: secret, ttl: 60 * 60 * 24 * 30 }
    );
    const response = NextResponse.redirect(new URL('/', request.url));
    response.cookies.set(COOKIE_NAME, empty, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  }
}

export const config = {
  matcher: [
    '/spaces/:path*',
    '/space/:path*',
    '/shows/:path*',
    '/show/:path*',
    '/stations/:path*',
    '/station/:path*',
  ],
};
