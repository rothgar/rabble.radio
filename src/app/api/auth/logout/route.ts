// src/app/api/auth/logout/route.ts
//
// POST/GET /api/auth/logout
// Clears the session cookie and redirects to `/`.

import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function handleLogout(request: Request): Promise<NextResponse> {
  await destroySession();
  const url = new URL('/', request.url);
  return NextResponse.redirect(url, { status: 302 });
}

export async function GET(request: Request): Promise<NextResponse> {
  return handleLogout(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleLogout(request);
}
