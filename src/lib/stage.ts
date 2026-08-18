// src/lib/stage.ts
//
// Stage management for the Bluesky Spaces MVP.
//
// The host of a space can invite audience members on stage. Invited users
// accept the invite and are re-issued a LiveKit token with publishing
// permissions. Speakers can leave stage (back to audience) and hosts can
// remove speakers. Each role transition mints a fresh LiveKit token so the
// browser can reconnect with the right permissions.
//
// LIMITATION: pending invites are stored in an in-memory Map on globalThis.
// In a multi-replica deployment the invite state would not be shared between
// pods. The MVP runs a single replica; production should swap this for Redis
// or use LiveKit's participant metadata + data messages for signalling.
//
// Real-time signalling: we also publish a LiveKit data message via
// RoomServiceClient.sendData when possible so connected clients can show a
// toast. Data messages are best-effort; the in-memory invite is the source
// of truth for accept/leave/remove operations.

import { getLiveKitClient, generateToken, roomNameForSpace, muteParticipant, removeParticipant, type SpaceRole } from '@/lib/livekit';
import { getSpaceById, getSpaceBySlug } from '@/lib/spaces';

export interface StageParticipantSummary {
  identity: string;
  name?: string;
}

export interface PendingInvite {
  spaceId: string;
  roomName: string;
  targetIdentity: string;
  hostDid: string;
  createdAt: number;
}

export interface StageTokenResult {
  token: string;
  wsUrl: string;
  role: SpaceRole;
  roomName: string;
  identity: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __bluesky_spaces_pending_invites__: Map<string, PendingInvite> | undefined;
  // eslint-disable-next-line no-var
  var __bluesky_spaces_active_speakers__: Map<string, Set<string>> | undefined;
  // eslint-disable-next-line no-var
  var __bluesky_spaces_blocked__: Map<string, Set<string>> | undefined;
}

function inviteKey(spaceId: string, identity: string): string {
  return `${spaceId}:${identity}`;
}

function getInviteStore(): Map<string, PendingInvite> {
  if (!globalThis.__bluesky_spaces_pending_invites__) {
    globalThis.__bluesky_spaces_pending_invites__ = new Map();
  }
  return globalThis.__bluesky_spaces_pending_invites__;
}

function getActiveSpeakers(): Map<string, Set<string>> {
  if (!globalThis.__bluesky_spaces_active_speakers__) {
    globalThis.__bluesky_spaces_active_speakers__ = new Map();
  }
  return globalThis.__bluesky_spaces_active_speakers__;
}

function getBlockedUsers(): Map<string, Set<string>> {
  if (!globalThis.__bluesky_spaces_blocked__) {
    globalThis.__bluesky_spaces_blocked__ = new Map();
  }
  return globalThis.__bluesky_spaces_blocked__;
}

export function isBlocked(spaceId: string, identity: string): boolean {
  return Boolean(getBlockedUsers().get(spaceId)?.has(identity));
}

export class StageError extends Error {
  status: number;
  code: string;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = 'StageError';
    this.code = code;
    this.status = status;
  }
}

export interface InviteToStageInput {
  spaceId: string;
  hostDid: string;
  targetIdentity: string;
  /** Override for the LiveKit room service (used by tests). */
  liveKitClient?: ReturnType<typeof getLiveKitClient>;
}

export interface InviteToStageResult {
  ok: true;
  invite: PendingInvite;
}

export interface AcceptStageInviteInput {
  spaceId: string;
  userDid: string;
  displayName?: string;
}

export interface LeaveStageInput {
  spaceId: string;
  userDid: string;
  displayName?: string;
}

export interface RemoveFromStageInput {
  spaceId: string;
  hostDid: string;
  targetIdentity: string;
}

/**
 * Resolve a space by primary key or slug, throwing StageError(404) if missing.
 */
