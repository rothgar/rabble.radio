'use client';

import type { ReactElement } from 'react';
import { DeleteSpaceButton } from '@/components/DeleteSpaceButton';
import { ShowDetailsForm, type ShowDetails } from '@/components/ShowDetailsForm';
import { RecordingDownload } from '@/components/RecordingDownload';

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
  recording,
}: RoomSidebarProps): ReactElement {
  return (
    <div className="flex flex-col gap-4" data-testid="room-sidebar">
      {isHost && !isLive ? (
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
    </div>
  );
}

export default RoomSidebar;
