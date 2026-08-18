// tests/components/audio-participant.test.tsx
//
// Covers the AudioParticipant tile behaviour for issues 1-3:
//  - Avatar URL renders an <img> with a verifiable data-attribute, and
//    falls back to initials on onError.
//  - HostActionMenu is hidden until the tile is clicked (issue 2).
//  - For the local participant, the mute indicator is a tappable button
//    that fires onLocalMuteToggle (issue 3).
//  - For the local participant the HostActionMenu never appears.

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AudioParticipant } from '@/components/AudioParticipant';

const IDENTITY = 'did:plc:local';

describe('<AudioParticipant />', () => {
  it('renders an <img> when avatarUrl is provided and exposes data-avatar-url', () => {
    const url = 'https://cdn.example/avatar.png';
    render(
      <AudioParticipant
        identity={IDENTITY}
        name="Alice"
        isMuted={false}
        isSpeaking={false}
        avatarUrl={url}
      />
    );
    const img = screen.getByTestId(`avatar-img-${IDENTITY}`) as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toBe(url);
    expect(img.getAttribute('data-avatar-url')).toBe(url);
  });

  it('falls back to initials when avatarUrl is missing', () => {
    render(
      <AudioParticipant
        identity={IDENTITY}
        name="Alice"
        isMuted={false}
        isSpeaking={false}
        avatarUrl={null}
      />
    );
    expect(screen.getByTestId(`avatar-fallback-${IDENTITY}`)).toHaveTextContent('AL');
  });

  it('falls back to initials when the avatar <img> fails to load', () => {
    render(
      <AudioParticipant
        identity={IDENTITY}
        name="Bob"
        isMuted={false}
        isSpeaking={false}
        avatarUrl="https://cdn.example/broken.png"
      />
    );
    const img = screen.getByTestId(`avatar-img-${IDENTITY}`);
    fireEvent.error(img);
    expect(screen.getByTestId(`avatar-fallback-${IDENTITY}`)).toHaveTextContent('BO');
  });

  it('hides the host action menu until the tile is clicked', () => {
    render(
      <AudioParticipant
        identity={IDENTITY}
        name="Bob"
        isMuted={false}
        isSpeaking={false}
        isHost
        mode="speaker"
        onMuteToggle={() => {}}
        onRemoveFromSpace={() => {}}
      />
    );
    // Menu not visible by default.
    expect(screen.queryByTestId(`host-actions-${IDENTITY}`)).toBeNull();
    // Tile shows "open=false" by default.
    const tile = screen.getByTestId(`participant-${IDENTITY}`);
    expect(tile.getAttribute('data-open')).toBe('false');
    expect(tile.getAttribute('aria-expanded')).toBe('false');
    // Click the tile (not the profile link) to reveal the menu.
    fireEvent.click(tile);
    expect(screen.getByTestId(`host-actions-${IDENTITY}`)).toBeInTheDocument();
    expect(tile.getAttribute('data-open')).toBe('true');
    // Click again to hide.
    fireEvent.click(tile);
    expect(screen.queryByTestId(`host-actions-${IDENTITY}`)).toBeNull();
  });

  it('never renders the host action menu for the local participant', () => {
    render(
      <AudioParticipant
        identity={IDENTITY}
        name="Alice"
        isMuted={false}
        isSpeaking={false}
        isLocal
        isHost
        mode="speaker"
        onLocalMuteToggle={() => {}}
      />
    );
    // Even after clicking, the host menu should not appear.
    fireEvent.click(screen.getByTestId(`participant-${IDENTITY}`));
    expect(screen.queryByTestId(`host-actions-${IDENTITY}`)).toBeNull();
  });

  it('makes the local mute indicator a tappable button that toggles the mic', () => {
    const onLocalMuteToggle = vi.fn();
    render(
      <AudioParticipant
        identity={IDENTITY}
        name="Alice"
        isMuted
        isSpeaking={false}
        isLocal
        isHost
        onLocalMuteToggle={onLocalMuteToggle}
      />
    );
    const indicator = screen.getByTestId('mute-indicator');
    expect(indicator.tagName).toBe('BUTTON');
    fireEvent.click(indicator);
    expect(onLocalMuteToggle).toHaveBeenCalledTimes(1);
  });

  it('shows a Mute/Unmute button in the expanded menu for the local participant', () => {
    const onLocalMuteToggle = vi.fn();
    render(
      <AudioParticipant
        identity={IDENTITY}
        name="Alice"
        isMuted={false}
        isSpeaking={false}
        isLocal
        onLocalMuteToggle={onLocalMuteToggle}
      />
    );
    expect(screen.queryByTestId(`local-actions-${IDENTITY}`)).toBeNull();
    fireEvent.click(screen.getByTestId(`participant-${IDENTITY}`));
    const btn = screen.getByTestId(`local-mute-toggle-${IDENTITY}`);
    expect(btn).toHaveTextContent('Mute');
    fireEvent.click(btn);
    expect(onLocalMuteToggle).toHaveBeenCalledTimes(1);
  });

  it('falls back to a static badge when onLocalMuteToggle is not provided', () => {
    render(
      <AudioParticipant
        identity={IDENTITY}
        name="Alice"
        isMuted={false}
        isSpeaking={false}
        isLocal
      />
    );
    const indicator = screen.getByTestId('mute-indicator');
    expect(indicator.tagName).toBe('SPAN');
  });
});
