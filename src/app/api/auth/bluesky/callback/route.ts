// src/app/api/auth/bluesky/callback/route.ts
//
// GET /api/auth/bluesky/callback?code=...&state=...
// Completes the OAuth flow. Fetches the user's profile from the PDS, upserts
// a `User` row, sets the session cookie, and redirects to `/spaces`.

import { NextResponse, type NextRequest } from 'next/server';
import { Agent } from '@atproto/api';
import { prisma } from '@/lib/db';
import { getOAuthClient } from '@/lib/auth';
import { getSession, setSession } from '@/lib/session';
import { createLogger, correlationIdFromRequest } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = correlationIdFromRequest(request);
  const log = createLogger({ correlationId });
  log.info('oauth.callback.received', { path: request.nextUrl.pathname });
  const params = request.nextUrl.searchParams;

  let result;
  try {
    result = await (await getOAuthClient()).callback(params);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OAuth callback failed.';
    log.error('oauth.callback.failed', { err, message });
    return NextResponse.json(
      { error: 'oauth_callback_failed', message, correlationId },
      { status: 400 }
    );
  }

  const oauthSession = result.session;
  log.info('oauth.callback.result', {
    did: oauthSession.sub,
    hasSession: true,
  });
  const did = oauthSession.sub;
  const agent = new Agent(oauthSession as never);

  let handle = '';
  let displayName: string | null = null;
  let avatarUrl: string | null = null;

  try {
    const profile = await agent.getProfile({ actor: did });
    handle = profile.data.handle;
    displayName = profile.data.displayName ?? null;
    avatarUrl = profile.data.avatar ?? null;
  } catch {
    // Fall back to the DID if profile fetch fails; the User row will be filled
    // in later when the user revisits a page that triggers a refresh.
    handle = did;
  }

  if (handle) {
    try {
      await prisma.user.upsert({
        where: { did },
        create: {
          did,
          handle,
          displayName,
          avatarUrl,
        },
        update: {
          handle,
          displayName,
          avatarUrl,
        },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to persist user.';
      log.error('oauth.callback.user_upsert_failed', { err, did, message });
      return NextResponse.json(
        { error: 'user_upsert_failed', message, correlationId },
        { status: 500 }
      );
    }
  }

  await setSession({ did, handle });
  log.info('oauth.callback.success', { did, handle });

  const publicUrl = process.env.PUBLIC_URL || 'https://rabble.exe.xyz';
  const redirectTo = new URL('/spaces', publicUrl);
  return NextResponse.redirect(redirectTo, { status: 302 });
}
