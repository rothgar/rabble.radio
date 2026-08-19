'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement, RefObject } from 'react';
import { DotsThreeVertical, MicrophoneSlash } from '@phosphor-icons/react';

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

  const showMenuToggle = isHostCard && !isLocal && !isHost;

  const avatar = (
    <div
      ref={avatarRef}
      className={
        'relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full ' +
        (isSpeaking
          ? 'bg-[var(--color-accent-700)]'
          : 'bg-[var(--color-accent-700)]')
      }
      style={{
        boxShadow: isSpeaking
          ? '0 0 0 2px var(--color-accent)'
          : '0 0 0 1px var(--color-neutral-800)',
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
          className="text-sm font-medium text-[var(--color-accent-100)]"
          data-testid={`speaker-avatar-fallback-${identity}`}
        >
          {initialsFor(name)}
        </span>
      )}
      {isMuted ? (
        <span
          aria-hidden
          data-testid={`speaker-muted-badge-${identity}`}
          className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white"
        >
          <MicrophoneSlash size={12} weight="fill" />
        </span>
      ) : null}
    </div>
  );

  const inner = (
    <div className="flex items-center gap-3">
      {avatar}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <span
            className="truncate text-sm font-medium text-[var(--color-text)]"
            data-testid={`speaker-name-${identity}`}
          >
            {name}
            {isLocal ? (
              <span className="ml-1 text-xs text-[var(--color-neutral-500)]">(you)</span>
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
          <span
            className="truncate text-xs text-[var(--color-accent-300)]"
            data-testid={`speaker-handle-${identity}`}
          >
            @{handle}
          </span>
        ) : null}
      </div>
    </div>
  );

  const wrapped = handle ? (
    <a
      href={`https://bsky.app/profile/${encodeURIComponent(handle)}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="flex min-w-0 flex-1 items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      data-testid={`speaker-profile-link-${identity}`}
    >
      {inner}
    </a>
  ) : (
    <div className="flex min-w-0 flex-1 items-center">{inner}</div>
  );

  const toggleMenu = useCallback(() => setMenuOpen((v) => !v), []);

  return (
    <div
      className="relative flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] p-3"
      data-testid={`speaker-card-${identity}`}
      data-local={isLocal ? 'true' : 'false'}
      data-host={isHost ? 'true' : 'false'}
      data-speaking={isSpeaking ? 'true' : 'false'}
      data-muted={isMuted ? 'true' : 'false'}
    >
      <div className="flex items-center gap-2">
        {wrapped}
        {showMenuToggle ? (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={toggleMenu}
              aria-label="Speaker actions"
              aria-expanded={menuOpen}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--color-neutral-300)] hover:bg-[var(--color-accent-800)] hover:text-[var(--color-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
              data-testid={`speaker-menu-${identity}`}
            >
              <DotsThreeVertical size={18} weight="bold" />
            </button>
            {menuOpen ? (
              <div
                className="absolute right-0 top-9 z-20 flex w-44 flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-divider)] bg-[var(--color-surface)] p-2 text-sm shadow-lg"
                data-testid={`speaker-menu-panel-${identity}`}
              >
                {onMuteToggle ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onMuteToggle();
                    }}
                    className="rounded-md px-2 py-1.5 text-left text-[var(--color-text)] hover:bg-[var(--color-accent-800)]"
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
                    className="rounded-md px-2 py-1.5 text-left text-amber-200 hover:bg-[var(--color-accent-800)]"
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
                    className="rounded-md px-2 py-1.5 text-left text-red-300 hover:bg-[var(--color-accent-800)]"
                    data-testid={`speaker-block-${identity}`}
                  >
                    Block
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default SpeakerCard;
