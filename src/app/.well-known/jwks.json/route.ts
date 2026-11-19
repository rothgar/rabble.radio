// src/app/.well-known/jwks.json/route.ts
//
// GET /.well-known/jwks.json
// Serves the JSON Web Key Set the PDS uses to verify client assertions
// signed with our JWKS_PRIVATE_KEY. Returns 404 in loopback mode (no
// PUBLIC_URL set).

import { NextResponse } from 'next/server';
import { getPublicJwks, oauthMode } from '@/lib/auth';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const log = createLogger({ correlationId: 'oauth-jwks-route' });

export async function GET(): Promise<NextResponse> {
  if (oauthMode() !== 'public') {
    return new NextResponse('Not Found', { status: 404 });
  }
  try {
    const jwks = await getPublicJwks();
    return NextResponse.json(jwks, {
      status: 200,
      headers: {
        'cache-control': 'public, max-age=3600',
        'content-type': 'application/json; charset=utf-8',
      },
    });
  } catch (err) {
    log.error('oauth.jwks.failed', {
      err,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        error: 'oauth_jwks_unavailable',
        message:
          err instanceof Error ? err.message : 'OAuth JWKS unavailable.',
      },
      { status: 500 }
    );
  }
}
