'use client';

import { useState } from 'react';
import type { ReactElement, RefObject } from 'react';

export interface AudienceMember {
  identity: string;
  name: string;
  handle?: string;
  avatarUrl?: string | null;
}

export interface AudienceBubblesProps {
  audience: AudienceMember[];
  localIdentity: string;
  localName: string;
  localHandle?: string;
  localAvatarUrl?: string | null;
  localAvatarRef?: RefObject<HTMLDivElement | null>;
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
}: {
  name: string;
  handle?: string;
  avatarUrl?: string | null;
  identity: string;
  testId: string;
  avatarRef?: RefObject<HTMLDivElement | null>;
  highlight?: boolean;
  label?: string;
}): ReactElement {
  const [broken, setBroken] = useState(false);
  const inner = (
    <div
      ref={avatarRef}
      className={
        'relative flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-full ' +
        (highlight
          ? 'bg-[var(--color-accent-700)] ring-2 ring-[var(--color-accent)]'
          : 'bg-[var(--color-accent-800)] ring-1 ring-[var(--color-neutral-800)]')
      }
      data-testid={`${testId}-avatar-${identity}`}
    >
      {avatarUrl && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="text-xs font-medium text-[var(--color-accent-100)]">
          {label ?? initialsFor(name)}
        </span>
      )}
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
      <span className="max-w-[60px] truncate text-[10px] text-[var(--color-neutral-400)]">
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
}: AudienceBubblesProps): ReactElement {
  return (
    <div
      className="flex flex-wrap items-end gap-3"
      data-testid="audience-bubbles"
      data-count={audience.length + 1}
    >
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
          testId="audience-bubble"
        />
      ))}
    </div>
  );
}

export default AudienceBubbles;
