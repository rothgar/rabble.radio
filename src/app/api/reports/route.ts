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
import { getCurrentUser } from '@/lib/session';
import { getSpaceById, getSpaceBySlug } from '@/lib/spaces';
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
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: ReportBody;
  try {
    body = (await request.json()) as ReportBody;
  } catch {
    return NextResponse.json(
      { error: 'invalid_json', message: 'Request body must be JSON.' },
      { status: 400 }
    );
  }

  const spaceId = str(body.spaceId);
  const targetIdentity = str(body.targetIdentity);
  if (!spaceId || !targetIdentity) {
    return NextResponse.json(
      { error: 'validation_error', message: 'spaceId and targetIdentity are required.' },
      { status: 400 }
    );
  }

  const space = (await getSpaceById(spaceId)) ?? (await getSpaceBySlug(spaceId));
  if (!space) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (space.hostId !== user.did) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Only the show host can report a speaker.' },
      { status: 403 }
    );
  }

  const speakers = await listActiveSpeakers(space.id);
  if (!speakers.includes(targetIdentity)) {
    return NextResponse.json(
      { error: 'validation_error', message: 'targetIdentity is not a current speaker in this show.' },
      { status: 400 }
    );
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
      return NextResponse.json(
        { error: 'validation_error', message: err.message },
        { status: 400 }
      );
    }
    logger.error('report.store_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'report_failed', message: 'Could not save your report.' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isReportAdmin(user)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
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
