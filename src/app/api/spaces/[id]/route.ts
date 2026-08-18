// src/app/api/spaces/[id]/route.ts
//
// GET /api/spaces/[id] -> return a single space by its primary key. 404 if
// not found. Lookup also supports the slug for convenience.
//
// DELETE /api/spaces/[id] -> host-only destructive delete. Ends live state
// (if applicable) and removes the space row. Recording/S3 cleanup is
// intentionally NOT performed here; that is handled by a separate job.

import { NextResponse, type NextRequest } from 'next/server';
import {
  getSpaceById,
  getSpaceBySlug,
  resolveSpaceForUser,
  setSpaceLive,
  toPublicSpace,
} from '@/lib/spaces';
import { getCurrentUser } from '@/lib/session';
import { deleteLiveStatus } from '@/lib/atproto';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function originFromRequest(request: Request): string {
  try {
    const url = new URL(request.url);
    return `${url.protocol}//${url.host}`;
  } catch {
    return '';
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Try primary key first, then fall back to slug lookup so the same route
  // can be used for shareable URLs that use either form.
  let space = await getSpaceById(id);
  if (!space) {
    space = await getSpaceBySlug(id);
  }
  if (!space) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const origin = originFromRequest(request);
  return NextResponse.json(
    { space: toPublicSpace(space, origin) },
    { status: 200 }
  );
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { ok: false, error: 'not_found' },
      { status: 404 }
    );
  }

  const resolved = await resolveSpaceForUser(id, user.did);
  if (!resolved) {
    return NextResponse.json(
      { ok: false, error: 'not_found' },
      { status: 404 }
    );
  }
  const { space, isHost } = resolved;
  if (!isHost) {
    return NextResponse.json(
      { ok: false, error: 'forbidden', message: 'Only the host can delete this space.' },
      { status: 403 }
    );
  }

  try {
    if (space.isLive) {
      await setSpaceLive(space.id, false);
      try {
        await deleteLiveStatus({ session: { did: user.did, handle: user.handle } });
      } catch (err) {
        logger.warn('space.delete.atproto_failed', {
          err,
          spaceId: space.id,
        });
      }
    }

    await prisma.space.delete({ where: { id: space.id } });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: 'internal_error',
        message: err instanceof Error ? err.message : 'Failed to delete space.',
      },
      { status: 500 }
    );
  }
}
