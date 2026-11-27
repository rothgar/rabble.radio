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
  defaultPublicOrigin,
  originFromRequest,
  resolveSpace,
  resolveSpaceForUser,
  setSpaceLive,
  toPublicSpace,
  updateSpace,
} from '@/lib/spaces';
import { getCurrentUser } from '@/lib/session';
import { jsonError, readJson, requireUser } from '@/lib/api';
import { decoratePublicSpaces } from '@/lib/space-extras';
import { deleteLiveStatus, publishLiveStatus } from '@/lib/atproto';
import { broadcastRoomData, roomNameForSpace } from '@/lib/livekit';
import { normalizeTags } from '@/lib/tags';
import { isValidMood } from '@/lib/music';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await context.params;
  if (!id) {
    return jsonError(404, 'not_found');
  }

  const space = await resolveSpace(id);
  if (!space) {
    return jsonError(404, 'not_found');
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
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const { id } = await context.params;
  if (!id) {
    return jsonError(404, 'not_found');
  }

  const body = await readJson<PatchBody>(request);
  if (body instanceof NextResponse) return body;

  const patch: {
    title?: string;
    description?: string | null;
    tags?: string[];
    musicMood?: string | null;
    musicOnStage?: boolean;
    podcastFeedEnabled?: boolean;
  } = {};
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.trim().length === 0) {
      return jsonError(400, 'validation_error', 'Title is required.');
    }
    if (body.title.trim().length > 200) {
      return jsonError(400, 'validation_error', 'Title must be 200 characters or fewer.');
    }
    patch.title = body.title.trim();
  }
  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== 'string') {
      return jsonError(400, 'validation_error', 'Description must be a string.');
    }
    if (typeof body.description === 'string' && body.description.trim().length > 2000) {
      return jsonError(400, 'validation_error', 'Description must be 2000 characters or fewer.');
    }
    patch.description = body.description;
  }
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) {
      return jsonError(400, 'validation_error', 'Tags must be an array.');
    }
    const tags = normalizeTags(body.tags);
    if (body.tags.length > 0 && tags.length === 0) {
      return jsonError(400, 'validation_error', 'Tags must be valid YouTube categories.');
    }
    patch.tags = tags;
  }
  if (body.musicMood !== undefined) {
    if (!isValidMood(body.musicMood)) {
      return jsonError(400, 'validation_error', 'Unknown music mood.');
    }
    patch.musicMood = body.musicMood;
  }
  if (body.musicOnStage !== undefined) {
    if (typeof body.musicOnStage !== 'boolean') {
      return jsonError(400, 'validation_error', 'musicOnStage must be a boolean.');
    }
    patch.musicOnStage = body.musicOnStage;
  }
  if (body.podcastFeedEnabled !== undefined) {
    if (typeof body.podcastFeedEnabled !== 'boolean') {
      return jsonError(400, 'validation_error', 'podcastFeedEnabled must be a boolean.');
    }
    patch.podcastFeedEnabled = body.podcastFeedEnabled;
  }
  if (Object.keys(patch).length === 0) {
    return jsonError(400, 'validation_error', 'Nothing to update.');
  }

  const resolved = await resolveSpaceForUser(id, user.did);
  if (!resolved) {
    return jsonError(404, 'not_found');
  }
  if (!resolved.isHost) {
    return jsonError(403, 'forbidden', 'Only the host can edit this show.');
  }

  try {
    const updated = await updateSpace(resolved.space.id, patch);
    const origin = originFromRequest(request);
    const roomName = roomNameForSpace(updated.id);

    if (updated.isLive && patch.title !== undefined) {
      // Keep the Bluesky live banner in step with the new title. Best-effort.
      // The record is public on Bluesky, so its URL is always the canonical
      // public origin, never whatever Host header this request carried.
      const result = await publishLiveStatus({
        session: { did: user.did, handle: user.handle },
        spaceUrl: `${defaultPublicOrigin()}/show/${updated.id}`,
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
    return jsonError(500, 'update_failed', 'Failed to update show.');
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await requireUser({ ok: false });
  if (user instanceof NextResponse) return user;

  const { id } = await context.params;
  if (!id) {
    return jsonError(404, 'not_found', undefined, { ok: false });
  }

  const resolved = await resolveSpaceForUser(id, user.did);
  if (!resolved) {
    return jsonError(404, 'not_found', undefined, { ok: false });
  }
  const { space, isHost } = resolved;
  if (!isHost) {
    return jsonError(403, 'forbidden', 'Only the host can close this station.', { ok: false });
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
    logger.error('space.delete.failed', { err, spaceId: space.id });
    return jsonError(500, 'internal_error', 'Failed to delete space.', { ok: false });
  }
}
