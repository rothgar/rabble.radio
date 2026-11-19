// src/app/podcast/[handle]/show/[id]/feed.xml/route.ts
//
// GET /podcast/[handle]/show/[id]/feed.xml
//
// RSS 2.0 podcast feed scoped to one show's own published recordings,
// separate from the host's all-shows feed at /podcast/[handle]/feed.xml.
// A host turns this on from their dashboard (PATCH /api/spaces/[id] with
// podcastFeedEnabled). `handle` is cosmetic (kept for a readable URL); the
// lookup and scoping are by the show's id, which is stable across a handle
// or title change. 404s when the show doesn't exist or the feed is off.

import { NextResponse, type NextRequest } from 'next/server';
import { getSpaceById, defaultPublicOrigin } from '@/lib/spaces';
import { getPublishedEpisodesForSpace, type PublishedEpisode } from '@/lib/recording';
import { feedAuthorName, renderFeed, type FeedHost } from '@/lib/podcast-feed';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export interface FeedShow {
  id: string;
  title: string;
  description: string | null;
}

/** Render the feed document. Exported so tests can check it without Prisma. */
export function renderShowPodcastFeed(
  host: FeedHost,
  show: FeedShow,
  episodes: PublishedEpisode[],
  origin: string
): string {
  const name = feedAuthorName(host);
  return renderFeed(
    {
      title: `${show.title} — ${name} on Rabble Radio`,
      link: `${origin}/show/${encodeURIComponent(show.id)}`,
      feedUrl: `${origin}/podcast/${encodeURIComponent(host.handle)}/show/${encodeURIComponent(show.id)}/feed.xml`,
      description: show.description?.trim() || `${show.title}, hosted by ${name} on Rabble Radio.`,
      authorName: name,
      image: host.avatarUrl,
    },
    episodes,
    origin
  );
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ handle: string; id: string }> }
): Promise<NextResponse> {
  const { id } = await context.params;
  const key = decodeURIComponent(id ?? '').trim();
  if (!key) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const space = await getSpaceById(key);
  if (!space || !space.podcastFeedEnabled) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const episodes = await getPublishedEpisodesForSpace(space.id);
  const xml = renderShowPodcastFeed(
    {
      did: space.host.did,
      handle: space.host.handle,
      displayName: space.host.displayName ?? null,
      avatarUrl: space.host.avatarUrl ?? null,
    },
    { id: space.id, title: space.title, description: space.description },
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
