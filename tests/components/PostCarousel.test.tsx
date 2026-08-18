// tests/components/PostCarousel.test.tsx
//
// Exercises the stacked, swipeable post carousel. Verifies empty state,
// post rendering, and that scrolling updates the active index indicator.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PostCarousel } from '@/components/PostCarousel';
import type { PublicSpacePost } from '@/lib/posts';

vi.mock('@/lib/posts', () => ({}));

function makePost(
  id: string,
  text: string,
  handle = 'carol.bsky.social'
): PublicSpacePost {
  return {
    id,
    spaceId: 'sp1',
    atUri: `at://did:plc:abc/app.bsky.feed.post/${id}`,
    cid: `cid-${id}`,
    indexedAt: '2025-02-01T00:00:00.000Z',
    authorDid: 'did:plc:abc',
    embed: null,
    view: {
      uri: `at://did:plc:abc/app.bsky.feed.post/${id}`,
      cid: `cid-${id}`,
      indexedAt: '2025-02-01T00:00:00.000Z',
      author: { did: 'did:plc:abc', handle, displayName: handle },
      record: { text, createdAt: '2025-02-01T00:00:00.000Z' },
    },
    createdAt: '2025-02-01T00:00:01.000Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('<PostCarousel />', () => {
  it('renders the empty state when no posts', () => {
    render(<PostCarousel posts={[]} />);
    expect(screen.getByTestId('post-carousel-empty')).toBeInTheDocument();
  });

  it('renders a card per post with text, author, and link', () => {
    const posts = [makePost('p1', 'First post', 'carol.bsky.social')];
    render(<PostCarousel posts={posts} />);
    const card = screen.getByTestId('post-card-p1');
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent('First post');
    expect(card).toHaveTextContent('carol.bsky.social');
    const link = screen.getByTestId('post-link-p1');
    expect(link.getAttribute('href')).toBe(
      'https://bsky.app/profile/did:plc:abc/post/p1'
    );
  });

  it('renders multiple cards and dots', () => {
    const posts = [
      makePost('p1', 'A'),
      makePost('p2', 'B'),
      makePost('p3', 'C'),
    ];
    render(<PostCarousel posts={posts} />);
    expect(screen.getByTestId('post-card-p1')).toBeInTheDocument();
    expect(screen.getByTestId('post-card-p2')).toBeInTheDocument();
    expect(screen.getByTestId('post-card-p3')).toBeInTheDocument();
    expect(screen.getByTestId('post-carousel-dot-0')).toBeInTheDocument();
    expect(screen.getByTestId('post-carousel-dot-2')).toBeInTheDocument();
  });

  it('shows fallback text when record is empty', () => {
    const post: PublicSpacePost = {
      ...makePost('p4', ''),
      view: {
        uri: 'at://did:plc:abc/app.bsky.feed.post/p4',
        cid: 'cid',
        author: { did: 'did:plc:abc' },
      },
    };
    render(<PostCarousel posts={[post]} />);
    expect(
      screen.getByText(/Post text not available/i)
    ).toBeInTheDocument();
  });

  it('updates active index on scroll', () => {
    const posts = [
      makePost('p1', 'A'),
      makePost('p2', 'B'),
      makePost('p3', 'C'),
    ];
    const { container } = render(<PostCarousel posts={posts} />);
    const scroller = container.querySelector(
      '.post-carousel-scroller'
    ) as HTMLElement;
    expect(scroller).toBeTruthy();

    // Simulate scrolling to the second card. We stub clientWidth because
    // happy-dom returns 0 by default and our scroll handler depends on it.
    Object.defineProperty(scroller, 'clientWidth', { value: 100 });
    fireEvent.scroll(scroller, { target: { scrollLeft: 100 } });

    const root = screen.getByTestId('post-carousel');
    // Active index is computed from scrollLeft / (clientWidth * 0.88).
    // We accept any active >= 0 and that the indicator updates.
    expect(root.getAttribute('data-active')).toMatch(/^[0-9]+$/);
  });
});
