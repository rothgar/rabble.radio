// src/lib/recording.ts
//
// Service helpers for the Recording table (one row per LiveKit egress, i.e.
// one per show). Status values:
//   - "starting" : egress started, file not yet visible in R2/S3
//   - "available": file present, download URL issued
//   - "failed"   : egress could not produce a usable file
//   - "expired"  : past the retention window, object deleted
//
// Podcast publishing: a host can publish an "available" recording as an
// episode. Published recordings are listed in the host's RSS feed
// (/podcast/[handle]/feed.xml), are fetchable by anyone through
// /api/recordings/[id]/audio, and are skipped by the expiry sweep.

import { prisma } from '@/lib/db';
import {
  deleteObject,
  getObjectSize,
  getSignedDownloadUrl,
  getStorageConfig,
} from '@/lib/storage';

export type RecordingStatus = 'starting' | 'available' | 'failed' | 'expired';

export interface RecordingRow {
  id: string;
  spaceId: string;
  egressId: string;
  status: RecordingStatus;
  startedAt: Date;
  endedAt: Date | null;
  expiresAt: Date;
  s3Key: string;
  s3Bucket: string;
  contentType: string;
  sizeBytes: number | null;
  downloadUrl: string | null;
  hostDid: string;
  published: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const RECORDING_TTL_DAYS = 30;
const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Build a deterministic S3 object key for a given egress session.
 */
export function buildRecordingKey(roomName: string, startedAt: Date): string {
  const safeRoom = roomName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const ts = startedAt.getTime();
  return `recordings/${safeRoom}-${ts}.mp4`;
}

/** D1 hands back ISO strings or epoch numbers for DATETIME columns. */
function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') return new Date(value);
  return new Date(NaN);
}

