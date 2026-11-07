// src/app/api/me/reminders/route.ts
//
// GET /api/me/reminders        -> { reminders: ReminderSummary[] }
// GET /api/me/reminders?due=1  -> { due: DueReminder[] } — reminders whose
//     show just went on air; each is returned once (clients poll this and
//     surface a notification).

import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { listReminders, takeDueReminders } from '@/lib/reminders';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (request.nextUrl.searchParams.get('due') === '1') {
    return NextResponse.json({ due: await takeDueReminders(user.did) }, { status: 200 });
  }
  return NextResponse.json({ reminders: await listReminders(user.did) }, { status: 200 });
}
