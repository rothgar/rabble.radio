'use client';

import type { ReactElement } from 'react';
import { DeleteSpaceButton } from '@/components/DeleteSpaceButton';
import { ShowDetailsForm, type ShowDetails } from '@/components/ShowDetailsForm';
import { AddPostForm } from '@/components/AddPostForm';
import { PostCarousel } from '@/components/PostCarousel';
import { RecordingDownload } from '@/components/RecordingDownload';
import type { PublicSpacePost } from '@/lib/posts';

export interface PublicRecording {
  id: string;
  spaceId: string;
  status: 'starting' | 'available' | 'failed' | 'expired';
  startedAt: string;
  endedAt: string | null;
  expiresAt: string;
  sizeBytes: number | null;
  downloadUrl: string | null;
  contentType: string;
  published?: boolean;
  publishedAt?: string | null;
}

export interface RoomSidebarProps {
  spaceId: string;
  isHost: boolean;
  isLive: boolean;
  title: string;
  description?: string | null;
  tags?: string[];
  onSpaceUpdated?: (details: ShowDetails) => void;
  posts: PublicSpacePost[];
  postsError: string | null;
  onPostAdded: () => void;
  recording: PublicRecording | null;
}

export function RoomSidebar({
  spaceId,
  isHost,
  isLive,
  title,
  description,
  tags,
  onSpaceUpdated,
  posts,
  postsError,
  onPostAdded,
  recording,
}: RoomSidebarProps): ReactElement {
  return (
    <div className="flex flex-col gap-4" data-testid="room-sidebar">
      {isHost ? (
        <ShowDetailsForm
          key={`${title}|${description ?? ''}|${(tags ?? []).join(',')}`}
          spaceId={spaceId}
          title={title}
          description={description}
          tags={tags}
          onSaved={onSpaceUpdated}
        />
      ) : null}

      {isHost && !isLive ? (
        <DeleteSpaceButton spaceId={spaceId} />
      ) : null}

      {isHost && recording ? (
        <RecordingDownload spaceId={spaceId} initial={recording} compact />
      ) : null}

      <section
        className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] p-4"
        data-testid="room-sidebar-posts"
      >
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">
            Pinned from Bluesky
          </h3>
        </header>
        {isHost ? (
          <AddPostForm spaceId={spaceId} onAdded={onPostAdded} />
        ) : null}
        {postsError ? (
          <p
            role="alert"
            className="rounded-md border border-[var(--color-error)] bg-[var(--color-error-muted)] px-2 py-1 text-xs text-[var(--color-error-text)]"
            data-testid="room-sidebar-posts-error"
          >
            {postsError}
          </p>
        ) : null}
        <PostCarousel posts={posts} />
      </section>
    </div>
  );
}

export default RoomSidebar;