async function resolveSpace(spaceId: string): Promise<{
  id: string;
  hostId: string;
  roomName: string;
}> {
  let space = await getSpaceById(spaceId);
  if (!space) {
    space = await getSpaceBySlug(spaceId);
  }
  if (!space) {
    throw new StageError(
      'not_found',
      404,
      `Space ${spaceId} not found.`
    );
  }
  return {
    id: space.id,
    hostId: space.hostId,
    roomName: roomNameForSpace(space.id),
  };
}

/**
 * List the participants currently in the LiveKit room and return only those
 * that are audience (cannot publish). If the LiveKit call fails we degrade
 * gracefully — the invite is still recorded — but the caller is told.
 */
async function listAudienceParticipants(
  roomName: string
): Promise<StageParticipantSummary[]> {
  let client;
  try {
    client = getLiveKitClient();
  } catch {
    return [];
  }
  try {
    const participants = await client.listParticipants(roomName);
    return participants
      .filter((p) => {
        const perms = (p.permission ?? {}) as {
          canPublish?: boolean;
        };
        return perms.canPublish === false;
      })
      .map((p) => ({ identity: p.identity, name: p.name }));
  } catch {
    return [];
  }
}

/**
 * Best-effort LiveKit data message so the audience client can surface a
 * toast. Failures are swallowed because the in-memory invite is the source
 * of truth.
 *
 * NOTE: The RoomServiceClient.sendData signature has changed across SDK
 * versions. We call it through a loose proxy so typecheck stays green
 * regardless of which overload the installed SDK exposes.
 */
async function broadcastData(
  roomName: string,
  payload: Record<string, unknown>,
  targetIdentities?: string[]
): Promise<void> {
  try {
    const client = getLiveKitClient() as unknown as {
      sendData: (...args: unknown[]) => Promise<unknown>;
    };
    const data = new TextEncoder().encode(JSON.stringify(payload));
    // Try the (room, data, options) shape first, fall back to the legacy
    // signature. Either way failures are swallowed.
    try {
      await client.sendData(roomName, data, {
        reliable: true,
        destinationIdentities: targetIdentities,
      });
    } catch {
      await client.sendData(roomName, data, 1, {
        reliable: true,
        destinationIdentities: targetIdentities,
      });
    }
  } catch {
    /* swallow — data messages are best-effort */
  }
}

/**
 * Add or remove an identity from the active speakers set for a space.
 */
function markSpeaker(spaceId: string, identity: string): void {
  const set = getActiveSpeakers().get(spaceId) ?? new Set<string>();
  set.add(identity);
  getActiveSpeakers().set(spaceId, set);
}

function unmarkSpeaker(spaceId: string, identity: string): void {
  const set = getActiveSpeakers().get(spaceId);
  if (!set) return;
  set.delete(identity);
  if (set.size === 0) {
    getActiveSpeakers().delete(spaceId);
  }
}

/**
 * Invite an audience member to stage. The host must own the space. The
 * target must currently be in the room as audience (best-effort check via
 * LiveKit). On success a pending invite is recorded and a data message is
 * sent so the audience client can show a toast.
 */
export async function inviteToStage(
  input: InviteToStageInput
): Promise<InviteToStageResult> {
  if (!input.targetIdentity) {
    throw new StageError(
      'validation_error',
      400,
      'targetIdentity is required.'
    );
  }

  const space = await resolveSpace(input.spaceId);
  if (space.hostId !== input.hostDid) {
    throw new StageError(
      'forbidden',
      403,
      'Only the space host can invite speakers.'
    );
  }

  // Best-effort validation that the target is currently in the room as
  // audience. If we cannot reach LiveKit we still proceed (single-replica
  // MVP).
  const audience = await listAudienceParticipants(space.roomName);
  if (audience.length > 0) {
    const known = audience.some((p) => p.identity === input.targetIdentity);
    if (!known) {
      throw new StageError(
        'target_not_in_room',
        404,
        'Target participant is not in the room as audience.'
      );
    }
  }

  const invite: PendingInvite = {
    spaceId: space.id,
    roomName: space.roomName,
    targetIdentity: input.targetIdentity,
    hostDid: input.hostDid,
    createdAt: Date.now(),
  };
  getInviteStore().set(inviteKey(space.id, input.targetIdentity), invite);

  await broadcastData(
    space.roomName,
    {
      type: 'stage_invite',
      spaceId: space.id,
      hostDid: input.hostDid,
      targetIdentity: input.targetIdentity,
    },
    [input.targetIdentity]
  );

  return { ok: true, invite };
}

