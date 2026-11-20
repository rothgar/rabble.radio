// src/app/api/me/reminders/route.ts
//
// GET /api/me/reminders        -> { reminders: ReminderSummary[] }
// GET /api/me/reminders?due=1  -> { due: DueReminder[] } — shows that just
//     went on air for a reminder the viewer set (one show) or a host they
//     follow (any show); each spaceId is returned once per poll.

import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { listReminders, takeDueReminders, type DueReminder } from '@/lib/reminders';
import { takeDueHostFollows } from '@/lib/host-follows';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (request.nextUrl.searchParams.get('due') === '1') {
    const [showDue, hostDue] = await Promise.all([
      takeDueReminders(user.did),
      takeDueHostFollows(user.did),
    ]);
    const seen = new Set<string>();
    const due: DueReminder[] = [...showDue, ...hostDue].filter((item) => {
      if (seen.has(item.spaceId)) return false;
      seen.add(item.spaceId);
      return true;
    });
    return NextResponse.json({ due }, { status: 200 });
  }
  return NextResponse.json({ reminders: await listReminders(user.did) }, { status: 200 });
}
