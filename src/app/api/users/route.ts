// src/app/api/users/route.ts
//
// GET /api/users?identities=did:plc:a,did:plc:b,...
//
// Resolves a list of AT Protocol DIDs to public user summaries (handle,
// displayName, avatarUrl). Missing DIDs are omitted from the response; the
// client falls back to the raw DID as the display label.
//
// Requires authentication (any signed-in user). Returns:
//   { users: Array<{ did, handle, displayName, avatarUrl }> }

import { NextResponse, type NextRequest } from 'next/server';
import { jsonError, requireUser } from '@/lib/api';
import { getUsersByDid } from '@/lib/users';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface UserBody {
  did: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
}

function parseIdentities(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** A room roster is at most a few dozen people; anything larger is abuse or a bug. */
const MAX_IDENTITIES = 100;

export async function GET(
  request: NextRequest
): Promise<NextResponse> {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const identities = parseIdentities(request.nextUrl.searchParams.get('identities'));
  if (identities.length === 0) {
    return NextResponse.json({ users: [] }, { status: 200 });
  }
  if (identities.length > MAX_IDENTITIES) {
    return jsonError(400, 'validation_error', `At most ${MAX_IDENTITIES} identities per request.`);
  }

  try {
    const summaries = await getUsersByDid(identities);
    const users: UserBody[] = summaries.map((s) => ({
      did: s.did,
      handle: s.handle,
      displayName: s.displayName ?? null,
      avatarUrl: s.avatarUrl ?? null,
    }));
    return NextResponse.json({ users }, { status: 200 });
  } catch (err) {
    logger.error('users.lookup_failed', { err, did: user.did });
    return jsonError(500, 'lookup_failed', 'Failed to resolve users.');
  }
}
