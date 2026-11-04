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

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface FeedHost {
  did: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
}

/** Render the feed document. Exported so tests can check it without Prisma. */
export function renderPodcastFeed(
  host: FeedHost,
  episodes: PublishedEpisode[],
  origin: string
): string {
  const name = host.displayName?.trim() || `@${host.handle}`;
  const feedUrl = `${origin}/podcast/${encodeURIComponent(host.handle)}/feed.xml`;
  const items = episodes
    .map(({ recording, space }) => {
      const started = recording.startedAt;
      const title = `${space.title} (${started.toISOString().slice(0, 10)})`;
      const audioUrl = `${origin}/api/recordings/${encodeURIComponent(recording.id)}/audio`;
      const showUrl = `${origin}/show/${encodeURIComponent(space.id)}`;
      const description = space.description?.trim() || `A live show hosted by ${name} on Rabble Radio.`;
      const categories = space.tags.map((t) => `      <category>${escapeXml(t)}</category>`).join('\n');
      return [
        '    <item>',
        `      <title>${escapeXml(title)}</title>`,
        `      <link>${escapeXml(showUrl)}</link>`,
        `      <guid isPermaLink="false">${escapeXml(recording.id)}</guid>`,
        `      <pubDate>${(recording.publishedAt ?? started).toUTCString()}</pubDate>`,
        `      <description>${escapeXml(description)}</description>`,
        `      <enclosure url="${escapeXml(audioUrl)}" length="${recording.sizeBytes ?? 0}" type="${escapeXml(recording.contentType)}" />`,
        categories,
        '    </item>',
      ]
        .filter((line) => line.length > 0)
        .join('\n');
    })
    .join('\n');

  const image = host.avatarUrl
    ? `    <itunes:image href="${escapeXml(host.avatarUrl)}" />\n`
    : '';

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(`${name} on Rabble Radio`)}</title>`,
    `    <link>${escapeXml(`${origin}/hosts`)}</link>`,
    `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
    `    <description>${escapeXml(`Live shows hosted by ${name} on Rabble Radio.`)}</description>`,
    '    <language>en</language>',
    `    <itunes:author>${escapeXml(name)}</itunes:author>`,
    image.trimEnd(),
    items,
    '  </channel>',
    '</rss>',
    '',
  ]
    .filter((line) => line.length > 0)
    .join('\n');
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
