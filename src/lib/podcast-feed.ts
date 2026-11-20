// src/lib/podcast-feed.ts
//
// Shared RSS 2.0 rendering for the per-host feed
// (src/app/podcast/[handle]/feed.xml) and the per-show feed
// (src/app/podcast/[handle]/show/[id]/feed.xml). Both feeds list the same
// kind of episode (a published, playable recording); they differ only in
// which recordings are in scope and the channel-level title/link/description.

import type { PublishedEpisode } from '@/lib/recording';

export interface FeedHost {
  did: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderItem(
  { recording, space }: PublishedEpisode,
  origin: string,
  authorName: string
): string {
  const started = recording.startedAt;
  const title = `${space.title} (${started.toISOString().slice(0, 10)})`;
  const audioUrl = `${origin}/api/recordings/${encodeURIComponent(recording.id)}/audio`;
  const showUrl = `${origin}/show/${encodeURIComponent(space.id)}`;
  const description = space.description?.trim() || `A live show hosted by ${authorName} on Rabble Radio.`;
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
}

export interface FeedChannel {
  title: string;
  /** Channel-level `<link>`, a page about the feed (not a single episode). */
  link: string;
  /** This feed document's own URL, for the self-referencing atom:link. */
  feedUrl: string;
  description: string;
  authorName: string;
  image: string | null;
}

/** Render a full RSS 2.0 podcast feed document for one channel and its episodes. */
export function renderFeed(channel: FeedChannel, episodes: PublishedEpisode[], origin: string): string {
  const items = episodes.map((episode) => renderItem(episode, origin, channel.authorName)).join('\n');
  const image = channel.image ? `    <itunes:image href="${escapeXml(channel.image)}" />\n` : '';

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(channel.title)}</title>`,
    `    <link>${escapeXml(channel.link)}</link>`,
    `    <atom:link href="${escapeXml(channel.feedUrl)}" rel="self" type="application/rss+xml" />`,
    `    <description>${escapeXml(channel.description)}</description>`,
    '    <language>en</language>',
    `    <itunes:author>${escapeXml(channel.authorName)}</itunes:author>`,
    image.trimEnd(),
    items,
    '  </channel>',
    '</rss>',
    '',
  ]
    .filter((line) => line.length > 0)
    .join('\n');
}

/** The display name used in feed text: display name, falling back to the handle. */
export function feedAuthorName(host: FeedHost): string {
  return host.displayName?.trim() || `@${host.handle}`;
}
