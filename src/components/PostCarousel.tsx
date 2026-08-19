'use client';

// src/components/PostCarousel.tsx
//
// Vertical list of shared Bluesky posts for the redesigned sidebar. Each
// row shows a 30px avatar, author/handle/time, and the post text below.

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
  if (!uri.startsWith('at://')) return uri;
  const stripped = uri.replace(/^at:\/\//, '');
  const [did, , rkey] = stripped.split('/');
  if (!did || !rkey) return uri;
  return `https://bsky.app/profile/${did}/post/${rkey}`;
}

function initialsFor(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '??';
  return trimmed.slice(0, 2).toUpperCase();
}

function PostRow({
  post,
}: {
  post: PublicSpacePost;
}): ReactElement {
  const text = post.view.record?.text ?? '';
  const author =
    post.view.author?.displayName ||
    post.view.author?.handle ||
    post.authorDid;
  const handle = post.view.author?.handle ?? '';
  const href = postHref(post.atUri);
  const indexedAt = post.view.indexedAt ?? post.indexedAt;

  return (
    <li
      className="flex flex-col gap-2 border-b border-[var(--color-divider)] py-3 last:border-b-0"
      data-testid={`post-card-${post.id}`}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-accent-700)] text-[10px] font-semibold text-[var(--color-accent-100)]"
          aria-hidden
          data-testid={`post-avatar-${post.id}`}
        >
          {initialsFor(author)}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
            <span className="truncate text-sm font-medium text-[var(--color-text)]">
              {author}
            </span>
            {handle ? (
              <span className="truncate text-[11px] text-[var(--color-accent-300)]">
                @{handle}
              </span>
            ) : null}
            <span aria-hidden className="text-[var(--color-neutral-600)]">
              ·
            </span>
            <span
              className="text-[11px] text-[var(--color-neutral-500)]"
              data-testid={`post-time-${post.id}`}
            >
              {formatDate(indexedAt)}
            </span>
          </div>
          {text ? (
            <p
              className="mt-1 whitespace-pre-wrap text-sm text-[var(--color-text)]"
              data-testid={`post-text-${post.id}`}
            >
              {text}
            </p>
          ) : (
            <p className="mt-1 text-xs italic text-[var(--color-neutral-500)]">
              (Post text not available)
            </p>
          )}
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1 self-start text-[11px] text-[var(--color-accent-300)] hover:underline"
            data-testid={`post-link-${post.id}`}
          >
            Open on Bluesky
          </a>
        </div>
      </div>
    </li>
  );
}

export function PostCarousel({
  posts,
  emptyMessage = 'No posts shared yet.',
}: PostCarouselProps): ReactElement {
  if (posts.length === 0) {
    return (
      <div
        className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-divider)] bg-[var(--color-surface)]/40 p-3 text-xs text-[var(--color-neutral-500)]"
        data-testid="post-carousel-empty"
      >
        {emptyMessage}
      </div>
    );
  }
  return (
    <ul
      className="flex flex-col"
      data-testid="post-carousel"
      data-count={posts.length}
      aria-label="Shared Bluesky posts"
    >
      {posts.map((post) => (
        <PostRow key={post.id} post={post} />
      ))}
    </ul>
  );
}

export default PostCarousel;