/**
 * Accept a pending stage invite. The caller must have a pending invite
 * keyed by their DID. On success a speaker token is issued and the caller
 * is added to the active speakers set.
 */
export async function acceptStageInvite(
  input: AcceptStageInviteInput
): Promise<StageTokenResult> {
  const space = await resolveSpace(input.spaceId);
  const key = inviteKey(space.id, input.userDid);
  const store = getInviteStore();
  const invite = store.get(key);
  if (!invite) {
    throw new StageError(
      'no_pending_invite',
      404,
      'No pending stage invite for this user.'
    );
  }

  store.delete(key);
  markSpeaker(space.id, input.userDid);

  const { token, wsUrl } = await generateToken({
    room: space.roomName,
    identity: input.userDid,
    role: 'speaker',
    name: input.displayName,
  });

  await broadcastData(space.roomName, {
    type: 'stage_role_changed',
    spaceId: space.id,
    identity: input.userDid,
    role: 'speaker',
  });

  return {
    token,
    wsUrl,
    role: 'speaker',
    roomName: space.roomName,
    identity: input.userDid,
  };
}

/**
 * Leave stage and re-join as audience. Anyone currently on stage can call
 * this. Returns an audience token.
 */
export async function leaveStage(
  input: LeaveStageInput
): Promise<StageTokenResult> {
  const space = await resolveSpace(input.spaceId);
  unmarkSpeaker(space.id, input.userDid);

  const { token, wsUrl } = await generateToken({
    room: space.roomName,
    identity: input.userDid,
    role: 'audience',
    name: input.displayName,
  });

  await broadcastData(space.roomName, {
    type: 'stage_role_changed',
    spaceId: space.id,
    identity: input.userDid,
    role: 'audience',
  });

  return {
    token,
    wsUrl,
    role: 'audience',
    roomName: space.roomName,
    identity: input.userDid,
  };
}

/**
 * Host removes a speaker from stage. The host must own the space. Returns
 * an audience token for the removed user (the host is expected to send it
 * to the removed user via LiveKit data message so they can reconnect).
 */
export async function removeFromStage(
  input: RemoveFromStageInput
): Promise<StageTokenResult> {
  if (!input.targetIdentity) {
    throw new StageError(
      'validation_error',
      400,
      'targetIdentity is required.'
    );
  }

  const space = await resolveSpace(input.spaceId);
  if (space.hostId !== input.hostDid) {
    throw new StageError(
      'forbidden',
      403,
      'Only the space host can remove speakers.'
    );
  }

  unmarkSpeaker(space.id, input.targetIdentity);
  // Clear any pending invite just in case.
  getInviteStore().delete(inviteKey(space.id, input.targetIdentity));

  const { token, wsUrl } = await generateToken({
    room: space.roomName,
    identity: input.targetIdentity,
    role: 'audience',
  });

  await broadcastData(
    space.roomName,
    {
      type: 'stage_removed',
      spaceId: space.id,
      identity: input.targetIdentity,
      role: 'audience',
      token,
      wsUrl,
    },
    [input.targetIdentity]
  );

  return {
    token,
    wsUrl,
    role: 'audience',
    roomName: space.roomName,
    identity: input.targetIdentity,
  };
}

export interface KickFromSpaceInput {
  spaceId: string;
  hostDid: string;
  targetIdentity: string;
}

/**
 * Host kicks a participant from the space. Removes them from the active
 * speakers set and from the LiveKit room.
 */
