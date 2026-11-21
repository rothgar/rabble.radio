// src/lib/reaction-buffer.ts
//
// Buffers reaction taps per space in memory and flushes them to D1 in one
// batched write instead of a round trip per tap. A live show's reaction
// burst is exactly the load pattern that queued concurrent requests behind
// the single D1 connection (issue #73): recording a tap never touches D1 on
// the request path (beyond a one-time read that warms a space's count), and
// a flush runs in the background every FLUSH_INTERVAL_MS, or sooner once a
// buffer grows past FLUSH_MAX_TAPS.
//
// Buffered state is per-isolate and lost if the isolate is evicted before a
// flush runs. That's accepted: reactions don't need immediate consistency
// (issue #73's decision), and Workers isolates don't run code between
// requests, so there's no reliable background timer to flush on a fixed
// schedule instead — a flush has to be triggered by request traffic.

import { prisma } from '@/lib/db';
import { runInBackground } from '@/lib/background';
import { logger } from '@/lib/logger';
import type { Prisma } from '@prisma/client';

interface PendingTap {
  did: string;
  kind: string;
  createdAt: Date;
}

interface SpaceBuffer {
  taps: PendingTap[];
  /** Space.reactionCount as of the last read or flush. */
  baseCount: number;
  lastFlushAt: number;
  /** The in-flight flush, if one is already running for this space. */
  flushing: Promise<void> | null;
}

const buffers = new Map<string, SpaceBuffer>();
const initializing = new Map<string, Promise<SpaceBuffer>>();

/** A buffer flushes once it's held a tap this long... */
const FLUSH_INTERVAL_MS = 15_000;
/** ...or once it's grown this large, whichever comes first. */
const FLUSH_MAX_TAPS = 200;

async function getBuffer(spaceId: string, now: number): Promise<SpaceBuffer> {
  const existing = buffers.get(spaceId);
  if (existing) return existing;
  const pending = initializing.get(spaceId);
  if (pending) return pending;

  const init = (async (): Promise<SpaceBuffer> => {
    const space = await prisma.space
      .findUnique({ where: { id: spaceId }, select: { reactionCount: true } })
      .catch(() => null);
    const buffer: SpaceBuffer = {
      taps: [],
      baseCount: space?.reactionCount ?? 0,
      lastFlushAt: now,
      flushing: null,
    };
    buffers.set(spaceId, buffer);
    initializing.delete(spaceId);
    return buffer;
  })();
  initializing.set(spaceId, init);
  return init;
}

async function findOpenSessionId(spaceId: string): Promise<string | null> {
  const session = await prisma.showSession.findFirst({
    where: { spaceId, endedAt: null },
    orderBy: { startedAt: 'desc' },
    select: { id: true },
  });
  return session?.id ?? null;
}

export interface BufferReactionInput {
  spaceId: string;
  did: string;
  kind?: string;
  now?: Date;
}

/**
 * Record a reaction tap in memory and return the space's reaction count as
 * of this tap. Triggers a background flush once the buffer is overdue.
 */
export async function bufferReaction(input: BufferReactionInput): Promise<number> {
  const now = input.now ?? new Date();
  const buffer = await getBuffer(input.spaceId, now.getTime());
  buffer.taps.push({ did: input.did, kind: input.kind ?? 'reaction', createdAt: now });
  const count = buffer.baseCount + buffer.taps.length;

  if (buffer.taps.length >= FLUSH_MAX_TAPS || now.getTime() - buffer.lastFlushAt >= FLUSH_INTERVAL_MS) {
    runInBackground(flushSpaceReactions(input.spaceId), 'reaction_buffer.flush');
  }
  return count;
}

/**
 * Write a space's buffered taps to D1: a batch insert of the ShowReaction
 * rows plus one increment each on the Space and (if the show is still live)
 * its open ShowSession, sent together through `$transaction`. A no-op when
 * nothing is buffered. Safe to call while another flush for the same space
 * is already in flight — this call waits for it rather than starting a
 * second one, so a caller that needs the flush to have landed (not just
 * been requested) can rely on the returned promise.
 */
export async function flushSpaceReactions(spaceId: string): Promise<void> {
  const buffer = buffers.get(spaceId);
  if (!buffer) return;
  if (buffer.flushing) {
    await buffer.flushing;
    return;
  }
  if (buffer.taps.length === 0) {
    buffer.lastFlushAt = Date.now();
    return;
  }

  const taps = buffer.taps;
  buffer.taps = [];
  buffer.lastFlushAt = Date.now();

  buffer.flushing = (async () => {
    try {
      const sessionId = await findOpenSessionId(spaceId);
      const ops: Prisma.PrismaPromise<unknown>[] = [
        prisma.showReaction.createMany({
          data: taps.map((t) => ({
            spaceId,
            sessionId,
            did: t.did,
            kind: t.kind,
            createdAt: t.createdAt,
          })),
        }),
        prisma.space.update({
          where: { id: spaceId },
          data: { reactionCount: { increment: taps.length } },
          select: { reactionCount: true },
        }),
      ];
      if (sessionId) {
        ops.push(
          prisma.showSession.update({
            where: { id: sessionId },
            data: { reactionCount: { increment: taps.length } },
          })
        );
      }
      const [, updatedSpace] = (await prisma.$transaction(ops)) as [unknown, { reactionCount: number }];
      buffer.baseCount = updatedSpace.reactionCount;
    } catch (err) {
      // D1 has no real transactions — prisma/schema.prisma documents
      // `$transaction` as running statement by statement — so a failure
      // partway through may mean the createMany already landed. Retrying
      // would replay it (no unique constraint) and double the increments
      // that did land, which is worse than losing the batch. So it's
      // dropped instead, matching this module's wider tolerance for an
      // occasional lost reaction (issue #73's decision: reactions don't
      // need immediate consistency).
      logger.warn('reaction_buffer.flush_failed', { spaceId, count: taps.length, err });
    } finally {
      buffer.flushing = null;
    }
  })();
  await buffer.flushing;
}

// Test-only: reset the module-level buffers between runs. Not exported via
// the public API surface.
export function __resetReactionBufferForTests(): void {
  buffers.clear();
  initializing.clear();
}
