// src/lib/recording.ts
//
// Service helpers for the Recording table. The table is intentionally
// accessed via `$queryRawUnsafe` / `$executeRawUnsafe` so this module
// typechecks without depending on a freshly-regenerated Prisma client
// (the Docker builder runs `prisma generate` and the runtime container
// has the full generated client; locally on NixOS the engine binaries
// are unavailable and we still want typecheck/tests to pass).
//
// Status values:
//   - "starting" : egress started, file not yet visible in S3
//   - "available": file present, download URL issued
//   - "failed"   : egress could not produce a usable file
//   - "expired"  : past the 30-day retention window, S3 object deleted

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
  createdAt: Date;
  updatedAt: Date;
}

export const RECORDING_TTL_DAYS = 30;
const SIGNED_URL_TTL_SECONDS = 300;

const SELECT_COLUMNS =
  'id, "spaceId", "egressId", status, "startedAt", "endedAt", "expiresAt", "s3Key", "s3Bucket", "contentType", "sizeBytes", "downloadUrl", "hostDid", "createdAt", "updatedAt"';

// ---------------------------------------------------------------------------
// Tiny SQL escape helpers.
//
// Prisma's tagged-template `Prisma.sql` API isn't accessible without a
// regenerated client (we have only the untyped stubs locally on NixOS).
// `prisma.$queryRawUnsafe` accepts plain strings and parameter arrays but
// gives up parameterisation safety, so we escape inputs ourselves. All
// values here come from internal code (we control the producers), but we
// escape defensively anyway.
// ---------------------------------------------------------------------------