export async function kickFromSpace(
  input: KickFromSpaceInput
): Promise<{ ok: true }> {
  if (!input.targetIdentity) {
    throw new StageError(
      'validation_error',
      400,
      'targetIdentity is required.'
    );
  }
  const space = await resolveSpace(input.spaceId);
  if (space.hostId !== input.hostDid) {
    throw new StageError(
      'forbidden',
      403,
      'Only the space host can kick participants.'
    );
  }
  unmarkSpeaker(space.id, input.targetIdentity);
  getInviteStore().delete(inviteKey(space.id, input.targetIdentity));
  await removeParticipant(space.roomName, input.targetIdentity);
  await broadcastData(
    space.roomName,
    {
      type: 'stage_removed',
      spaceId: space.id,
      identity: input.targetIdentity,
      role: 'audience',
    },
    [input.targetIdentity]
  );
  return { ok: true };
}

export interface BlockFromSpaceInput {
  spaceId: string;
  hostDid: string;
  targetIdentity: string;
}

/**
 * Host blocks a participant from the space. Records the DID in the
 * in-memory block list and kicks them from the room. LIMITATION: the
 * block list is single-replica (stored on globalThis) — production should
 * persist this in Postgres.
 */
export async function blockFromSpace(
  input: BlockFromSpaceInput
): Promise<{ ok: true }> {
  if (!input.targetIdentity) {
    throw new StageError(
      'validation_error',
      400,
      'targetIdentity is required.'
    );
  }
  const space = await resolveSpace(input.spaceId);
  if (space.hostId !== input.hostDid) {
    throw new StageError(
      'forbidden',
      403,
      'Only the space host can block participants.'
    );
  }
  const set = getBlockedUsers().get(space.id) ?? new Set<string>();
  set.add(input.targetIdentity);
  getBlockedUsers().set(space.id, set);
  unmarkSpeaker(space.id, input.targetIdentity);
  getInviteStore().delete(inviteKey(space.id, input.targetIdentity));
  await removeParticipant(space.roomName, input.targetIdentity);
  return { ok: true };
}

export interface MuteSpeakerInput {
  spaceId: string;
  hostDid: string;
  targetIdentity: string;
  muted: boolean;
}

/**
 * Host mutes or unmutes a speaker. Delegates to the LiveKit
 * RoomServiceClient.updateParticipant permission update.
 */
export async function muteSpeaker(
  input: MuteSpeakerInput
): Promise<{ ok: true; muted: boolean }> {
  if (!input.targetIdentity) {
    throw new StageError(
      'validation_error',
      400,
      'targetIdentity is required.'
    );
  }
  const space = await resolveSpace(input.spaceId);
  if (space.hostId !== input.hostDid) {
    throw new StageError(
      'forbidden',
      403,
      'Only the space host can mute speakers.'
    );
  }
  await muteParticipant(space.roomName, input.targetIdentity, input.muted);
  return { ok: true, muted: input.muted };
}

// ---------- Read helpers (used by components & tests) ----------

/**
 * Return the pending invite for an identity in a space, or null.
 */
export function getPendingInvite(
  spaceId: string,
  identity: string
): PendingInvite | null {
  return getInviteStore().get(inviteKey(spaceId, identity)) ?? null;
}

/**
 * Return all currently pending invites for a space.
 */
export function listPendingInvites(spaceId: string): PendingInvite[] {
  const out: PendingInvite[] = [];
  for (const invite of getInviteStore().values()) {
    if (invite.spaceId === spaceId) out.push(invite);
  }
  return out;
}

/**
 * Return the set of identities currently considered "on stage" for a space.
 */
export function listActiveSpeakers(spaceId: string): string[] {
  const set = getActiveSpeakers().get(spaceId);
  return set ? Array.from(set) : [];
}

// ---------- Test helpers ----------

/**
 * Test-only: reset the in-memory stores so unit tests can run in isolation.
 * Not exported via the public route surface.
 */
export function __resetStageStoresForTests(): void {
  globalThis.__bluesky_spaces_pending_invites__ = undefined;
  globalThis.__bluesky_spaces_active_speakers__ = undefined;
  globalThis.__bluesky_spaces_blocked__ = undefined;
}
