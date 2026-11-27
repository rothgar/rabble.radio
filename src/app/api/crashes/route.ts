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
//   Unauthenticated and otherwise unthrottled, so anyone can put arbitrary
//   text into the error logs `scripts/log-triage.mjs` turns into issues
//   (issue #184). The Android/iOS builds embed `CRASH_REPORT_SECRET` and
//   send it as X-Rabble-App-Secret; while the Worker secret of the same
//   name is unset this check is a no-op (dev, and until the owner sets it
//   in production). Extractable from the APK/IPA like any client secret,
//   so this only stops casual abuse, not a targeted attacker — a
//   Cloudflare rate-limiting rule on the path is the other half and is
//   dashboard-only (no code here).
//   Response: 204 on success, 400 on a bad body, 401 missing/wrong secret.

import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const APP_SECRET_HEADER = 'x-rabble-app-secret';

/** True unless CRASH_REPORT_SECRET is configured and the header doesn't match it. */
function hasAppSecret(request: NextRequest): boolean {
  const expected = process.env.CRASH_REPORT_SECRET;
  if (!expected) return true;
  const given = Buffer.from(request.headers.get(APP_SECRET_HEADER) ?? '');
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

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
  if (!hasAppSecret(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

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
