'use client';

// src/components/AudioParticipant.tsx
//
// Single audio tile for a participant. Renders avatar + name + handle + mute
// status + speaking indicator. Remote audio playback is handled by
// LiveKitRoom's built-in audio elements when audio tracks are published.
//
// Interaction model:
//   - By default the tile shows just the avatar + name + mute indicator.
//   - Tapping / clicking the tile reveals the host action menu (and, for
//     the local participant, a Mute/Unmute action).
//   - For the local participant the host action menu never appears (you
//     can't perform host actions against yourself), but the mute
//     indicator itself is a button that toggles the local microphone.

import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { HostActionMenu } from '@/components/HostActionMenu';

export interface AudioParticipantTileData {
  /** Resolved Bluesky handle (without the "@"). */
  handle?: string;
  avatarUrl?: string | null;
  displayName?: string | null;
}

export interface AudioParticipantProps {
  identity: string;
  name?: string;
  isMuted: boolean;
  isSpeaking: boolean;
  isLocal?: boolean;
  /** Resolved Bluesky handle shown next to the display name when available. */
  handle?: string;
  /** URL of the participant's avatar, when known. */
  avatarUrl?: string | null;
  /** The participant's DID. When provided, name + avatar become a link to bsky.app. */
  did?: string;
  /** True when the local user is the host; enables HostActionMenu. */
  isHost?: boolean;
  /** Stage mode for HostActionMenu rendering. */
  mode?: 'speaker' | 'audience';
  /**
   * When true, the action menu is forced open (uncontrolled `open` state
   * is ignored). Used by tests and parent components that want to drive
   * the open state externally.
   */
  defaultOpen?: boolean;
  /** Host action callbacks. Forwarded to HostActionMenu. */
  onInvite?: () => void;
  onMuteToggle?: () => void;
  onRemoveFromStage?: () => void;
  onRemoveFromSpace?: () => void;
  onBlock?: () => void;
  /**
   * Local participant mic toggle. When provided AND `isLocal` is true,
   * the tile's mute indicator becomes a tappable button and the expanded
   * action menu exposes a Mute / Unmute button. The outer
   * `LocalAudioControls` continues to work; this is additive.
   */
  onLocalMuteToggle?: () => void;
}

function initialsFor(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '??';
  const first = trimmed.slice(0, 2);
  return first.toUpperCase();
}

