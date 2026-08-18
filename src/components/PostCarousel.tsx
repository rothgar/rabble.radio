'use client';

// src/components/PostCarousel.tsx
//
// Stacked, swipeable carousel for shared Bluesky posts. Each post card is
// rendered behind the previous one with a slight Y offset and scale so the
// stack is visible. The container uses CSS scroll-snap-x so listeners can
// swipe/scroll through posts on touch and desktop.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { PublicSpacePost } from '@/lib/posts';

export interface PostCarouselProps {
  posts: PublicSpacePost[];
  emptyMessage?: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function postHref(uri: string): string {
  // Best-effort conversion of AT-URI to a bsky.app URL for the "open" link.
  // at://did:plc:abc/app.bsky.feed.post/rkey -> https://bsky.app/profile/did:plc:abc/post/rkey
  if (!uri.startsWith('at://')) return uri;
  const stripped = uri.replace(/^at:\/\//, '');
  const [did, , rkey] = stripped.split('/');
  if (!did || !rkey) return uri;
  return `https://bsky.app/profile/${did}/post/${rkey}`;
}

function PostCard({
  post,
  index,
}: {
  post: PublicSpacePost;
  index: number;
}): ReactElement {
  const text = post.view.record?.text ?? '';
  const author = post.view.author?.displayName || post.view.author?.handle || post.authorDid;
  const handle = post.view.author?.handle ?? '';
  const href = postHref(post.atUri);
  // Stack offset: deeper cards shift up and to the right slightly so the
  // stack is visible behind the front card.
  const offset = Math.min(index, 3);
  const scale = 1 - offset * 0.04;
  const translateX = offset * 14;
  const translateY = -offset * 8;
  return (
    <article
      className="post-carousel-card relative shrink-0 basis-[88%] rounded-xl border border-slate-700 bg-slate-900 p-4 text-slate-100 shadow-lg"
      style={{
        transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
        zIndex: 10 - offset,
      }}
      data-testid={`post-card-${post.id}`}
      data-index={index}
    >
      <header className="mb-2 flex items-center justify-between text-xs text-slate-400">
        <span className="font-medium text-slate-200">{author}</span>
        {handle ? (
          <span className="text-slate-500">@{handle}</span>
        ) : null}
      </header>
      {text ? (
        <p className="mb-3 whitespace-pre-wrap text-sm text-slate-100">
          {text}
        </p>
      ) : (
        <p className="mb-3 text-sm italic text-slate-400">
          (Post text not available)
        </p>
      )}
      <footer className="flex items-center justify-between text-xs text-slate-500">
        <span>{formatDate(post.view.indexedAt ?? post.indexedAt)}</span>
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="rounded-md border border-slate-700 px-2 py-0.5 text-sky-300 hover:bg-slate-800"
          data-testid={`post-link-${post.id}`}
        >
          Open on Bluesky
        </a>
      </footer>
    </article>
  );
}

export function PostCarousel({
  posts,
  emptyMessage = 'No posts shared yet.',
}: PostCarouselProps): ReactElement {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
    const el = scrollerRef.current;
    if (el) el.scrollTo({ left: 0, behavior: 'auto' });
  }, [posts.length]);

  const handleScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const cardWidth = el.clientWidth * 0.88;
    const next = Math.round(el.scrollLeft / Math.max(cardWidth, 1));
    setActiveIndex(Math.min(Math.max(next, 0), Math.max(posts.length - 1, 0)));
  }, [posts.length]);

  if (posts.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400"
        data-testid="post-carousel-empty"
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <section
      className="relative"
      data-testid="post-carousel"
      data-count={posts.length}
      data-active={activeIndex}
    >
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="post-carousel-scroller relative flex snap-x snap-mandatory gap-4 overflow-x-auto pb-6 pt-3"
        style={{ scrollPaddingLeft: '6%' }}
        aria-label="Shared Bluesky posts"
      >
        {posts.map((post, i) => (
          <div
            key={post.id}
            className="snap-center"
            style={{ scrollSnapAlign: 'center' }}
          >
            <PostCard post={post} index={i} />
          </div>
        ))}
      </div>
      <div
        className="mt-1 flex items-center justify-center gap-1 text-xs text-slate-500"
        data-testid="post-carousel-dots"
      >
        {posts.map((p, i) => (
          <span
            key={p.id}
            aria-hidden
            data-testid={`post-carousel-dot-${i}`}
            data-active={i === activeIndex}
            className={
              i === activeIndex
                ? 'h-1.5 w-4 rounded-full bg-sky-400'
                : 'h-1.5 w-1.5 rounded-full bg-slate-600'
            }
          />
        ))}
      </div>
    </section>
  );
}

export default PostCarousel;
