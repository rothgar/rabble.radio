// tests/app/podcast-show-feed.test.ts
//
// /podcast/[handle]/show/[id]/feed.xml renders one show's own published
// recordings as an RSS 2.0 podcast feed, separate from the host's
// all-shows feed at /podcast/[handle]/feed.xml.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({
  getSpaceById: vi.fn(),
  getPublishedEpisodesForSpace: vi.fn(),
}));

vi.mock('@/lib/spaces', () => ({
  getSpaceById: m.getSpaceById,
  defaultPublicOrigin: () => 'https://rabble.rodeo',
}));
vi.mock('@/lib/recording', () => ({
  getPublishedEpisodesForSpace: m.getPublishedEpisodesForSpace,
}));

import { GET, renderShowPodcastFeed } from '@/app/podcast/[handle]/show/[id]/feed.xml/route';

const host = {
  did: 'did:plc:host',
  handle: 'alice.bsky.social',
  displayName: 'Alice',
  avatarUrl: 'https://cdn.example/a.png',
};

const show = { id: 'sp1', title: 'Friday jams', description: null };

function episode(overrides: Record<string, unknown> = {}) {
  return {
    recording: {
      id: 'rec1',
      spaceId: 'sp1',
      egressId: 'eg1',
      status: 'available' as const,
      startedAt: new Date('2026-11-01T10:00:00Z'),
      endedAt: new Date('2026-11-01T11:00:00Z'),
      expiresAt: new Date('2026-12-01T10:00:00Z'),
      s3Key: 'k',
      s3Bucket: 'b',
      contentType: 'video/mp4',
      sizeBytes: 4096,
      downloadUrl: null,
      hostDid: 'did:plc:host',
      published: true,
      publishedAt: new Date('2026-11-02T00:00:00Z'),
      createdAt: new Date('2026-11-01T10:00:00Z'),
      updatedAt: new Date('2026-11-01T10:00:00Z'),
      ...overrides,
    },
    space: { id: 'sp1', title: 'Friday jams', description: null, tags: ['Music'] },
  };
}

function spaceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sp1',
    title: 'Friday jams',
    description: null,
    podcastFeedEnabled: true,
    host,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('renderShowPodcastFeed', () => {
  it('scopes the channel to one show, separate from the host feed', () => {
    const xml = renderShowPodcastFeed(host, show, [episode()], 'https://rabble.rodeo');
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<title>Friday jams — Alice on Rabble Radio</title>');
    expect(xml).toContain('<link>https://rabble.rodeo/show/sp1</link>');
    expect(xml).toContain(
      'href="https://rabble.rodeo/podcast/alice.bsky.social/show/sp1/feed.xml" rel="self"'
    );
    expect(xml).toContain(
      '<enclosure url="https://rabble.rodeo/api/recordings/rec1/audio" length="4096" type="video/mp4" />'
    );
  });
});

describe('GET /podcast/[handle]/show/[id]/feed.xml', () => {
  it('serves RSS for an enabled show feed', async () => {
    m.getSpaceById.mockResolvedValueOnce(spaceRow());
    m.getPublishedEpisodesForSpace.mockResolvedValueOnce([episode()]);
    const res = await GET(
      new NextRequest('http://localhost/podcast/alice.bsky.social/show/sp1/feed.xml'),
      { params: Promise.resolve({ handle: 'alice.bsky.social', id: 'sp1' }) }
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/rss+xml');
    expect(await res.text()).toContain('<item>');
    expect(m.getPublishedEpisodesForSpace).toHaveBeenCalledWith('sp1');
  });

  it('404s when the show has not turned its feed on', async () => {
    m.getSpaceById.mockResolvedValueOnce(spaceRow({ podcastFeedEnabled: false }));
    const res = await GET(
      new NextRequest('http://localhost/podcast/alice.bsky.social/show/sp1/feed.xml'),
      { params: Promise.resolve({ handle: 'alice.bsky.social', id: 'sp1' }) }
    );
    expect(res.status).toBe(404);
    expect(m.getPublishedEpisodesForSpace).not.toHaveBeenCalled();
  });

  it('404s for an unknown show', async () => {
    m.getSpaceById.mockResolvedValueOnce(null);
    const res = await GET(
      new NextRequest('http://localhost/podcast/alice.bsky.social/show/nope/feed.xml'),
      { params: Promise.resolve({ handle: 'alice.bsky.social', id: 'nope' }) }
    );
    expect(res.status).toBe(404);
  });
});
