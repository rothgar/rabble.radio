// src/lib/reports.ts
//
// Reports filed by a show's host against one of their speakers for bad
// behavior. Host-only and speaker-only: the API route checks the caller is
// the space's host before calling createReport.
//
// Reading reports is limited to the DIDs or handles listed in the
// REPORT_ADMIN_DIDS environment variable (comma separated).

import { prisma } from '@/lib/db';
import { didAllowlist, isAllowlisted } from '@/lib/did-allowlist';

export const REPORT_REASON_MAX = 2000;

export interface ReportInput {
  spaceId: string;
  reporterDid: string;
  reporterHandle?: string | null;
  reportedDid: string;
  reportedHandle?: string | null;
  reason: string;
  now?: Date;
}

export interface ReportRow {
  id: string;
  spaceId: string;
  reporterDid: string;
  reporterHandle: string | null;
  reportedDid: string;
  reportedHandle: string | null;
  reason: string;
  createdAt: Date;
}

export class ReportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportValidationError';
  }
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number' || typeof value === 'string') return new Date(value);
  return new Date(NaN);
}

function clampString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function rowToReport(row: Record<string, unknown>): ReportRow {
  return {
    id: String(row.id),
    spaceId: String(row.spaceId ?? ''),
    reporterDid: String(row.reporterDid ?? ''),
    reporterHandle: (row.reporterHandle as string | null) ?? null,
    reportedDid: String(row.reportedDid ?? ''),
    reportedHandle: (row.reportedHandle as string | null) ?? null,
    reason: String(row.reason ?? ''),
    createdAt: toDate(row.createdAt),
  };
}

/** Validate and store a report. Throws ReportValidationError on bad input. */
export async function createReport(input: ReportInput): Promise<ReportRow> {
  const spaceId = clampString(input.spaceId, 100);
  if (!spaceId) throw new ReportValidationError('spaceId is required.');
  const reporterDid = clampString(input.reporterDid, 500);
  if (!reporterDid) throw new ReportValidationError('reporterDid is required.');
  const reportedDid = clampString(input.reportedDid, 500);
  if (!reportedDid) throw new ReportValidationError('reportedDid is required.');
  const reason = clampString(input.reason, REPORT_REASON_MAX + 1);
  if (!reason) throw new ReportValidationError('Reason is required.');
  if (reason.length > REPORT_REASON_MAX) {
    throw new ReportValidationError(`Reason must be ${REPORT_REASON_MAX} characters or fewer.`);
  }

  const row = await prisma.report.create({
    data: {
      spaceId,
      reporterDid,
      reporterHandle: clampString(input.reporterHandle, 500),
      reportedDid,
      reportedHandle: clampString(input.reportedHandle, 500),
      reason,
      createdAt: input.now ?? new Date(),
    },
  });
  return rowToReport(row as unknown as Record<string, unknown>);
}

/** Newest reports first. */
export async function listReports(limit = 100): Promise<ReportRow[]> {
  const rows = await prisma.report.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.max(1, Math.min(limit, 500)),
  });
  return rows.map((r) => rowToReport(r as unknown as Record<string, unknown>));
}

/** Parse REPORT_ADMIN_DIDS (DIDs or handles, comma separated). */
export function reportAdmins(env: Record<string, string | undefined> = process.env): Set<string> {
  return didAllowlist(env.REPORT_ADMIN_DIDS);
}

export function isReportAdmin(
  user: { did: string; handle: string } | null | undefined,
  env: Record<string, string | undefined> = process.env
): boolean {
  return isAllowlisted(user, reportAdmins(env));
}
