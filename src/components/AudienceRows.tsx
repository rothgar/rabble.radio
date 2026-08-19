'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';
import { Plus } from '@phosphor-icons/react';
import type { AudienceMember } from '@/components/AudienceBubbles';

export interface AudienceRowsProps {
  audience: AudienceMember[];
  invitedSet: Set<string>;
  onInvite: (identity: string) => void;
}

function initialsFor(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '??';
  return trimmed.slice(0, 2).toUpperCase();
}

function Row({
  member,
  invited,
  onInvite,
}: {
  member: AudienceMember;
  invited: boolean;
  onInvite: () => void;
}): ReactElement {
  const [broken, setBroken] = useState(false);
  return (
    <div
      className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] p-3"
      data-testid={`audience-row-${member.identity}`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-accent-800)] ring-1 ring-[var(--color-neutral-800)]">
        {member.avatarUrl && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={member.avatarUrl}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setBroken(true)}
          />
        ) : (
          <span className="text-[11px] font-medium text-[var(--color-accent-100)]">
            {initialsFor(member.name)}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-[var(--color-text)]">
          {member.name}
        </span>
        {member.handle ? (
          <span className="truncate text-xs text-[var(--color-accent-300)]">
            @{member.handle}
          </span>
        ) : null}
      </div>
      {invited ? (
        <span
          className="inline-flex items-center rounded-full bg-[var(--color-accent-700)] px-3 py-1 text-xs font-medium text-[var(--color-accent-100)]"
          data-testid={`audience-invited-${member.identity}`}
        >
          Invited
        </span>
      ) : (
        <button
          type="button"
          onClick={onInvite}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-[var(--color-accent-900)] transition-colors hover:bg-[var(--color-accent-400)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-200)]"
          data-testid={`audience-invite-${member.identity}`}
        >
          <Plus size={12} weight="bold" />
          Invite
        </button>
      )}
    </div>
  );
}

export function AudienceRows({
  audience,
  invitedSet,
  onInvite,
}: AudienceRowsProps): ReactElement {
  if (audience.length === 0) {
    return (
      <div
        className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-divider)] bg-[var(--color-surface)]/40 p-4 text-sm text-[var(--color-neutral-500)]"
        data-testid="audience-rows-empty"
      >
        No listeners yet.
      </div>
    );
  }
  return (
    <div
      className="grid grid-cols-1 gap-3 md:grid-cols-2"
      data-testid="audience-rows"
      data-count={audience.length}
    >
      {audience.map((member) => (
        <Row
          key={member.identity}
          member={member}
          invited={invitedSet.has(member.identity)}
          onInvite={() => onInvite(member.identity)}
        />
      ))}
    </div>
  );
}

export default AudienceRows;