function toDateOrNull(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const d = toDate(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function rowToRecording(row: Record<string, unknown>): RecordingRow {
  return {
    id: String(row.id),
    spaceId: String(row.spaceId),
    egressId: String(row.egressId),
    status: (row.status as RecordingStatus) ?? 'starting',
    startedAt: toDate(row.startedAt),
    endedAt: toDateOrNull(row.endedAt),
    expiresAt: toDate(row.expiresAt),
    s3Key: String(row.s3Key),
    s3Bucket: String(row.s3Bucket),
    contentType: String(row.contentType ?? 'audio/mpeg'),
    sizeBytes: typeof row.sizeBytes === 'number' ? row.sizeBytes : null,
    downloadUrl: (row.downloadUrl as string | null) ?? null,
    hostDid: String(row.hostDid),
    published: Boolean(row.published),
    publishedAt: toDateOrNull(row.publishedAt),
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
  };
}

/**
 * Insert a new `Recording` row in the "starting" state. Returns the
 * created row. Throws if a row with the same `egressId` already exists.
 */
export async function createRecording(input: {
  spaceId: string;
  hostDid: string;
  egressId: string;
  s3Key: string;
  s3Bucket?: string;
  expiresAt?: Date;
  contentType?: string;
  now?: Date;
}): Promise<RecordingRow> {
  const now = input.now ?? new Date();
  const expiresAt =
    input.expiresAt ??
    new Date(now.getTime() + RECORDING_TTL_DAYS * 24 * 60 * 60 * 1000);
  const cfg = getStorageConfig();
  const row = await prisma.recording.create({
    data: {
      spaceId: input.spaceId,
      egressId: input.egressId,
      status: 'starting',
      startedAt: now,
      expiresAt,
      s3Key: input.s3Key,
      s3Bucket: input.s3Bucket ?? cfg.bucket,
      contentType: input.contentType ?? 'audio/mpeg',
      hostDid: input.hostDid,
    },
  });
  return rowToRecording(row as unknown as Record<string, unknown>);
}

/**
 * Look up an active (non-expired) recording for a space. Returns `null`
 * when none exists.
 */
export async function findActiveRecordingForSpace(
  spaceId: string
): Promise<RecordingRow | null> {
  const row = await prisma.recording.findFirst({
    where: { spaceId, status: { in: ['starting', 'available'] } },
    orderBy: { startedAt: 'desc' },
  });
  return row ? rowToRecording(row as unknown as Record<string, unknown>) : null;
}

/**
 * Return every recording for a space, ordered by `startedAt` DESC so the
 * newest row is first.
 */
export async function getRecordingsForSpace(
  spaceId: string
): Promise<RecordingRow[]> {
  const rows = await prisma.recording.findMany({
    where: { spaceId },
    orderBy: { startedAt: 'desc' },
  });
  return rows.map((r) => rowToRecording(r as unknown as Record<string, unknown>));
}

/**
 * Look up the most recent recording for a space regardless of status.
 */
export async function getRecordingForSpace(
  spaceId: string
): Promise<RecordingRow | null> {
  const row = await prisma.recording.findFirst({
    where: { spaceId },
    orderBy: { startedAt: 'desc' },
  });
  return row ? rowToRecording(row as unknown as Record<string, unknown>) : null;
}

export async function getRecordingById(id: string): Promise<RecordingRow | null> {
  const row = await prisma.recording.findUnique({ where: { id } });
  return row ? rowToRecording(row as unknown as Record<string, unknown>) : null;
}

/** Every recording a host owns, newest first (the account page). */
export async function getRecordingsForHost(hostDid: string): Promise<RecordingRow[]> {
  const rows = await prisma.recording.findMany({
    where: { hostDid },
    orderBy: { startedAt: 'desc' },
  });
  return rows.map((r) => rowToRecording(r as unknown as Record<string, unknown>));
}

export interface PublishedEpisode {
  recording: RecordingRow;
  space: { id: string; title: string; description: string | null; tags: string[] };
}

/** Published, playable recordings for a host's podcast feed, newest first. */
export async function getPublishedEpisodesForHost(
  hostDid: string
): Promise<PublishedEpisode[]> {
  const rows = await prisma.recording.findMany({
    where: { hostDid, published: true, status: 'available' },
    orderBy: { startedAt: 'desc' },
    include: {
      space: {
        select: { id: true, title: true, description: true, tags: { select: { tag: true } } },
      },
    },
  });
  return rows.map((r) => {
    const { space, ...rest } = r as unknown as Record<string, unknown> & {
      space: {
        id: string;
        title: string;
        description: string | null;
        tags: Array<{ tag: string } | string>;
      };
    };
    return {
      recording: rowToRecording(rest),
      space: {
        id: space.id,
        title: space.title,
        description: space.description,
        tags: (space.tags ?? []).map((t) => (typeof t === 'string' ? t : t.tag)),
      },
    };
  });
}

/**
 * Publish or unpublish a recording as a podcast episode. Only "available"
 * recordings can be published; returns null when the row does not exist.
 */
export async function setRecordingPublished(
  id: string,
  published: boolean,
  now: Date = new Date()
): Promise<RecordingRow | null> {
  const current = await getRecordingById(id);
  if (!current) return null;
  if (published && current.status !== 'available') {
    throw new RecordingStateError(
      'not_ready',
      `Recording is in status '${current.status}' and cannot be published.`
    );
  }
  const row = await prisma.recording.update({
    where: { id },
    data: {
      published,
      publishedAt: published ? current.publishedAt ?? now : null,
    },
  });
  return rowToRecording(row as unknown as Record<string, unknown>);
}

export class RecordingStateError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'RecordingStateError';
    this.code = code;
  }
}

/**
 * Mark a recording as completed: sets `endedAt`, attempts to populate
 * `sizeBytes` from S3, generates a fresh signed URL, and flips status to
 * `available`.
 */
export async function completeRecording(
  egressId: string,
  options: { endedAt?: Date; sizeBytes?: number | null } = {}
): Promise<RecordingRow | null> {
  const existing = await prisma.recording.findUnique({ where: { egressId } });
  if (!existing) return null;
  const current = rowToRecording(existing as unknown as Record<string, unknown>);

  const endedAt = options.endedAt ?? new Date();
  const detectedSize =
    options.sizeBytes !== undefined
      ? options.sizeBytes
      : await getObjectSize(current.s3Key, current.s3Bucket);
  const downloadUrl = await getSignedDownloadUrl(
    current.s3Key,
    SIGNED_URL_TTL_SECONDS,
    current.s3Bucket
  );

  const updated = await prisma.recording.update({
    where: { egressId },
    data: {
      status: 'available',
      endedAt,
      sizeBytes: detectedSize ?? null,
      downloadUrl,
    },
  });
  return rowToRecording(updated as unknown as Record<string, unknown>);
}

