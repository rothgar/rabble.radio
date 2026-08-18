'use client';

// src/components/AudienceList.tsx
//
// Lists current audience participants. For hosts, each audience member
// shows an "Invite to stage" button. Resolves DIDs to Bluesky handles/
// display names via /api/users.

import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { Participant } from 'livekit-client';

export interface AudienceListProps {
  spaceId: string;
  audience: Participant[];
  isHost: boolean;
  localIdentity?: string;
  onInvite: (targetIdentity: string) => Promise<void> | void;
}

interface ProfileSummary {
  did: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export function AudienceList({
  spaceId,
  audience,
  isHost,
  localIdentity,
  onInvite,
}: AudienceListProps): ReactElement {
  const [busyIdentity, setBusyIdentity] = useState<string | null>(null);
  const [invitedSet, setInvitedSet] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, ProfileSummary>>({});

  const identities = audience.map((p) => p.identity);

  useEffect(() => {
    if (identities.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/users?identities=${encodeURIComponent(identities.join(','))}`,
          { headers: { accept: 'application/json' } }
        );
        if (!res.ok) return;
        const body = (await res.json().catch(() => ({}))) as {
          users?: ProfileSummary[];
        };
        if (cancelled || !body.users) return;
        const next: Record<string, ProfileSummary> = {};
        for (const u of body.users) {
          next[u.did] = u;
        }
        setProfiles(next);
      } catch {
        // Best-effort; fall back to raw identity.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [identities.join(',')]);

  const handleInvite = useCallback(
    async (identity: string) => {
      setBusyIdentity(identity);
      setError(null);
      try {
        await onInvite(identity);
        setInvitedSet((prev) => {
          const next = new Set(prev);
          next.add(identity);
          return next;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invite failed.');
      } finally {
        setBusyIdentity(null);
      }
    },
    [onInvite]
  );

  if (audience.length === 0) {
    return (
      <div
        className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs text-slate-400"
        data-testid="audience-list-empty"
      >
        No audience participants yet.
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border border-slate-800 bg-slate-900 p-3"
      data-testid="audience-list"
      data-space-id={spaceId}
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Audience
        </h3>
        <span className="text-xs text-slate-500">{audience.length}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {audience.map((p) => {
          const isLocal = p.identity === localIdentity;
          const alreadyInvited = invitedSet.has(p.identity);
          const profile = profiles[p.identity];
          const displayName =
            profile?.displayName?.trim() ||
            p.name?.trim() ||
            p.identity;
          const handle = profile?.handle;
          return (
            <li
              key={p.identity}
              className="flex items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-950 px-3 py-2"
              data-testid={`audience-${p.identity}`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-slate-100">
                  {displayName}
                  {isLocal ? (
                    <span className="ml-1 text-xs text-slate-500">(you)</span>
                  ) : null}
                </div>
                <div className="truncate text-xs text-slate-500">
                  {handle ? `@${handle}` : p.identity}
                </div>
              </div>
              {isHost && !isLocal ? (
                <button
                  type="button"
                  onClick={() => {
                    void handleInvite(p.identity);
                  }}
                  disabled={
                    alreadyInvited || busyIdentity === p.identity
                  }
                  className="rounded-md border border-sky-700 bg-sky-900/40 px-2 py-1 text-xs font-medium text-sky-100 hover:bg-sky-900/60 disabled:opacity-50"
                  data-testid={`invite-${p.identity}`}
                >
                  {alreadyInvited
                    ? 'Invited'
                    : busyIdentity === p.identity
                      ? 'Inviting…'
                      : 'Invite to stage'}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {error ? (
        <p
          role="alert"
          className="mt-2 rounded-md border border-red-700 bg-red-900/30 px-2 py-1 text-xs text-red-200"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default AudienceList;
