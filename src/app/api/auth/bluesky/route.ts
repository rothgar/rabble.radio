// src/app/api/auth/bluesky/route.ts
//
// GET /api/auth/bluesky?handle=<handle>
// Initiates the Bluesky OAuth flow. Generates a random state, persists it in
// the session cookie (along with the requested handle), then redirects the
// browser to the authorization URL produced by the OAuth client.

import { NextResponse, type NextRequest } from 'next/server';
import { getOAuthClient } from '@/lib/auth';
import { saveLoginRedirect } from '@/lib/session';
import { createLogger, correlationIdFromRequest } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = correlationIdFromRequest(request);
  const log = createLogger({ correlationId });
  const handle = request.nextUrl.searchParams.get('handle')?.trim();
  if (!handle) {
    return badRequest('Missing required "handle" query parameter.');
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(handle)) {
    return badRequest('Invalid handle format.');
  }

  const next = request.nextUrl.searchParams.get('next');
  if (next) {
    await saveLoginRedirect(next);
  }

  try {
    const url = await (await getOAuthClient()).authorize(handle);
    log.info('oauth.authorize.success', { handle });
    return NextResponse.redirect(url, { status: 302 });
  } catch (err) {
    log.error('oauth.authorize.failed', { err, handle });
    return NextResponse.json(
      { error: 'oauth_authorize_failed', message: 'OAuth authorize failed.', correlationId },
      { status: 500 }
    );
  }
}
