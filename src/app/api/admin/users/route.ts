// src/app/api/admin/users/route.ts
//
// POST /api/admin/users -> ban, unban or kick a user. ADMIN_DIDS only.
//   Body: { did, action: 'ban' | 'unban' | 'kick', reason? }
//   Response: { ok: true, user?: AdminUserRow, kicked?: number } or an error
//   envelope.

import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { jsonError, readJson } from '@/lib/api';
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
    return jsonError(403, 'forbidden');
  }

  const body = await readJson<AdminUsersBody>(request);
  if (body instanceof NextResponse) return body;

  const did = str(body.did);
  const action = str(body.action);
  if (!did || (action !== 'ban' && action !== 'unban' && action !== 'kick')) {
    return jsonError(400, 'validation_error', "did is required and action must be 'ban', 'unban' or 'kick'.");
  }
  if (action === 'ban' && did === user?.did) {
    return jsonError(400, 'validation_error', 'You cannot ban yourself.');
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
      return jsonError(404, 'not_found');
    }
    if (err instanceof AdminActionError) {
      return jsonError(400, 'validation_error', err.message);
    }
    logger.error('admin.user_action_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return jsonError(500, 'action_failed', 'Could not complete that action.');
  }
}
