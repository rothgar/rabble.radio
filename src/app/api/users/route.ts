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
import { getCurrentUser } from '@/lib/session';
import { getUsersByDid } from '@/lib/users';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface ErrorBody {
  error: string;
  message?: string;
}

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

export async function GET(
  request: NextRequest
): Promise<NextResponse<{ users: UserBody[] } | ErrorBody>> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const identities = parseIdentities(request.nextUrl.searchParams.get('identities'));
  if (identities.length === 0) {
    return NextResponse.json({ users: [] }, { status: 200 });
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
    return NextResponse.json(
      {
        error: 'lookup_failed',
        message: err instanceof Error ? err.message : 'Failed to resolve users.',
      },
      { status: 500 }
    );
  }
}
