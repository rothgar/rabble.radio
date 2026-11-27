// src/app/api/spaces/[id]/stage/route.ts
//
// POST /api/spaces/[id]/stage
//
// Stage management endpoint. Accepts the following actions:
//   - invite:   host brings an audience member on stage immediately, muted
//               (body.targetIdentity)
//   - accept:   dormant back-compat for a client that still calls it after
//               a prior pending invite (there is no accept step anymore)
//   - leave:    speaker leaves stage (returns audience token)
//   - remove:   host removes a speaker (body.targetIdentity, returns audience token)
//
// Requires authentication. Returns:
//   { token, wsUrl, role, roomName, identity } on accept/leave/remove
//   { ok: true } on invite
//
// GET /api/spaces/[id]/stage
//
// The caller's own stage status: whether they currently hold a speaker
// slot, whether the show is on air, and (always null in practice now —
// kept for API back-compat) a stage invite waiting for them. Clients that
// cannot rely on LiveKit data messages (the mobile apps, and the web room
// as a fallback) poll this while in the room.

import { NextResponse, type NextRequest } from 'next/server';
import {
  acceptStageInvite,
  blockFromSpace,
  getPendingInvite,
  inviteToStage,
  kickFromSpace,
  leaveStage,
  listActiveSpeakers,
  muteSpeaker,
  removeFromStage,
  StageError,
} from '@/lib/stage';
import { getSpaceById, getSpaceBySlug, originFromRequest } from '@/lib/spaces';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface StageBody {
  action?: unknown;
  targetIdentity?: unknown;
}

interface SuccessTokenBody {
  token: string;
  wsUrl: string;
  role: string;
  roomName: string;
  identity: string;
}

interface OkBody {
  ok: true;
}

interface ErrorBody {
  error: string;
  message?: string;
}

export interface StageStatusBody {
  onAir: boolean;
  onStage: boolean;
  pendingInvite: { hostDid: string; createdAt: number } | null;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse<StageStatusBody | ErrorBody>> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const space = (await getSpaceById(id)) ?? (await getSpaceBySlug(id));
  if (!space) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const [invite, speakers] = await Promise.all([
    getPendingInvite(space.id, user.did),
    listActiveSpeakers(space.id),
  ]);
  return NextResponse.json(
    {
      onAir: space.isLive,
      onStage: space.hostId === user.did || speakers.includes(user.did),
      pendingInvite: invite ? { hostDid: invite.hostDid, createdAt: invite.createdAt } : null,
    },
    { status: 200 }
  );
}

interface ActionContext {
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  id: string;
  targetIdentity?: string;
  request: NextRequest;
}

interface ActionDef {
  needsTarget: boolean;
  run: (ctx: ActionContext) => Promise<SuccessTokenBody | OkBody>;
}

const ACTIONS: Record<string, ActionDef> = {
  invite: {
    needsTarget: true,
    run: async ({ user, id, targetIdentity, request }) => {
      await inviteToStage({
        spaceId: id,
        hostDid: user.did,
        targetIdentity: targetIdentity as string,
        origin: originFromRequest(request),
      });
      return { ok: true };
    },
  },
  accept: {
    needsTarget: false,
    run: ({ user, id, request }) =>
      acceptStageInvite({
        spaceId: id,
        userDid: user.did,
        displayName: user.handle,
        handle: user.handle,
        profileDisplayName: user.displayName,
        origin: originFromRequest(request),
      }),
  },
  leave: {
    needsTarget: false,
    run: ({ user, id }) =>
      leaveStage({ spaceId: id, userDid: user.did, displayName: user.handle }),
  },
  remove: {
    needsTarget: true,
    run: ({ user, id, targetIdentity }) =>
      removeFromStage({ spaceId: id, hostDid: user.did, targetIdentity: targetIdentity as string }),
  },
  kick: {
    needsTarget: true,
    run: async ({ user, id, targetIdentity }) => {
      await kickFromSpace({ spaceId: id, hostDid: user.did, targetIdentity: targetIdentity as string });
      return { ok: true };
    },
  },
  block: {
    needsTarget: true,
    run: async ({ user, id, targetIdentity }) => {
      await blockFromSpace({ spaceId: id, hostDid: user.did, targetIdentity: targetIdentity as string });
      return { ok: true };
    },
  },
  mute: {
    needsTarget: true,
    run: async ({ user, id, targetIdentity }) => {
      await muteSpeaker({ spaceId: id, hostDid: user.did, targetIdentity: targetIdentity as string, muted: true });
      return { ok: true };
    },
  },
  unmute: {
    needsTarget: true,
    run: async ({ user, id, targetIdentity }) => {
      await muteSpeaker({ spaceId: id, hostDid: user.did, targetIdentity: targetIdentity as string, muted: false });
      return { ok: true };
    },
  },
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse<SuccessTokenBody | OkBody | ErrorBody>> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  let body: StageBody;
  try {
    body = (await request.json()) as StageBody;
  } catch {
    return NextResponse.json(
      { error: 'invalid_json', message: 'Request body must be JSON.' },
      { status: 400 }
    );
  }

  const action = typeof body.action === 'string' ? body.action : '';
  const targetIdentity =
    typeof body.targetIdentity === 'string' && body.targetIdentity.length > 0
      ? body.targetIdentity
      : undefined;

  const def = Object.prototype.hasOwnProperty.call(ACTIONS, action) ? ACTIONS[action] : undefined;
  if (!def) {
    return NextResponse.json(
      {
        error: 'validation_error',
        message:
          "action must be one of 'invite', 'accept', 'leave', 'remove', 'kick', 'block', 'mute', or 'unmute'.",
      },
      { status: 400 }
    );
  }

  if (def.needsTarget && !targetIdentity) {
    return NextResponse.json(
      {
        error: 'validation_error',
        message: `targetIdentity is required for ${action}.`,
      },
      { status: 400 }
    );
  }

  try {
    const result = await def.run({ user, id, targetIdentity, request });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof StageError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.status }
      );
    }
    return NextResponse.json(
      {
        error: 'stage_failed',
        message:
          err instanceof Error ? err.message : 'Stage action failed.',
      },
      { status: 500 }
    );
  }
}
