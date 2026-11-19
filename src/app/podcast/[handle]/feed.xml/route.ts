// src/app/podcast/[handle]/feed.xml/route.ts
//
// GET /podcast/[handle]/feed.xml
//
// RSS 2.0 podcast feed of every recording the host has published. `handle`
// may also be a DID. Enclosures point at /api/recordings/[id]/audio, which
// redirects to a fresh signed object URL on every request.

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getPublishedEpisodesForHost, type PublishedEpisode } from '@/lib/recording';
import { defaultPublicOrigin } from '@/lib/spaces';
import { feedAuthorName, renderFeed, type FeedHost } from '@/lib/podcast-feed';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export type { FeedHost };

/** Render the feed document. Exported so tests can check it without Prisma. */
export function renderPodcastFeed(
  host: FeedHost,
  episodes: PublishedEpisode[],
  origin: string
): string {
  const name = feedAuthorName(host);
  return renderFeed(
    {
      title: `${name} on Rabble Radio`,
      link: `${origin}/hosts`,
      feedUrl: `${origin}/podcast/${encodeURIComponent(host.handle)}/feed.xml`,
      description: `Live shows hosted by ${name} on Rabble Radio.`,
      authorName: name,
      image: host.avatarUrl,
    },
    episodes,
    origin
  );
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ handle: string }> }
): Promise<NextResponse> {
  const { handle } = await context.params;
  const key = decodeURIComponent(handle ?? '').trim();
  if (!key) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const user = key.startsWith('did:')
    ? await prisma.user.findUnique({ where: { did: key } })
    : await prisma.user.findFirst({ where: { handle: key } });
  if (!user) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const episodes = await getPublishedEpisodesForHost(user.did);
  const xml = renderPodcastFeed(
    {
      did: user.did,
      handle: user.handle,
      displayName: user.displayName ?? null,
      avatarUrl: user.avatarUrl ?? null,
    },
    episodes,
    defaultPublicOrigin()
  );
  return new NextResponse(xml, {
    status: 200,
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
