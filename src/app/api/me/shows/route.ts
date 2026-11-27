// src/app/api/me/shows/route.ts
//
// GET /api/me/shows -> { hosted: PublicSpace[], joined: JoinedShowSummary[] }
// The signed-in user's own shows (every show they host, most recently live
// first, including ended and expired ones) and the shows they took part in.
// Backs the account screen in the native apps; the web account page renders
// the same data server-side.

import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/api';
import { getHostedSpaces, originFromRequest, toPublicSpace } from '@/lib/spaces';
import { getJoinedShows } from '@/lib/metrics';
import { decoratePublicSpaces } from '@/lib/space-extras';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export interface JoinedShowSummary {
  sessionId: string;
  role: string;
  joinedAt: string;
  stageSeconds: number;
  space: {
    id: string;
    title: string;
    status: string;
    isLive: boolean;
    tags: string[];
    host: { did: string; handle: string; displayName: string | null; avatarUrl: string | null };
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const [hostedRows, joinedRows] = await Promise.all([
    getHostedSpaces(user.did),
    getJoinedShows(user.did),
  ]);
  const origin = originFromRequest(request);
  const hosted = await decoratePublicSpaces(
    hostedRows.map((s) => toPublicSpace(s, origin)),
    user.did
  );
  const joined: JoinedShowSummary[] = joinedRows.map((j) => ({
    sessionId: j.sessionId,
    role: j.role,
    joinedAt: j.joinedAt.toISOString(),
    stageSeconds: j.stageSeconds,
    space: {
      id: j.space.id,
      title: j.space.title,
      status: j.space.status,
      isLive: j.space.isLive,
      tags: j.space.tags,
      host: j.space.host,
    },
  }));
  return NextResponse.json({ hosted, joined }, { status: 200 });
}
