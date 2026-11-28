// src/app/api/me/route.ts
//
// GET /api/me
// Returns the authenticated user from the session + Prisma. 401 if no
// session, or if the session's DID is now banned (src/lib/admin.ts) — reads
// the User row itself rather than going through getCurrentUser
// (src/lib/session.ts) since it already needs the full row.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import { isAdmin } from '@/lib/admin';
import type { PublicUser } from '@/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse<PublicUser | { error: string }>> {
  const session = await getSession();
  const did = session.bluesky?.did;
  if (!did) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { did } });
  if (!user) {
    return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
  }
  if (user.bannedAt) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body: PublicUser = {
    id: user.id,
    did: user.did,
    handle: user.handle,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    isAdmin: isAdmin(user),
  };
  return NextResponse.json(body, { status: 200 });
}
