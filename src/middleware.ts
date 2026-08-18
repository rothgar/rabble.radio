// src/middleware.ts
//
// Protects /spaces/* and the singular /space/[id] detail page by checking
// for a sealed session cookie. Anything else (the marketing home, health
// check, and the OAuth routes themselves) is allowed through.
//
// Note: the detail page lives at the singular `/space/[id]` (not
// `/spaces/[id]`) so its server chunk does not share a webpack chunk with
// the Prisma-using API routes under `/api/spaces/[id]/...`.

import { NextResponse, type NextRequest } from 'next/server';
import { sealData, unsealData } from 'iron-session';

const COOKIE_NAME = 'bs_spaces_session';

function isProtectedPath(pathname: string): boolean {
  // The plural list page (/spaces, /spaces/new) and the singular detail
  // page (/space/[id]) all require a session.
  if (pathname === '/spaces' || pathname.startsWith('/spaces/')) {
    return true;
  }
  if (/^\/space\/[^/]+\/?$/.test(pathname)) {
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

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  // Public APIs (health, OAuth) are always accessible regardless of session.
  void isPublicApi;

  const cookie = request.cookies.get(COOKIE_NAME);
  if (!cookie) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const secret = getSessionSecret();
  if (!secret) {
    return NextResponse.redirect(new URL('/', request.url));
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
  matcher: ['/spaces/:path*', '/space/:path*'],
};
