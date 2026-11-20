// src/app/api/feedback/route.ts
//
// POST /api/feedback -> store a problem report from the feedback button.
//   Works signed out (login problems are the most common report); when a
//   session exists the DID and handle are attached. The client sends its
//   own captured state in `context`; the server adds the User-Agent.
//   Body: { message, category?, email?, platform?, appVersion?, page?, spaceId?, context? }
//   `email` is required when category is "beta" (Android beta sign-up).
//   Response: { id } or an error envelope.
//
// GET /api/feedback -> newest reports, for the admins listed in
//   FEEDBACK_ADMIN_DIDS, or for a client sending the FEEDBACK_READ_TOKEN
//   secret as `Authorization: Bearer ...` (the feedback-intake bot).
//   Query: limit (default 100, max 500), since (ISO date; only newer reports).
//   Response: { feedback: [...] }

import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import {
  createFeedback,
  FeedbackValidationError,
  isFeedbackAdmin,
  listFeedback,
} from '@/lib/feedback';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface FeedbackBody {
  message?: unknown;
  category?: unknown;
  email?: unknown;
  platform?: unknown;
  appVersion?: unknown;
  page?: unknown;
  spaceId?: unknown;
  context?: unknown;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: FeedbackBody;
  try {
    body = (await request.json()) as FeedbackBody;
  } catch {
    return NextResponse.json(
      { error: 'invalid_json', message: 'Request body must be JSON.' },
      { status: 400 }
    );
  }
  const user = await getCurrentUser().catch(() => null);
  try {
    const row = await createFeedback({
      did: user?.did ?? null,
      handle: user?.handle ?? null,
      message: str(body.message) ?? '',
      category: str(body.category),
      email: str(body.email),
      platform: str(body.platform),
      appVersion: str(body.appVersion),
      page: str(body.page),
      spaceId: str(body.spaceId),
      userAgent: request.headers.get('user-agent'),
      context: body.context,
    });
    logger.info('feedback.received', {
      id: row.id,
      did: row.did,
      platform: row.platform,
      category: row.category,
    });
    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (err) {
    if (err instanceof FeedbackValidationError) {
      return NextResponse.json(
        { error: 'validation_error', message: err.message },
        { status: 400 }
      );
    }
    logger.error('feedback.store_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'feedback_failed', message: 'Could not save your report.' },
      { status: 500 }
    );
  }
}

/** True when the request carries the FEEDBACK_READ_TOKEN secret as a bearer token. */
function hasReadToken(request: NextRequest): boolean {
  const expected = process.env.FEEDBACK_READ_TOKEN;
  if (!expected) return false;
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '');
  if (!match) return false;
  const given = Buffer.from(match[1]);
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!hasReadToken(request)) {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (!isFeedbackAdmin(user)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }
  const limitRaw = Number(request.nextUrl.searchParams.get('limit') ?? '100');
  const limit = Number.isFinite(limitRaw) ? limitRaw : 100;
  const sinceRaw = request.nextUrl.searchParams.get('since');
  const since = sinceRaw ? new Date(sinceRaw) : null;
  if (since && Number.isNaN(since.getTime())) {
    return NextResponse.json(
      { error: 'validation_error', message: 'since must be an ISO date.' },
      { status: 400 }
    );
  }
  const feedback = (await listFeedback(limit)).filter((f) => !since || f.createdAt > since);
  return NextResponse.json(
    {
      feedback: feedback.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() })),
    },
    { status: 200 }
  );
}
