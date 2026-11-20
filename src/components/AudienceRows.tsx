'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';
import { Hand, Plus } from '@phosphor-icons/react';
import type { AudienceMember } from '@/components/AudienceBubbles';
import { ShareEntry } from '@/components/ShareEntry';

export interface AudienceRowsProps {
  audience: AudienceMember[];
  invitedSet: Set<string>;
  onInvite: (identity: string) => void;
  shareableUrl: string;
  title: string;
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
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-ink)] ring-1 ring-[var(--color-border)]">
        {member.avatarUrl && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={member.avatarUrl}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setBroken(true)}
          />
        ) : (
          <span className="text-[11px] font-medium text-[var(--color-text-on-ink)]">
            {initialsFor(member.name)}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5 truncate text-sm font-medium text-[var(--color-text)]">
          {member.handRaised ? (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-highlight)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-highlight-text)]"
              data-testid={`audience-hand-${member.identity}`}
            >
              <Hand size={11} weight="bold" aria-hidden />
              Hand up
            </span>
          ) : null}
          <span className="truncate">{member.name}</span>
        </span>
        {member.handle ? (
          <span className="truncate text-xs text-[var(--color-accent-2-700)]">
            @{member.handle}
          </span>
        ) : null}
      </div>
      {invited ? (
        <span
          className="inline-flex items-center rounded-full bg-[var(--color-ink)] px-3 py-1 text-xs font-medium text-[var(--color-text-on-ink)]"
          data-testid={`audience-invited-${member.identity}`}
        >
          Invited
        </span>
      ) : (
        <button
          type="button"
          onClick={onInvite}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-200)]"
          data-testid={`audience-invite-${member.identity}`}
        >
          <Plus size={12} weight="bold" />
          Invite
        </button>
      )}
    </div>
  );
}

/**
 * The host's listener list. People with their hand up come first in their
 * own "Raised hands" group so the host can bring them on stage without
 * scanning the whole room; everyone else follows.
 */
export function AudienceRows({
  audience,
  invitedSet,
  onInvite,
  shareableUrl,
  title,
}: AudienceRowsProps): ReactElement {
  const shareEntry = <ShareEntry variant="row" shareableUrl={shareableUrl} title={title} />;
  if (audience.length === 0) {
    return (
      <div className="flex flex-col gap-3" data-testid="audience-rows" data-count={0}>
        {shareEntry}
        <div
          className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-divider)] bg-[var(--color-surface-translucent)] p-4 text-sm text-[var(--color-text-secondary)]"
          data-testid="audience-rows-empty"
        >
          No listeners yet.
        </div>
      </div>
    );
  }
  const raised = audience.filter((m) => m.handRaised);
  const rest = audience.filter((m) => !m.handRaised);
  const renderRows = (members: AudienceMember[]): ReactElement[] =>
    members.map((member) => (
      <Row
        key={member.identity}
        member={member}
        invited={invitedSet.has(member.identity)}
        onInvite={() => onInvite(member.identity)}
      />
    ));
  return (
    <div className="flex flex-col gap-4" data-testid="audience-rows" data-count={audience.length}>
      {shareEntry}
      {raised.length > 0 ? (
        <section
          className="flex flex-col gap-2 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-highlight-muted)] p-3"
          data-testid="raised-hands"
          data-count={raised.length}
        >
          <h3 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-[var(--color-text)]">
            <Hand size={14} weight="bold" aria-hidden />
            Raised hands · {raised.length}
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{renderRows(raised)}</div>
        </section>
      ) : null}
      {rest.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="audience-rows-rest">
          {renderRows(rest)}
        </div>
      ) : null}
    </div>
  );
}

export default AudienceRows;
