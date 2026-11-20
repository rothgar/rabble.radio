// src/app/api/crashes/route.ts
//
// POST /api/crashes -> log a native crash report from the Android/iOS apps
//   through Workers Logs, the same pipeline web errors already reach via
//   `src/lib/logger.ts` and `scripts/log-triage.mjs`. No storage, no D1
//   table: the log line is the record. Works signed out (a crash can
//   happen before login); when a session exists the DID and handle are
//   attached, same as `src/app/api/feedback/route.ts` does with
//   `getCurrentUser()`.
//   Body: { platform: 'android' | 'ios', message, exceptionClass?, stack?,
//     appVersion?, osVersion?, device?, screen?, fatal? }. Only platform
//   and message are required; everything else is an optional string.
//   Response: 204 on success, 400 on a bad body.

import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MESSAGE_MAX = 2000;
const STACK_MAX = 8000;
const FIELD_MAX = 500;

interface CrashBody {
  platform?: unknown;
  message?: unknown;
  exceptionClass?: unknown;
  stack?: unknown;
  appVersion?: unknown;
  osVersion?: unknown;
  device?: unknown;
  screen?: unknown;
  fatal?: unknown;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const clamped = (v: unknown): string | undefined => str(v)?.slice(0, FIELD_MAX);

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: 'validation_error', message }, { status: 400 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: CrashBody;
  try {
    body = (await request.json()) as CrashBody;
  } catch {
    return badRequest('Request body must be JSON.');
  }

  const platform = str(body.platform);
  if (platform !== 'android' && platform !== 'ios') {
    return badRequest('platform must be "android" or "ios".');
  }

  const message = str(body.message);
  if (!message) {
    return badRequest('message is required.');
  }

  const exceptionClass = clamped(body.exceptionClass);
  const stack = str(body.stack)?.slice(0, STACK_MAX);
  const appVersion = clamped(body.appVersion);
  const osVersion = clamped(body.osVersion);
  const device = clamped(body.device);
  const screen = clamped(body.screen);
  const fatal = body.fatal === true;

  const user = await getCurrentUser().catch(() => null);

  const errMessage = `${exceptionClass ?? 'crash'}: ${message}`.slice(0, MESSAGE_MAX);
  logger.error('mobile.crash', {
    err: { message: errMessage },
    platform,
    message: message.slice(0, MESSAGE_MAX),
    exceptionClass,
    stack,
    appVersion,
    osVersion,
    device,
    screen,
    fatal,
    did: user?.did ?? undefined,
    handle: user?.handle ?? undefined,
  });

  return new NextResponse(null, { status: 204 });
}
