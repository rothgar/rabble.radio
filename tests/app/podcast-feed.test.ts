// tests/app/podcast-feed.test.ts
//
// /podcast/[handle]/feed.xml renders the host's published recordings as an
// RSS 2.0 podcast feed.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  getPublishedEpisodesForHost: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: { user: { findUnique: m.userFindUnique, findFirst: m.userFindFirst } },
}));
vi.mock('@/lib/recording', () => ({
  getPublishedEpisodesForHost: m.getPublishedEpisodesForHost,
}));
vi.mock('@/lib/spaces', () => ({
  defaultPublicOrigin: () => 'https://rabble.rodeo',
}));

import { GET, renderPodcastFeed } from '@/app/podcast/[handle]/feed.xml/route';

const host = {
  did: 'did:plc:host',
  handle: 'alice.bsky.social',
  displayName: 'Alice <Live>',
  avatarUrl: 'https://cdn.example/a.png',
};

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
    space: { id: 'sp1', title: 'Friday & jams', description: null, tags: ['Music'] },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('renderPodcastFeed', () => {
  it('produces an RSS document with escaped text and a stable enclosure URL', () => {
    const xml = renderPodcastFeed(host, [episode()], 'https://rabble.rodeo');
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<title>Alice &lt;Live&gt; on Rabble Radio</title>');
    expect(xml).toContain('<title>Friday &amp; jams (2026-11-01)</title>');
    expect(xml).toContain(
      '<enclosure url="https://rabble.rodeo/api/recordings/rec1/audio" length="4096" type="video/mp4" />'
    );
    expect(xml).toContain('<guid isPermaLink="false">rec1</guid>');
    expect(xml).toContain('<category>Music</category>');
    expect(xml).toContain('<itunes:image href="https://cdn.example/a.png" />');
    expect(xml).toContain('href="https://rabble.rodeo/podcast/alice.bsky.social/feed.xml" rel="self"');
  });

  it('renders an empty channel when nothing is published', () => {
    const xml = renderPodcastFeed({ ...host, avatarUrl: null }, [], 'https://rabble.rodeo');
    expect(xml).not.toContain('<item>');
    expect(xml).not.toContain('itunes:image');
  });
});

describe('GET /podcast/[handle]/feed.xml', () => {
  it('resolves a handle and serves RSS', async () => {
    m.userFindFirst.mockResolvedValueOnce(host);
    m.getPublishedEpisodesForHost.mockResolvedValueOnce([episode()]);
    const res = await GET(new NextRequest('http://localhost/podcast/alice.bsky.social/feed.xml'), {
      params: Promise.resolve({ handle: 'alice.bsky.social' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/rss+xml');
    expect(await res.text()).toContain('<item>');
    expect(m.userFindFirst).toHaveBeenCalledWith({ where: { handle: 'alice.bsky.social' } });
  });

  it('accepts a DID instead of a handle', async () => {
    m.userFindUnique.mockResolvedValueOnce(host);
    m.getPublishedEpisodesForHost.mockResolvedValueOnce([]);
    const res = await GET(new NextRequest('http://localhost/podcast/did:plc:host/feed.xml'), {
      params: Promise.resolve({ handle: 'did:plc:host' }),
    });
    expect(res.status).toBe(200);
    expect(m.userFindUnique).toHaveBeenCalledWith({ where: { did: 'did:plc:host' } });
  });

  it('404s for an unknown host', async () => {
    m.userFindFirst.mockResolvedValueOnce(null);
    const res = await GET(new NextRequest('http://localhost/podcast/nobody/feed.xml'), {
      params: Promise.resolve({ handle: 'nobody' }),
    });
    expect(res.status).toBe(404);
  });
});
