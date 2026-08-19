'use client';

import type { ReactElement } from 'react';
import { LiveBannerButton } from '@/components/LiveBannerButton';
import { DeleteSpaceButton } from '@/components/DeleteSpaceButton';
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
}

export interface RoomSidebarProps {
  spaceId: string;
  isHost: boolean;
  isLive: boolean;
  onLiveChange: (next: boolean) => void;
  posts: PublicSpacePost[];
  postsError: string | null;
  onPostAdded: () => void;
  recording: PublicRecording | null;
}

export function RoomSidebar({
  spaceId,
  isHost,
  isLive,
  onLiveChange,
  posts,
  postsError,
  onPostAdded,
  recording,
}: RoomSidebarProps): ReactElement {
  return (
    <div className="flex flex-col gap-4" data-testid="room-sidebar">
      {isHost ? (
        <LiveBannerButton
          spaceId={spaceId}
          isLive={isLive}
          onChange={(next) => onLiveChange(next.isLive)}
        />
      ) : null}

      {isHost ? (
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
            className="rounded-md border border-red-700 bg-red-900/30 px-2 py-1 text-xs text-red-200"
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
