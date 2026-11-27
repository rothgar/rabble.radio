// src/app/api/auth/bluesky/callback/route.ts
//
// GET /api/auth/bluesky/callback?code=...&state=...
// Completes the OAuth flow. Fetches the user's profile from the PDS, upserts
// a `User` row, sets the session cookie, and redirects to `/spaces`.

import { NextResponse, type NextRequest } from 'next/server';
import { Agent } from '@atproto/api';
import { prisma } from '@/lib/db';
import { getOAuthClient } from '@/lib/auth';
import { getSession, setSession, getAndClearLoginRedirect } from '@/lib/session';
import { createLogger, correlationIdFromRequest } from '@/lib/logger';
import { warmFollowCache } from '@/lib/follows';
import { warmBlockCache } from '@/lib/blocks';
import { findMigratedHostDid, reassignHostIdentity } from '@/lib/users';

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

  if (!result?.session) {
    log.error('oauth.callback.failed', { message: 'No session returned.' });
    return NextResponse.json(
      {
        error: 'oauth_callback_failed',
        message: 'OAuth callback did not return a session.',
        correlationId,
      },
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
      const existing = await prisma.user.findUnique({ where: { did } });
      if (!existing) {
        const migratedFromDid = await findMigratedHostDid(did, handle);
        if (migratedFromDid) {
          log.info('oauth.callback.did_migrated', { from: migratedFromDid, to: did });
          await reassignHostIdentity(migratedFromDid, did);
        }
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to migrate host identity.';
      log.error('oauth.callback.did_migration_failed', { err, did, message });
      return NextResponse.json(
        { error: 'did_migration_failed', message, correlationId },
        { status: 500 }
      );
    }

    let user;
    try {
      user = await prisma.user.upsert({
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

    if (user.bannedAt) {
      log.info('oauth.callback.banned', { did });
      const supportEmail = process.env.SUPPORT_EMAIL;
      return NextResponse.json(
        {
          error: 'account_banned',
          message: supportEmail
            ? `This account has been banned from rabble.radio. Contact ${supportEmail} to request being unbanned.`
            : 'This account has been banned from rabble.radio.',
          correlationId,
        },
        { status: 403 }
      );
    }
  }

  // Fill the follows and blocks caches while the browser follows the
  // redirect, so the home and hosts pages are ready on the first load.
  warmFollowCache(did);
  warmBlockCache(did);

  const loginRedirect = await getAndClearLoginRedirect();
  await setSession({ did, handle });
  log.info('oauth.callback.success', { did, handle });

  const publicUrl = process.env.PUBLIC_URL || 'https://rabble.invalid';
  // Belt and braces with isSafeRedirectPath: never leave our own origin.
  let redirectTo = new URL(loginRedirect ?? '/', publicUrl);
  if (redirectTo.origin !== new URL(publicUrl).origin) redirectTo = new URL('/', publicUrl);
  return NextResponse.redirect(redirectTo, { status: 302 });
}
