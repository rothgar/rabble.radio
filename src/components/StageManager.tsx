'use client';

// src/components/StageManager.tsx
//
// Host-only stage management controls. Lists current speakers and lets the
// host remove any of them. Visible only when `role === 'host'`. Resolves
// speaker DIDs to Bluesky handles/display names via /api/users.

import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { Participant } from 'livekit-client';

export interface StageManagerProps {
  spaceId: string;
  /** Current LiveKit room participants. */
  speakers: Participant[];
  onRemoveSpeaker: (targetIdentity: string) => Promise<void> | void;
  /**
   * Identity of the local host, when present. Used to suppress the empty
   * state when only the host is on stage (so the host never sees
   * "No speakers on stage yet.").
   */
  hostIdentity?: string;
  disabled?: boolean;
}

interface ProfileSummary {
  did: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export function StageManager({
  spaceId,
  speakers,
  onRemoveSpeaker,
  hostIdentity,
  disabled = false,
}: StageManagerProps): ReactElement | null {
  const [busyIdentity, setBusyIdentity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, ProfileSummary>>({});

  const identities = speakers.map((s) => s.identity);

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

  const handleRemove = useCallback(
    async (identity: string) => {
      if (disabled) return;
      // The host cannot remove themselves from the stage.
      if (hostIdentity && identity === hostIdentity) return;
      setBusyIdentity(identity);
      setError(null);
      try {
        await onRemoveSpeaker(identity);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Remove failed.');
      } finally {
        setBusyIdentity(null);
      }
    },
    [disabled, hostIdentity, onRemoveSpeaker]
  );

  // Only show the empty state when there are truly no speakers. The host
  // counts as a speaker when their identity matches the hostIdentity prop.
  const hasHost = Boolean(
    hostIdentity && speakers.some((s) => s.identity === hostIdentity)
  );
  if (speakers.length === 0 && !hasHost) {
    return (
      <div
        className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs text-slate-400"
        data-testid="stage-manager-empty"
      >
        No speakers on stage yet. Invite audience members to begin.
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border border-slate-800 bg-slate-900 p-3"
      data-testid="stage-manager"
      data-space-id={spaceId}
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Stage (host controls)
        </h3>
        <span className="text-xs text-slate-500">{speakers.length}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {speakers.map((speaker) => {
          const isHost =
            Boolean(hostIdentity) && speaker.identity === hostIdentity;
          const profile = profiles[speaker.identity];
          const displayName =
            profile?.displayName?.trim() ||
            speaker.name?.trim() ||
            speaker.identity;
          const handle = profile?.handle;
          return (
            <li
              key={speaker.identity}
              className="flex items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-950 px-3 py-2"
              data-testid={`speaker-${speaker.identity}`}
              data-is-host={isHost ? 'true' : 'false'}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-slate-100">
                  {displayName}
                  {isHost ? (
                    <span className="ml-2 rounded-full bg-sky-900/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-300">
                      Host
                    </span>
                  ) : null}
                </div>
                <div className="truncate text-xs text-slate-500">
                  {handle ? `@${handle}` : speaker.identity}
                </div>
              </div>
              {isHost ? (
                <span
                  className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-500"
                  data-testid={`host-badge-${speaker.identity}`}
                >
                  On stage
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    void handleRemove(speaker.identity);
                  }}
                  disabled={disabled || busyIdentity === speaker.identity}
                  className="rounded-md border border-red-700 bg-red-900/40 px-2 py-1 text-xs font-medium text-red-100 hover:bg-red-900/60 disabled:opacity-50"
                  data-testid={`remove-${speaker.identity}`}
                >
                  {busyIdentity === speaker.identity ? 'Removing…' : 'Remove'}
                </button>
              )}
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

export default StageManager;