function sqlString(value: string): string {
  // Postgres standard-conforming string literal: wrap in single quotes and
  // double any embedded single quotes.
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlValue(value: string | number | Date | null): string {
  if (value === null || value === undefined) return 'NULL';
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  return sqlString(value);
}

type SqlParam = string | number | Date | null | undefined;

function buildSelect(where: string): { sql: string; params: SqlParam[] } {
  return {
    sql: `SELECT ${SELECT_COLUMNS} FROM "Recording" WHERE ${where} LIMIT 1`,
    params: [],
  };
}

/**
 * Build a deterministic S3 object key for a given egress session.
 */
export function buildRecordingKey(roomName: string, startedAt: Date): string {
  const safeRoom = roomName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const ts = startedAt.getTime();
  return `recordings/${safeRoom}-${ts}.mp4`;
}

function rowToRecording(row: Record<string, unknown>): RecordingRow {
  return {
    id: String(row.id),
    spaceId: String(row.spaceId),
    egressId: String(row.egressId),
    status: (row.status as RecordingStatus) ?? 'starting',
    startedAt: row.startedAt as Date,
    endedAt: (row.endedAt as Date | null) ?? null,
    expiresAt: row.expiresAt as Date,
    s3Key: String(row.s3Key),
    s3Bucket: String(row.s3Bucket),
    contentType: String(row.contentType ?? 'audio/mpeg'),
    sizeBytes: typeof row.sizeBytes === 'number' ? row.sizeBytes : null,
    downloadUrl: (row.downloadUrl as string | null) ?? null,
    hostDid: String(row.hostDid),
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
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
  const id = generateCuid();
  const sql = `
    INSERT INTO "Recording" (
      id, "spaceId", "egressId", status, "startedAt", "endedAt",
      "expiresAt", "s3Key", "s3Bucket", "contentType", "sizeBytes",
      "downloadUrl", "hostDid", "createdAt", "updatedAt"
    )
    VALUES (
      ${sqlValue(id)}, ${sqlValue(input.spaceId)}, ${sqlValue(input.egressId)},
      'starting', ${sqlValue(now)}, NULL, ${sqlValue(expiresAt)},
      ${sqlValue(input.s3Key)}, ${sqlValue(input.s3Bucket ?? cfg.bucket)},
      ${sqlValue(input.contentType ?? 'audio/mpeg')},
      NULL, NULL, ${sqlValue(input.hostDid)}, ${sqlValue(now)}, ${sqlValue(now)}
    )
    RETURNING ${SELECT_COLUMNS}
  `;
  const rows = await runQuery(sql);
  if (rows.length === 0) {
    throw new Error('createRecording: no row returned.');
  }
  return rowToRecording(rows[0]);
}

/**
 * Look up an active (non-expired) recording for a space. Returns `null`
 * when none exists.
 */
export async function findActiveRecordingForSpace(
  spaceId: string
): Promise<RecordingRow | null> {
  const sql = `
    SELECT ${SELECT_COLUMNS}
    FROM "Recording"
    WHERE "spaceId" = ${sqlValue(spaceId)}
      AND status IN ('starting', 'available')
    ORDER BY "startedAt" DESC
    LIMIT 1
  `;
  const rows = await runQuery(sql);
  return rows.length === 0 ? null : rowToRecording(rows[0]);
}

/**
 * Return every recording for a space, ordered by `startedAt` DESC so the
 * newest row is first. Used by the space-delete flow which needs to
 * enumerate and clean up all S3 objects for a space.
 */
export async function getRecordingsForSpace(
  spaceId: string
): Promise<RecordingRow[]> {
  const sql = `
    SELECT ${SELECT_COLUMNS}
    FROM "Recording"
    WHERE "spaceId" = ${sqlValue(spaceId)}
    ORDER BY "startedAt" DESC
  `;
  const rows = await runQuery(sql);
  return rows.map(rowToRecording);
}

/**
 * Look up the most recent recording for a space regardless of status.
 */
export async function getRecordingForSpace(
  spaceId: string
): Promise<RecordingRow | null> {
  const sql = `
    SELECT ${SELECT_COLUMNS}
    FROM "Recording"
    WHERE "spaceId" = ${sqlValue(spaceId)}
    ORDER BY "startedAt" DESC
    LIMIT 1
  `;
  const rows = await runQuery(sql);
  return rows.length === 0 ? null : rowToRecording(rows[0]);
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
  const lookupSql = `
    SELECT ${SELECT_COLUMNS}
    FROM "Recording"
    WHERE "egressId" = ${sqlValue(egressId)}
    LIMIT 1
  `;
  const existing = await runQuery(lookupSql);
  if (existing.length === 0) return null;
  const current = rowToRecording(existing[0]);

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

  const updateSql = `
    UPDATE "Recording"
    SET status = 'available',
        "endedAt" = ${sqlValue(endedAt)},
        "sizeBytes" = ${sqlValue(detectedSize ?? null)},
        "downloadUrl" = ${sqlValue(downloadUrl)},
        "updatedAt" = ${sqlValue(new Date())}
    WHERE "egressId" = ${sqlValue(egressId)}
    RETURNING ${SELECT_COLUMNS}
  `;
  const updated = await runQuery(updateSql);
  return updated.length === 0 ? null : rowToRecording(updated[0]);
}

/**
 * Generate a fresh signed URL for an available recording.
 */
export async function refreshSignedUrl(
  recordingId: string
): Promise<RecordingRow | null> {
  const lookupSql = `
    SELECT ${SELECT_COLUMNS}
    FROM "Recording"
    WHERE id = ${sqlValue(recordingId)}
    LIMIT 1
  `;
  const existing = await runQuery(lookupSql);
  if (existing.length === 0) return null;
  const current = rowToRecording(existing[0]);
  if (current.status !== 'available') return current;

  const downloadUrl = await getSignedDownloadUrl(
    current.s3Key,
    SIGNED_URL_TTL_SECONDS,
    current.s3Bucket
  );
  const updateSql = `
    UPDATE "Recording"
    SET "downloadUrl" = ${sqlValue(downloadUrl)},
        "updatedAt" = ${sqlValue(new Date())}
    WHERE id = ${sqlValue(recordingId)}
    RETURNING ${SELECT_COLUMNS}
  `;
  const updated = await runQuery(updateSql);
  return updated.length === 0 ? null : rowToRecording(updated[0]);
}

/**
 * Mark a recording as failed.
 */
export async function failRecording(
  egressId: string
): Promise<RecordingRow | null> {
  const updateSql = `
    UPDATE "Recording"
    SET status = 'failed',
        "endedAt" = ${sqlValue(new Date())},
        "updatedAt" = ${sqlValue(new Date())}
    WHERE "egressId" = ${sqlValue(egressId)}
      AND status != 'expired'
    RETURNING ${SELECT_COLUMNS}
  `;
  const updated = await runQuery(updateSql);
  return updated.length === 0 ? null : rowToRecording(updated[0]);
}

/**
 * Sweep stale recordings past their expiresAt. Deletes S3 objects
 * (best-effort) and marks rows 'expired'.
 */
export async function expireOldRecordings(
  now: Date = new Date()
): Promise<number> {
  const selectSql = `
    SELECT ${SELECT_COLUMNS}
    FROM "Recording"
    WHERE "expiresAt" < ${sqlValue(now)}
      AND status IN ('starting', 'available')
  `;
  const rows = await runQuery(selectSql);
  if (rows.length === 0) return 0;
  for (const raw of rows) {
    const row = rowToRecording(raw);
    await deleteObject(row.s3Key, row.s3Bucket).catch(() => false);
    await prisma.$executeRawUnsafe(
      `UPDATE "Recording"
       SET status = 'expired',
           "downloadUrl" = NULL,
           "updatedAt" = '${now.toISOString()}'
       WHERE id = '${row.id.replace(/'/g, "''")}'`
    );
  }
  return rows.length;
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
}

export function toPublicRecording(row: RecordingRow): PublicRecording {
  return {
    id: row.id,
    spaceId: row.spaceId,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    expiresAt: row.expiresAt.toISOString(),
    sizeBytes: row.sizeBytes,
    downloadUrl: row.downloadUrl,
    contentType: row.contentType,
  };
}

// ---------------------------------------------------------------------------
// cuid generator. Prisma's `@default(cuid())` only fires for `$queryRaw`-
// style inserts when we explicitly emit a value, so we generate one here.
function generateCuid(): string {
  const ts = Date.now().toString(36).padStart(8, '0');
  let rand = '';
  while (rand.length < 18) {
    rand += Math.floor(Math.random() * 0xffffffff).toString(36);
  }
  rand = rand.slice(0, 18);
  return `c${ts}${rand}`;
}

/**
 * Run a SELECT and cast the result to a typed array of plain rows. Goes
 * through the untyped `$queryRawUnsafe` API so this file typechecks even
 * when the locally-cached Prisma client has no generated models.
 */
async function runQuery(
  sql: string
): Promise<Record<string, unknown>[]> {
  // The cast is needed because the locally-cached client has no model
  // information (we don't run prisma generate on NixOS). At runtime the
  // real client is generated, so this cast is harmless.
  const exec = (
    prisma as unknown as {
      $queryRawUnsafe: (q: string) => Promise<unknown>;
    }
  ).$queryRawUnsafe;
  const result = (await exec(sql)) as unknown;
  return Array.isArray(result) ? (result as Record<string, unknown>[]) : [];
}

// Avoid "unused" lint noise for helpers used only in some branches.
void buildSelect;
void sqlValue;
