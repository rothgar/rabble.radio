// src/app/api/auth/logout/route.ts
//
// POST/GET /api/auth/logout
// Clears the session cookie and redirects to `/`.

import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function canonicalBaseUrl(): string {
  return (
    process.env.PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    'https://rabble.exe.xyz'
  ).replace(/\/+$/, '');
}

async function handleLogout(_request: Request): Promise<NextResponse> {
  await destroySession();
  const url = new URL('/', canonicalBaseUrl());
  return NextResponse.redirect(url, { status: 302 });
}

export async function GET(request: Request): Promise<NextResponse> {
  return handleLogout(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleLogout(request);
}
