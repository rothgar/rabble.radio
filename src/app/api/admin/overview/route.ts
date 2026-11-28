// src/app/api/admin/overview/route.ts
//
// GET /api/admin/overview -> platform overview counts and the user list for
//   moderation (ban/unban/kick stays at POST /api/admin/users). ADMIN_DIDS
//   only; 404 for everyone else, same as /admin (src/app/admin/page.tsx), so
//   the route's existence is not leaked.
//   Response: { overview: PlatformOverview, users: AdminUserRow[] }

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { jsonError } from '@/lib/api';
import { getPlatformOverview, isAdmin, listUsersForAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return jsonError(404, 'not_found');
  }

  const [overview, users] = await Promise.all([getPlatformOverview(), listUsersForAdmin(100)]);

  return NextResponse.json(
    {
      overview,
      users: users.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        bannedAt: row.bannedAt ? row.bannedAt.toISOString() : null,
      })),
    },
    { status: 200 }
  );
}