export function AudioParticipant({
  identity,
  name,
  isMuted,
  isSpeaking,
  isLocal = false,
  handle,
  avatarUrl,
  did,
  isHost = false,
  mode = 'audience',
  defaultOpen = false,
  onInvite,
  onMuteToggle,
  onRemoveFromStage,
  onRemoveFromSpace,
  onBlock,
  onLocalMuteToggle,
}: AudioParticipantProps): ReactElement {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  // If the avatar <img> fails to load (404, CORS, etc.) we swap to the
  // initials fallback so the tile still renders. Without this the user
  // would see a broken-image icon for the whole tile.
  const [avatarBroken, setAvatarBroken] = useState<boolean>(false);

  const displayName = name?.trim() || handle?.trim() || identity;
  const statusLabel = isMuted
    ? 'Muted'
    : isSpeaking
      ? 'Speaking'
      : 'Listening';

  // Diagnostic: log the props we received on mount so we can trace where
  // the avatarUrl might be getting dropped on the way to the tile.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[AudioParticipant] props', {
      identity,
      avatarUrl,
      handle,
      displayName,
      isLocal,
    });
  }, [identity, avatarUrl, handle, displayName, isLocal]);

  const ringClass = isSpeaking
    ? 'ring-2 ring-sky-400'
    : 'ring-1 ring-slate-800';

  const effectiveAvatarUrl =
    avatarUrl && avatarUrl.length > 0 && !avatarBroken ? avatarUrl : null;

  const avatarContent = effectiveAvatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={effectiveAvatarUrl}
      alt=""
      className="h-10 w-10 shrink-0 rounded-full object-cover"
      data-testid={`avatar-img-${identity}`}
      data-avatar-url={effectiveAvatarUrl}
      onError={() => {
        // eslint-disable-next-line no-console
        console.warn(
          `[AudioParticipant] avatar failed to load for ${identity}:`,
          effectiveAvatarUrl
        );
        setAvatarBroken(true);
      }}
    />
  ) : (
    <div
      className={
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium ' +
        (isMuted
          ? 'bg-slate-700 text-slate-400'
          : 'bg-sky-700 text-white')
      }
      aria-hidden="true"
      data-testid={`avatar-fallback-${identity}`}
    >
      {initialsFor(displayName)}
    </div>
  );

  const handleLabel = handle ? `@${handle}` : null;

  const toggleOpen = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const handleTileKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleOpen();
      } else if (event.key === 'Escape' && open) {
        event.preventDefault();
        setOpen(false);
      }
    },
    [open, toggleOpen]
  );

  const inner = (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      {avatarContent}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-slate-100">
          {displayName}
          {isLocal ? (
            <span className="ml-1 text-xs text-slate-500">(you)</span>
          ) : null}
        </span>
        {handleLabel ? (
          <span
            className="truncate text-xs text-sky-300"
            data-testid={`handle-${identity}`}
          >
            {handleLabel}
          </span>
        ) : null}
        <span className="text-[10px] text-slate-500">{statusLabel}</span>
      </div>
    </div>
  );

  // Wrap the avatar + name area in a link to bsky.app when we have a DID.
  // The link stops propagation so clicking the name doesn't toggle the
  // action menu (we want the link to navigate).
  const nameAndAvatar = did ? (
    <a
      href={`https://bsky.app/profile/${encodeURIComponent(did)}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="flex min-w-0 flex-1 items-center gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      data-testid={`profile-link-${identity}`}
    >
      {inner}
    </a>
  ) : (
    inner
  );

  // The mute indicator becomes a button for the local participant when an
  // onLocalMuteToggle handler is supplied. For remote participants we keep
  // the previous static badge so the host can use the menu to mute them.
  const canToggleLocalMic = isLocal && typeof onLocalMuteToggle === 'function';
  const muteIndicator = canToggleLocalMic ? (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onLocalMuteToggle?.();
      }}
      aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
      aria-pressed={!isMuted}
      className={
        'shrink-0 cursor-pointer rounded-full px-2 py-0.5 text-xs transition-colors ' +
        (isMuted
          ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          : isSpeaking
            ? 'bg-sky-600/30 text-sky-200 hover:bg-sky-600/40'
            : 'bg-slate-800 text-slate-400 hover:bg-slate-700')
      }
      data-testid="mute-indicator"
      data-muted={isMuted ? 'true' : 'false'}
      data-tappable="true"
    >
      {isMuted ? 'Muted' : 'Live'}
    </button>
  ) : (
    <span
      className={
        'shrink-0 rounded-full px-2 py-0.5 text-xs ' +
        (isMuted
          ? 'bg-slate-700 text-slate-300'
          : isSpeaking
            ? 'bg-sky-600/30 text-sky-200'
            : 'bg-slate-800 text-slate-400')
      }
      data-testid="mute-indicator"
      data-muted={isMuted ? 'true' : 'false'}
    >
      {isMuted ? 'Muted' : 'Live'}
    </span>
  );

  // Determine whether the tile has any expandable content to show.
  // - Host + remote => host action menu
  // - Local participant with onLocalMuteToggle => Mute/Unmute action
  const hasHostMenu = isHost && !isLocal;
  const hasLocalMuteAction = isLocal && typeof onLocalMuteToggle === 'function';
  const expandable = hasHostMenu || hasLocalMuteAction;

  // For the local participant the HostActionMenu is never rendered, but
  // we still want the expanded state to reveal the Mute/Unmute action.
  const expandedMenu = (() => {
    if (!open) return null;
    if (hasHostMenu) {
      return (
        <HostActionMenu
          mode={mode}
          identity={identity}
          did={did}
          isLocal={isLocal}
          isMuted={isMuted}
          onInvite={onInvite ? () => onInvite() : undefined}
          onMuteToggle={onMuteToggle ? () => onMuteToggle() : undefined}
          onRemoveFromStage={onRemoveFromStage ? () => onRemoveFromStage() : undefined}
          onRemoveFromSpace={onRemoveFromSpace ? () => onRemoveFromSpace() : undefined}
          onBlock={onBlock ? () => onBlock() : undefined}
        />
      );
    }
    if (hasLocalMuteAction) {
      return (
        <div
          className="flex flex-wrap items-center gap-1.5"
          data-testid={`local-actions-${identity}`}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => onLocalMuteToggle?.()}
            className={
              'rounded-md border px-2 py-0.5 text-[11px] font-medium ' +
              (isMuted
                ? 'border-slate-700 bg-slate-800/60 text-slate-100 hover:bg-slate-800'
                : 'border-amber-700 bg-amber-900/40 text-amber-100 hover:bg-amber-900/60')
            }
            data-testid={`local-mute-toggle-${identity}`}
            aria-pressed={!isMuted}
          >
            {isMuted ? 'Unmute' : 'Mute'}
          </button>
        </div>
      );
    }
    return null;
  })();

  return (
    <div
      className={
        'flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900 p-3 transition-colors ' +
        ringClass +
        (expandable ? ' cursor-pointer hover:ring-sky-500/60' : '')
      }
      data-testid={`participant-${identity}`}
      data-speaking={isSpeaking ? 'true' : 'false'}
      data-muted={isMuted ? 'true' : 'false'}
      data-handle={handle ?? ''}
      data-open={open ? 'true' : 'false'}
      data-avatar-url={effectiveAvatarUrl ?? ''}
      role={expandable ? 'button' : undefined}
      tabIndex={expandable ? 0 : undefined}
      aria-expanded={expandable ? open : undefined}
      onClick={expandable ? toggleOpen : undefined}
      onKeyDown={expandable ? handleTileKeyDown : undefined}
    >
      <div className="flex items-center gap-3">
        {nameAndAvatar}
        <div className="flex items-center gap-2">
          {muteIndicator}
          {expandable ? (
            <span
              aria-hidden="true"
              className="text-xs text-slate-500"
              data-testid={`tile-expand-hint-${identity}`}
            >
              {open ? '×' : '⋯'}
            </span>
          ) : null}
        </div>
      </div>
      {expandedMenu}
    </div>
  );
}

export default AudioParticipant;
