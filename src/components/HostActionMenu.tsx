'use client';

// src/components/HostActionMenu.tsx
//
// Inline action menu shown to the host on remote participant tiles. Allows
// the host to invite audience members to stage, mute/unmute speakers,
// remove from stage, kick from space, or block a user. Renders nothing for
// the local participant (you can't perform host actions against yourself).

import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';

export interface HostActionMenuProps {
  mode: 'audience' | 'speaker';
  identity: string;
  did?: string;
  isLocal: boolean;
  isMuted?: boolean;
  onInvite?: () => void;
  onMuteToggle?: () => void;
  onRemoveFromStage?: () => void;
  onRemoveFromSpace?: () => void;
  onBlock?: () => void;
}

interface ActionSpec {
  key: string;
  label: string;
  className: string;
  onClick: () => void;
  testId: string;
}

export function HostActionMenu({
  mode,
  identity,
  isLocal,
  isMuted,
  onInvite,
  onMuteToggle,
  onRemoveFromStage,
  onRemoveFromSpace,
  onBlock,
}: HostActionMenuProps): ReactElement | null {
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const wrap = useCallback(
    async (key: string, fn?: () => void | Promise<void>) => {
      if (!fn) return;
      setBusyKey(key);
      try {
        await fn();
      } finally {
        setBusyKey(null);
      }
    },
    []
  );

  if (isLocal) return null;

  const actions: ActionSpec[] = [];

  if (mode === 'audience' && onInvite) {
    actions.push({
      key: 'invite',
      label: 'Add to stage',
      className:
        'border-sky-700 bg-sky-900/40 text-sky-100 hover:bg-sky-900/60',
      onClick: () => {
        void wrap('invite', onInvite);
      },
      testId: `host-invite-${identity}`,
    });
  }

  if (mode === 'speaker' && onMuteToggle) {
    actions.push({
      key: 'mute',
      label: isMuted ? 'Unmute' : 'Mute',
      className:
        'border-slate-700 bg-slate-800/60 text-slate-100 hover:bg-slate-800',
      onClick: () => {
        void wrap('mute', onMuteToggle);
      },
      testId: `host-mute-${identity}`,
    });
  }

  if (mode === 'speaker' && onRemoveFromStage) {
    actions.push({
      key: 'remove-from-stage',
      label: 'Remove from stage',
      className:
        'border-amber-700 bg-amber-900/40 text-amber-100 hover:bg-amber-900/60',
      onClick: () => {
        void wrap('remove-from-stage', onRemoveFromStage);
      },
      testId: `host-remove-stage-${identity}`,
    });
  }

  if (onRemoveFromSpace) {
    actions.push({
      key: 'remove-from-space',
      label: 'Remove from space',
      className:
        'border-red-700 bg-red-900/40 text-red-100 hover:bg-red-900/60',
      onClick: () => {
        void wrap('remove-from-space', onRemoveFromSpace);
      },
      testId: `host-kick-${identity}`,
    });
  }

  if (onBlock) {
    actions.push({
      key: 'block',
      label: 'Block',
      className:
        'border-red-800 bg-red-950/60 text-red-100 hover:bg-red-950',
      onClick: () => {
        void wrap('block', onBlock);
      },
      testId: `host-block-${identity}`,
    });
  }

  if (actions.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      data-testid={`host-actions-${identity}`}
      onClick={(e) => e.stopPropagation()}
    >
      {actions.map((a) => (
        <button
          key={a.key}
          type="button"
          onClick={a.onClick}
          disabled={busyKey !== null}
          className={`rounded-md border px-2 py-0.5 text-[11px] font-medium disabled:opacity-50 ${a.className}`}
          data-testid={a.testId}
        >
          {busyKey === a.key ? '…' : a.label}
        </button>
      ))}
    </div>
  );
}

export default HostActionMenu;
