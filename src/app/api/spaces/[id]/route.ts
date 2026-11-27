// src/app/api/spaces/[id]/route.ts
//
// GET /api/spaces/[id] -> return a single space by its primary key. 404 if
// not found. Lookup also supports the slug for convenience.
//
// PATCH /api/spaces/[id] -> host-only edit of title, description and tags.
// Hosts use it from inside the room after an instant "Start a show". If the
// show is on air the Bluesky live status is republished with the new title,
// and everyone in the room gets a `space_updated` data message.
//
// DELETE /api/spaces/[id] -> host-only destructive delete. Ends live state
// (if applicable) and removes the space row. Recording/S3 cleanup is
// intentionally NOT performed here; that is handled by a separate job.

import { NextResponse, type NextRequest } from 'next/server';
import {
  getSpaceById,
  getSpaceBySlug,
  originFromRequest,
  resolveSpaceForUser,
  setSpaceLive,
  toPublicSpace,
  updateSpace,
} from '@/lib/spaces';
import { getCurrentUser } from '@/lib/session';
import { decoratePublicSpaces } from '@/lib/space-extras';
import { deleteLiveStatus, publishLiveStatus } from '@/lib/atproto';
import { broadcastRoomData, roomNameForSpace } from '@/lib/livekit';
import { normalizeTags } from '@/lib/tags';
import { isValidMood } from '@/lib/music';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { check, ValidationError, validationErrorResponse } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
  let viewer: { did: string } | null = null;
  try {
    viewer = (await getCurrentUser()) ?? null;
  } catch {
    viewer = null;
  }
  const [decorated] = await decoratePublicSpaces([toPublicSpace(space, origin)], viewer?.did ?? null);
  return NextResponse.json({ space: decorated }, { status: 200 });
}

interface PatchBody {
  title?: unknown;
  description?: unknown;
  tags?: unknown;
  /** Pre-show music mood id, or null for silence. */
  musicMood?: unknown;
  /** Host only: move music on/off the stage without changing the mood. */
  musicOnStage?: unknown;
  /** Turn this show's own podcast feed on or off. */
  podcastFeedEnabled?: unknown;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json(
      { error: 'invalid_json', message: 'Request body must be JSON.' },
      { status: 400 }
    );
  }

  const patch: {
    title?: string;
    description?: string | null;
    tags?: string[];
    musicMood?: string | null;
    musicOnStage?: boolean;
    podcastFeedEnabled?: boolean;
  } = {};
  try {
    if (body.title !== undefined) {
      check(typeof body.title === 'string' && body.title.trim().length > 0, 'Title is required.');
      check(body.title.trim().length <= 200, 'Title must be 200 characters or fewer.');
      patch.title = body.title.trim();
    }
    if (body.description !== undefined) {
      check(body.description === null || typeof body.description === 'string', 'Description must be a string.');
      check(
        !(typeof body.description === 'string' && body.description.trim().length > 2000),
        'Description must be 2000 characters or fewer.'
      );
      patch.description = body.description;
    }
    if (body.tags !== undefined) {
      check(Array.isArray(body.tags), 'Tags must be an array.');
      const tags = normalizeTags(body.tags);
      check(!(body.tags.length > 0 && tags.length === 0), 'Tags must be valid YouTube categories.');
      patch.tags = tags;
    }
    if (body.musicMood !== undefined) {
      check(isValidMood(body.musicMood), 'Unknown music mood.');
      patch.musicMood = body.musicMood;
    }
    if (body.musicOnStage !== undefined) {
      check(typeof body.musicOnStage === 'boolean', 'musicOnStage must be a boolean.');
      patch.musicOnStage = body.musicOnStage;
    }
    if (body.podcastFeedEnabled !== undefined) {
      check(typeof body.podcastFeedEnabled === 'boolean', 'podcastFeedEnabled must be a boolean.');
      patch.podcastFeedEnabled = body.podcastFeedEnabled;
    }
    check(Object.keys(patch).length > 0, 'Nothing to update.');
  } catch (err) {
    if (err instanceof ValidationError) return validationErrorResponse(err);
    throw err;
  }

  const resolved = await resolveSpaceForUser(id, user.did);
  if (!resolved) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (!resolved.isHost) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Only the host can edit this show.' },
      { status: 403 }
    );
  }

  try {
    const updated = await updateSpace(resolved.space.id, patch);
    const origin = originFromRequest(request);
    const roomName = roomNameForSpace(updated.id);

    if (updated.isLive && patch.title !== undefined) {
      // Keep the Bluesky live banner in step with the new title. Best-effort.
      const result = await publishLiveStatus({
        session: { did: user.did, handle: user.handle },
        spaceUrl: `${origin}/show/${updated.id}`,
        title: updated.title,
      });
      if (!result.ok) {
        logger.warn('space.patch.atproto_failed', { spaceId: updated.id, error: result.error });
      }
    }
    await broadcastRoomData(roomName, {
      type: 'space_updated',
      spaceId: updated.id,
      title: updated.title,
      description: updated.description,
      tags: updated.tags,
      musicMood: updated.musicMood ?? null,
      musicOnStage: updated.musicOnStage ?? true,
    });

    return NextResponse.json({ space: toPublicSpace(updated, origin) }, { status: 200 });
  } catch (err) {
    logger.error('space.patch.failed', { err, spaceId: resolved.space.id });
    return NextResponse.json(
      {
        error: 'update_failed',
        message: err instanceof Error ? err.message : 'Failed to update show.',
      },
      { status: 500 }
    );
  }
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
      { ok: false, error: 'forbidden', message: 'Only the host can close this station.' },
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