/**
 * Generate a fresh signed URL for an available recording.
 */
export async function refreshSignedUrl(
  recordingId: string
): Promise<RecordingRow | null> {
  const current = await getRecordingById(recordingId);
  if (!current) return null;
  if (current.status !== 'available') return current;

  const downloadUrl = await getSignedDownloadUrl(
    current.s3Key,
    SIGNED_URL_TTL_SECONDS,
    current.s3Bucket
  );
  const updated = await prisma.recording.update({
    where: { id: recordingId },
    data: { downloadUrl },
  });
  return rowToRecording(updated as unknown as Record<string, unknown>);
}

/** A short-lived URL for streaming or downloading the object. */
export async function signedUrlFor(recording: RecordingRow): Promise<string> {
  return getSignedDownloadUrl(recording.s3Key, SIGNED_URL_TTL_SECONDS, recording.s3Bucket);
}

/**
 * Mark a recording as failed.
 */
export async function failRecording(
  egressId: string
): Promise<RecordingRow | null> {
  const result = await prisma.recording.updateMany({
    where: { egressId, status: { not: 'expired' } },
    data: { status: 'failed', endedAt: new Date() },
  });
  if (result.count === 0) return null;
  const row = await prisma.recording.findUnique({ where: { egressId } });
  return row ? rowToRecording(row as unknown as Record<string, unknown>) : null;
}

/**
 * Sweep stale recordings past their expiresAt. Deletes objects
 * (best-effort) and marks rows 'expired'. Published episodes are kept.
 */
export async function expireOldRecordings(
  now: Date = new Date()
): Promise<number> {
  const rows = await prisma.recording.findMany({
    where: {
      expiresAt: { lt: now },
      status: { in: ['starting', 'available'] },
      published: false,
    },
  });
  if (rows.length === 0) return 0;
  for (const raw of rows) {
    const row = rowToRecording(raw as unknown as Record<string, unknown>);
    await deleteObject(row.s3Key, row.s3Bucket).catch(() => false);
    await prisma.recording.update({
      where: { id: row.id },
      data: { status: 'expired', downloadUrl: null },
    });
  }
  return rows.length;
}

/** The newest playable recording per space, for replay buttons. */
export async function getLatestAvailableRecordings(
  spaceIds: string[]
): Promise<Map<string, RecordingRow>> {
  const out = new Map<string, RecordingRow>();
  if (spaceIds.length === 0) return out;
  const rows = await prisma.recording.findMany({
    where: { spaceId: { in: spaceIds }, status: 'available' },
    orderBy: { startedAt: 'desc' },
  });
  for (const raw of rows) {
    const row = rowToRecording(raw as unknown as Record<string, unknown>);
    if (!out.has(row.spaceId)) out.set(row.spaceId, row);
  }
  return out;
}

/** Seconds between start and end, when both are known. */
export function recordingDurationSeconds(row: RecordingRow): number | null {
  if (!row.endedAt) return null;
  const ms = row.endedAt.getTime() - row.startedAt.getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 1000) : null;
}

/**
 * Public view of a recording row, safe to send to clients.
 */
export interface PublicRecording {
  id: string;
  spaceId: string;
  status: RecordingStatus;
  startedAt: string;
  endedAt: string | null;
  expiresAt: string;
  sizeBytes: number | null;
  downloadUrl: string | null;
  contentType: string;
  published: boolean;
  publishedAt: string | null;
}

function iso(d: Date): string {
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

export function toPublicRecording(row: RecordingRow): PublicRecording {
  return {
    id: row.id,
    spaceId: row.spaceId,
    status: row.status,
    startedAt: iso(row.startedAt),
    endedAt: row.endedAt ? iso(row.endedAt) : null,
    expiresAt: iso(row.expiresAt),
    sizeBytes: row.sizeBytes,
    downloadUrl: row.downloadUrl,
    contentType: row.contentType,
    published: row.published,
    publishedAt: row.publishedAt ? iso(row.publishedAt) : null,
  };
}
