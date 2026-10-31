// src/app/api/auth/logout/route.ts
//
// POST/GET /api/auth/logout
// Clears the session cookie and redirects to `/`.

import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Base URL for the post-logout redirect. Prefers the configured public
 * origin (so a deployment behind a TLS-terminating proxy redirects to the
 * https host), falling back to the request's own origin for local dev.
 */
function canonicalBaseUrl(request: Request): string {
  const configured =
    process.env.PUBLIC_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  return new URL(request.url).origin;
}

async function handleLogout(request: Request): Promise<NextResponse> {
  await destroySession();
  const url = new URL('/', canonicalBaseUrl(request));
  return NextResponse.redirect(url, { status: 302 });
}

export async function GET(request: Request): Promise<NextResponse> {
  return handleLogout(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleLogout(request);
}
