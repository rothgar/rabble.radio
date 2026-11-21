'use client';

import { useState } from 'react';
import type { ReactElement, RefObject } from 'react';
import { MusicNotes } from '@phosphor-icons/react';
import { ShareEntry } from '@/components/ShareEntry';

export interface AudienceMember {
  identity: string;
  name: string;
  handle?: string;
  avatarUrl?: string | null;
  /** Listener has their hand up (LiveKit participant attribute `hand`). */
  handRaised?: boolean;
}

export interface AudienceBubblesProps {
  audience: AudienceMember[];
  localIdentity: string;
  localName: string;
  localHandle?: string;
  localAvatarUrl?: string | null;
  localAvatarRef?: RefObject<HTMLDivElement | null>;
  shareableUrl: string;
  title: string;
  /** Music removed from the stage while live (issue #111). */
  musicGuest?: boolean;
}

function initialsFor(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '??';
  return trimmed.slice(0, 2).toUpperCase();
}

function Bubble({
  name,
  handle,
  avatarUrl,
  identity,
  testId,
  avatarRef,
  highlight,
  label,
  icon,
  handRaised,
}: {
  name: string;
  handle?: string;
  avatarUrl?: string | null;
  identity: string;
  testId: string;
  avatarRef?: RefObject<HTMLDivElement | null>;
  highlight?: boolean;
  label?: string;
  icon?: ReactElement;
  handRaised?: boolean;
}): ReactElement {
  const [broken, setBroken] = useState(false);
  const inner = (
    <div className="relative">
    <div
      ref={avatarRef}
      className={
        'relative flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-full ' +
        (highlight
          ? 'bg-[var(--color-ink)] ring-2 ring-[var(--color-accent)]'
          : 'bg-[var(--color-ink)] ring-1 ring-[var(--color-border)]')
      }
      data-testid={`${testId}-avatar-${identity}`}
      data-local-avatar={highlight ? 'true' : undefined}
    >
      {icon ?? (avatarUrl && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="text-xs font-medium text-[var(--color-text-on-ink)]">
          {label ?? initialsFor(name)}
        </span>
      ))}
    </div>
    {handRaised ? (
      <span
        className="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-highlight)] text-[11px] leading-none"
        aria-label="Hand raised"
        data-testid={`${testId}-hand-${identity}`}
      >
        ✋
      </span>
    ) : null}
    </div>
  );
  return (
    <div
      className="flex flex-col items-center gap-1 text-center"
      data-testid={`${testId}-${identity}`}
    >
      {handle ? (
        <a
          href={`https://bsky.app/profile/${encodeURIComponent(handle)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${name} on Bluesky`}
        >
          {inner}
        </a>
      ) : (
        inner
      )}
      <span className="max-w-[60px] truncate text-[10px] text-[var(--color-text-tertiary)]">
        {handle ? `@${handle}` : name}
      </span>
    </div>
  );
}

export function AudienceBubbles({
  audience,
  localIdentity,
  localName,
  localHandle,
  localAvatarUrl,
  localAvatarRef,
  shareableUrl,
  title,
  musicGuest = false,
}: AudienceBubblesProps): ReactElement {
  return (
    <div
      className="flex flex-wrap items-end gap-3"
      data-testid="audience-bubbles"
      data-count={audience.length + 1}
    >
      <ShareEntry variant="bubble" shareableUrl={shareableUrl} title={title} />
      <Bubble
        identity={localIdentity}
        name={localName}
        handle={localHandle}
        avatarUrl={localAvatarUrl ?? null}
        testId="audience-bubble"
        avatarRef={localAvatarRef}
        highlight
        label="YOU"
      />
      {audience.map((member) => (
        <Bubble
          key={member.identity}
          identity={member.identity}
          name={member.name}
          handle={member.handle}
          avatarUrl={member.avatarUrl ?? null}
          handRaised={member.handRaised}
          testId="audience-bubble"
        />
      ))}
      {musicGuest ? (
        <Bubble
          identity="music"
          name="Music"
          testId="audience-bubble"
          icon={<MusicNotes size={20} weight="fill" className="text-[var(--color-text-on-ink)]" />}
        />
      ) : null}
    </div>
  );
}

export default AudienceBubbles;
