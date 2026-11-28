// src/app/api/me/reminders/route.ts
//
// GET /api/me/reminders        -> { reminders: ReminderSummary[] }
// GET /api/me/reminders?due=1  -> { due: DueReminder[] } — shows that just
//     went on air for a reminder the viewer set (one show) or a host they
//     follow (any show); each spaceId is returned once per poll.

import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/api';
import { listReminders, takeDueReminders, type DueReminder } from '@/lib/reminders';
import { takeDueHostFollows } from '@/lib/host-follows';
import { takeDueShowFollows } from '@/lib/show-follows';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// This is the once-a-minute poll every web, Android and iOS client makes
// (issue #214), so a D1 stall is most likely to be caught here first. The
// fan-out's own root cause (a Prisma client shared across requests, src/lib/db.ts)
// is fixed; this bound is a second layer so a future hang of any shape
// answers a handled error instead of leaving the request to the Workers
// runtime's hang-cancellation.
const DUE_POLL_TIMEOUT_MS = 10_000;
const TIMED_OUT = Symbol('due-poll-timeout');

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  if (request.nextUrl.searchParams.get('due') === '1') {
    const fanOut = Promise.all([
      takeDueReminders(user.did),
      takeDueHostFollows(user.did),
      takeDueShowFollows(user.did),
    ]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), DUE_POLL_TIMEOUT_MS);
    });
    let result: Awaited<typeof fanOut> | typeof TIMED_OUT;
    try {
      result = await Promise.race([fanOut, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (result === TIMED_OUT) {
      // fanOut is still pending and the request is already answered: if it later
      // rejects with nothing awaiting it, that's an unhandled rejection in this
      // isolate (and a spurious uncaught-exception `logs` issue) on top of the
      // timeout already handled here.
      fanOut.catch((err: unknown) => {
        // errorName/errorCode only, matching src/lib/db.ts's withQueryTelemetry:
        // a Prisma validation error's own .message embeds the full call
        // arguments, which can carry another caller's DID or filter value
        // from the same batched query.
        logger.warn('reminders.poll.late_rejection', {
          did: user.did,
          errorName: err instanceof Error ? err.name : typeof err,
          errorCode: (err as { code?: unknown })?.code,
        });
      });
      logger.error('reminders.poll.timeout', { did: user.did, timeoutMs: DUE_POLL_TIMEOUT_MS });
      return NextResponse.json({ error: 'due reminders poll timed out' }, { status: 503 });
    }
    const [showDue, hostDue, showFollowDue] = result;
    const seen = new Set<string>();
    const due: DueReminder[] = [...showDue, ...hostDue, ...showFollowDue].filter((item) => {
      if (seen.has(item.spaceId)) return false;
      seen.add(item.spaceId);
      return true;
    });
    return NextResponse.json({ due }, { status: 200 });
  }
  return NextResponse.json({ reminders: await listReminders(user.did) }, { status: 200 });
}
