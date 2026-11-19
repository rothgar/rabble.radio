// src/app/api/admin/users/route.ts
//
// POST /api/admin/users -> ban, unban or kick a user. ADMIN_DIDS only.
//   Body: { did, action: 'ban' | 'unban' | 'kick', reason? }
//   Response: { ok: true, user?: AdminUserRow, kicked?: number } or an error
//   envelope.

import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { AdminActionError, banUser, isAdmin, kickFromPlatform, unbanUser } from '@/lib/admin';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface AdminUsersBody {
  did?: unknown;
  action?: unknown;
  reason?: unknown;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: AdminUsersBody;
  try {
    body = (await request.json()) as AdminUsersBody;
  } catch {
    return NextResponse.json(
      { error: 'invalid_json', message: 'Request body must be JSON.' },
      { status: 400 }
    );
  }

  const did = str(body.did);
  const action = str(body.action);
  if (!did || (action !== 'ban' && action !== 'unban' && action !== 'kick')) {
    return NextResponse.json(
      { error: 'validation_error', message: "did is required and action must be 'ban', 'unban' or 'kick'." },
      { status: 400 }
    );
  }
  if (action === 'ban' && did === user?.did) {
    return NextResponse.json(
      { error: 'validation_error', message: 'You cannot ban yourself.' },
      { status: 400 }
    );
  }

  try {
    if (action === 'kick') {
      const kicked = await kickFromPlatform(did);
      return NextResponse.json({ ok: true, kicked }, { status: 200 });
    }
    const row = action === 'ban' ? await banUser(did, str(body.reason) ?? null) : await unbanUser(did);
    logger.info('admin.user_action', { adminDid: user?.did, did, action });
    return NextResponse.json({ ok: true, user: { ...row, createdAt: row.createdAt.toISOString() } }, { status: 200 });
  } catch (err) {
    if (err instanceof AdminActionError && err.message === 'user_not_found') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof AdminActionError) {
      return NextResponse.json({ error: 'validation_error', message: err.message }, { status: 400 });
    }
    logger.error('admin.user_action_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'action_failed', message: 'Could not complete that action.' }, { status: 500 });
  }
}
