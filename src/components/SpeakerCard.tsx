'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement, RefObject } from 'react';
import { MicrophoneSlash } from '@phosphor-icons/react';

export interface SpeakerCardProps {
  identity: string;
  name: string;
  handle?: string;
  avatarUrl?: string | null;
  isHostCard?: boolean;
  isHost?: boolean;
  isLocal?: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  onMuteToggle?: () => void;
  onRemoveFromStage?: () => void;
  onBlock?: () => void;
  avatarRef?: RefObject<HTMLDivElement | null>;
}

function initialsFor(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '??';
  return trimmed.slice(0, 2).toUpperCase();
}

export function SpeakerCard({
  identity,
  name,
  handle,
  avatarUrl,
  isHostCard = false,
  isHost = false,
  isLocal = false,
  isMuted,
  isSpeaking,
  onMuteToggle,
  onRemoveFromStage,
  onBlock,
  avatarRef,
}: SpeakerCardProps): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  // Hosts can act on remote speakers. The local user and plain audience
  // cards do not get the action menu.
  const showMenu = isHostCard && !isLocal;

  const toggleMenu = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setMenuOpen((v) => !v);
  }, []);

  const profileUrl = handle
    ? `https://bsky.app/profile/${encodeURIComponent(handle)}`
    : undefined;

  const avatarInner = (
    <div
      ref={avatarRef}
      className={
        'flex h-20 w-20 items-center justify-center overflow-hidden rounded-full ' +
        (isSpeaking
          ? 'bg-[var(--color-accent-700)]'
          : 'bg-[var(--color-accent-700)]')
      }
      style={{
        boxShadow: isSpeaking
          ? '0 0 0 3px var(--color-accent)'
          : '0 0 0 2px var(--color-neutral-800)',
      }}
      data-testid={`speaker-avatar-${identity}`}
      data-speaking={isSpeaking ? 'true' : 'false'}
      data-local={isLocal ? 'true' : 'false'}
    >
      {avatarUrl && !avatarBroken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className="h-full w-full object-cover"
          data-testid={`speaker-avatar-img-${identity}`}
          onError={() => setAvatarBroken(true)}
        />
      ) : (
        <span
          className="text-base font-medium text-[var(--color-accent-100)]"
          data-testid={`speaker-avatar-fallback-${identity}`}
        >
          {initialsFor(name)}
        </span>
      )}
    </div>
  );

  const avatar = (
    <div className="relative inline-flex p-1" data-testid={`speaker-avatar-wrap-${identity}`}>
      {showMenu ? (
        <button
          type="button"
          onClick={toggleMenu}
          className="cursor-pointer appearance-none rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          aria-label="Speaker actions"
          aria-expanded={menuOpen}
          data-testid={`speaker-menu-trigger-${identity}`}
        >
          {avatarInner}
        </button>
      ) : (
        avatarInner
      )}
      {isMuted ? (
        <span
          aria-hidden
          data-testid={`speaker-muted-badge-${identity}`}
          className="pointer-events-none absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[var(--color-bg)] bg-red-600 text-white"
        >
          <MicrophoneSlash size={14} weight="fill" />
        </span>
      ) : null}
    </div>
  );

  return (
    <div
      className="relative flex min-w-0 flex-col items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] p-4"
      data-testid={`speaker-card-${identity}`}
      data-local={isLocal ? 'true' : 'false'}
      data-host={isHost ? 'true' : 'false'}
      data-speaking={isSpeaking ? 'true' : 'false'}
      data-muted={isMuted ? 'true' : 'false'}
    >
      <div
        className="flex flex-col items-center gap-2"
        data-testid={`speaker-card-body-${identity}`}
      >
        {avatar}
        <div className="flex min-w-0 max-w-full flex-col items-center text-center">
          <div className="flex max-w-full items-center gap-1.5">
            <span
              className="truncate text-sm font-medium text-[var(--color-text)]"
              data-testid={`speaker-name-${identity}`}
              title={name}
            >
              {name}
              {isLocal ? (
                <span className="ml-1 text-xs text-[var(--color-neutral-500)]">
                  (you)
                </span>
              ) : null}
            </span>
            {isHost ? (
              <span
                className="inline-flex shrink-0 items-center rounded-full bg-[var(--color-accent-700)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-accent-100)]"
                data-testid={`speaker-host-tag-${identity}`}
              >
                Host
              </span>
            ) : null}
          </div>
          {handle ? (
            <a
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="truncate text-xs text-[var(--color-accent-300)] hover:underline"
              data-testid={`speaker-handle-${identity}`}
              title={`@${handle}`}
            >
              @{handle}
            </a>
          ) : null}
        </div>
      </div>

      {menuOpen && showMenu ? (
        <div
          className="absolute left-1/2 top-full z-20 mt-2 w-48 -translate-x-1/2 rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] p-2 text-sm shadow-lg"
          ref={menuRef}
          data-testid={`speaker-menu-panel-${identity}`}
        >
          {profileUrl ? (
            <a
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-md px-2 py-1.5 text-[var(--color-text)] hover:bg-[var(--color-accent-800)]"
              data-testid={`speaker-profile-${identity}`}
              onClick={() => setMenuOpen(false)}
            >
              Go to profile
            </a>
          ) : null}
          {onMuteToggle ? (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onMuteToggle();
              }}
              className="w-full rounded-md px-2 py-1.5 text-left text-[var(--color-text)] hover:bg-[var(--color-accent-800)]"
              data-testid={`speaker-mute-${identity}`}
            >
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
          ) : null}
          {onRemoveFromStage ? (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onRemoveFromStage();
              }}
              className="w-full rounded-md px-2 py-1.5 text-left text-amber-200 hover:bg-[var(--color-accent-800)]"
              data-testid={`speaker-remove-${identity}`}
            >
              Remove from stage
            </button>
          ) : null}
          {onBlock ? (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onBlock();
              }}
              className="w-full rounded-md px-2 py-1.5 text-left text-red-300 hover:bg-[var(--color-accent-800)]"
              data-testid={`speaker-block-${identity}`}
            >
              Block
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default SpeakerCard;
