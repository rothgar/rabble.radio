// src/app/oauth-client-metadata.json/route.ts
//
// GET /oauth-client-metadata.json
// Serves the hosted OAuth client metadata document for the public-mode
// `private_key_jwt` flow. The PDS fetches this document using the
// `client_id` URL. Returns 404 in loopback mode (no PUBLIC_URL set).

import { NextResponse } from 'next/server';
import { getPublicClientMetadata, oauthMode } from '@/lib/auth';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const log = createLogger({ correlationId: 'oauth-metadata-route' });

export async function GET(): Promise<NextResponse> {
  if (oauthMode() !== 'public') {
    return new NextResponse('Not Found', { status: 404 });
  }
  try {
    const metadata = await getPublicClientMetadata();
    return NextResponse.json(metadata, {
      status: 200,
      headers: {
        'cache-control': 'public, max-age=3600',
        'content-type': 'application/json; charset=utf-8',
      },
    });
  } catch (err) {
    log.error('oauth.metadata.failed', {
      err,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        error: 'oauth_metadata_unavailable',
        message:
          err instanceof Error ? err.message : 'OAuth metadata unavailable.',
      },
      { status: 500 }
    );
  }
}
