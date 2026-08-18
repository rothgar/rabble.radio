// src/app/api/spaces/[id]/stage/route.ts
//
// POST /api/spaces/[id]/stage
//
// Stage management endpoint. Accepts the following actions:
//   - invite:   host invites an audience member to stage (body.targetIdentity)
//   - accept:   audience member accepts a pending invite (returns speaker token)
//   - leave:    speaker leaves stage (returns audience token)
//   - remove:   host removes a speaker (body.targetIdentity, returns audience token)
//
// Requires authentication. Returns:
//   { token, wsUrl, role, roomName, identity } on accept/leave/remove
//   { ok: true } on invite

import { NextResponse, type NextRequest } from 'next/server';
import {
  acceptStageInvite,
  blockFromSpace,
  inviteToStage,
  kickFromSpace,
  leaveStage,
  muteSpeaker,
  removeFromStage,
  StageError,
} from '@/lib/stage';
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

  try {
    switch (action) {
      case 'invite': {
        if (!targetIdentity) {
          return NextResponse.json(
            {
              error: 'validation_error',
              message: 'targetIdentity is required for invite.',
            },
            { status: 400 }
          );
        }
        await inviteToStage({
          spaceId: id,
          hostDid: user.did,
          targetIdentity,
        });
        return NextResponse.json({ ok: true }, { status: 200 });
      }
      case 'accept': {
        const result = await acceptStageInvite({
          spaceId: id,
          userDid: user.did,
          displayName: user.handle,
        });
        return NextResponse.json(result, { status: 200 });
      }
      case 'leave': {
        const result = await leaveStage({
          spaceId: id,
          userDid: user.did,
          displayName: user.handle,
        });
        return NextResponse.json(result, { status: 200 });
      }
      case 'remove': {
        if (!targetIdentity) {
          return NextResponse.json(
            {
              error: 'validation_error',
              message: 'targetIdentity is required for remove.',
            },
            { status: 400 }
          );
        }
        const result = await removeFromStage({
          spaceId: id,
          hostDid: user.did,
          targetIdentity,
        });
        return NextResponse.json(result, { status: 200 });
      }
      case 'kick': {
        if (!targetIdentity) {
          return NextResponse.json(
            {
              error: 'validation_error',
              message: 'targetIdentity is required for kick.',
            },
            { status: 400 }
          );
        }
        await kickFromSpace({
          spaceId: id,
          hostDid: user.did,
          targetIdentity,
        });
        return NextResponse.json({ ok: true }, { status: 200 });
      }
      case 'block': {
        if (!targetIdentity) {
          return NextResponse.json(
            {
              error: 'validation_error',
              message: 'targetIdentity is required for block.',
            },
            { status: 400 }
          );
        }
        await blockFromSpace({
          spaceId: id,
          hostDid: user.did,
          targetIdentity,
        });
        return NextResponse.json({ ok: true }, { status: 200 });
      }
      case 'mute': {
        if (!targetIdentity) {
          return NextResponse.json(
            {
              error: 'validation_error',
              message: 'targetIdentity is required for mute.',
            },
            { status: 400 }
          );
        }
        await muteSpeaker({
          spaceId: id,
          hostDid: user.did,
          targetIdentity,
          muted: true,
        });
        return NextResponse.json({ ok: true }, { status: 200 });
      }
      case 'unmute': {
        if (!targetIdentity) {
          return NextResponse.json(
            {
              error: 'validation_error',
              message: 'targetIdentity is required for unmute.',
            },
            { status: 400 }
          );
        }
        await muteSpeaker({
          spaceId: id,
          hostDid: user.did,
          targetIdentity,
          muted: false,
        });
        return NextResponse.json({ ok: true }, { status: 200 });
      }
      default:
        return NextResponse.json(
          {
            error: 'validation_error',
            message:
              "action must be one of 'invite', 'accept', 'leave', 'remove', 'kick', 'block', 'mute', or 'unmute'.",
          },
          { status: 400 }
        );
    }
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
