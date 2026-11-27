// src/app/api/reports/route.ts
//
// POST /api/reports -> a show's host reports one of their speakers for bad
//   behavior. Only the space's host may file a report.
//   Body: { spaceId, targetIdentity, reason, targetHandle? }
//   Response: { id } or an error envelope.
//
// GET /api/reports -> newest reports, for the admins listed in
//   REPORT_ADMIN_DIDS only. Response: { reports: [...] }

import { NextResponse, type NextRequest } from 'next/server';
import { jsonError, readJson, requireUser } from '@/lib/api';
import { resolveSpace } from '@/lib/spaces';
import { createReport, isReportAdmin, listReports, ReportValidationError } from '@/lib/reports';
import { listActiveSpeakers } from '@/lib/stage';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface ReportBody {
  spaceId?: unknown;
  targetIdentity?: unknown;
  targetHandle?: unknown;
  reason?: unknown;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const body = await readJson<ReportBody>(request);
  if (body instanceof NextResponse) return body;

  const spaceId = str(body.spaceId);
  const targetIdentity = str(body.targetIdentity);
  if (!spaceId || !targetIdentity) {
    return jsonError(400, 'validation_error', 'spaceId and targetIdentity are required.');
  }

  const space = await resolveSpace(spaceId);
  if (!space) {
    return jsonError(404, 'not_found');
  }
  if (space.hostId !== user.did) {
    return jsonError(403, 'forbidden', 'Only the show host can report a speaker.');
  }

  const speakers = await listActiveSpeakers(space.id);
  if (!speakers.includes(targetIdentity)) {
    return jsonError(400, 'validation_error', 'targetIdentity is not a current speaker in this show.');
  }

  try {
    const row = await createReport({
      spaceId: space.id,
      reporterDid: user.did,
      reporterHandle: user.handle,
      reportedDid: targetIdentity,
      reportedHandle: str(body.targetHandle) ?? null,
      reason: str(body.reason) ?? '',
    });
    logger.info('report.received', {
      id: row.id,
      spaceId: row.spaceId,
      reportedDid: row.reportedDid,
    });
    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (err) {
    if (err instanceof ReportValidationError) {
      return jsonError(400, 'validation_error', err.message);
    }
    logger.error('report.store_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return jsonError(500, 'report_failed', 'Could not save your report.');
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  if (!isReportAdmin(user)) {
    return jsonError(403, 'forbidden');
  }
  const limitRaw = Number(request.nextUrl.searchParams.get('limit') ?? '100');
  const limit = Number.isFinite(limitRaw) ? limitRaw : 100;
  const reports = await listReports(limit);
  return NextResponse.json(
    {
      reports: reports.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    },
    { status: 200 }
  );
}
