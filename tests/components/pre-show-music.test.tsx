// tests/components/pre-show-music.test.tsx

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PreShowMusic } from '@/components/PreShowMusic';
import { getMood, playlistFor } from '@/lib/music';

let play: ReturnType<typeof vi.fn>;
let pause: ReturnType<typeof vi.fn>;

beforeEach(() => {
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: play });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: pause });
  window.localStorage.clear();
});
afterEach(() => cleanup());

const first = playlistFor(getMood('lounge')!, 'sp1')[0];

describe('PreShowMusic', () => {
  it('renders nothing for listeners when no mood is set', () => {
    const { container } = render(<PreShowMusic spaceId="sp1" moodId={null} active={false} isHost={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('plays the room playlist with attribution while active and pauses when not', async () => {
    const { rerender } = render(<PreShowMusic spaceId="sp1" moodId="lounge" active isHost={false} />);
    const audio = screen.getByTestId('pre-show-audio') as HTMLAudioElement;
    await waitFor(() => expect(play).toHaveBeenCalled());
    expect(audio.getAttribute('src') ?? audio.src).toContain(`/music/${first.file}`);
    expect(audio.volume).toBeCloseTo(0.35);
    expect(screen.getByTestId('pre-show-music-track').textContent).toContain(`Now playing: ${first.title} by Kevin MacLeod`);
    expect(screen.getByTestId('pre-show-music').getAttribute('data-playing')).toBe('true');

    rerender(<PreShowMusic spaceId="sp1" moodId="lounge" active={false} isHost={false} />);
    expect(pause).toHaveBeenCalled();
    expect(screen.getByTestId('pre-show-music').getAttribute('data-playing')).toBe('false');
    expect(screen.getByTestId('pre-show-music-track').textContent).toContain('Next up');
  });

  it('advances to the next track when one ends', async () => {
    render(<PreShowMusic spaceId="sp1" moodId="lounge" active isHost={false} />);
    const audio = screen.getByTestId('pre-show-audio') as HTMLAudioElement;
    await waitFor(() => expect(play).toHaveBeenCalled());
    fireEvent(audio, new Event('ended'));
    const second = playlistFor(getMood('lounge')!, 'sp1')[1];
    await waitFor(() => expect(screen.getByTestId('pre-show-music-track').textContent).toContain(second.title));
  });

  it('mutes persistently and offers Play when autoplay is blocked', async () => {
    play.mockRejectedValueOnce(new Error('NotAllowedError'));
    render(<PreShowMusic spaceId="sp1" moodId="upbeat" active isHost={false} />);
    await waitFor(() => expect(screen.getByTestId('pre-show-music-play')).toBeTruthy());
    play.mockResolvedValue(undefined);
    fireEvent.click(screen.getByTestId('pre-show-music-play'));
    await waitFor(() => expect(screen.queryByTestId('pre-show-music-play')).toBeNull());

    fireEvent.click(screen.getByTestId('pre-show-music-mute'));
    expect(window.localStorage.getItem('rabble.musicMuted')).toBe('1');
    expect(screen.getByTestId('pre-show-music').getAttribute('data-playing')).toBe('false');
    expect(pause).toHaveBeenCalled();
  });

  it('lets the host pick, change and clear the mood', async () => {
    const onMoodChange = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <PreShowMusic spaceId="sp1" moodId={null} active={false} isHost onMoodChange={onMoodChange} />
    );
    expect(screen.getByTestId('pre-show-music-moods')).toBeTruthy();
    fireEvent.click(screen.getByTestId('pre-show-music-mood-focus'));
    await waitFor(() => expect(onMoodChange).toHaveBeenCalledWith('focus'));

    rerender(<PreShowMusic spaceId="sp1" moodId="focus" active isHost onMoodChange={onMoodChange} />);
    expect(screen.getByTestId('pre-show-music-mood-focus').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByTestId('pre-show-music-mood-off'));
    await waitFor(() => expect(onMoodChange).toHaveBeenLastCalledWith(null));

    onMoodChange.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByTestId('pre-show-music-mood-groove'));
    await waitFor(() => expect(screen.getByTestId('pre-show-music-error').textContent).toBe('offline'));
  });
});
