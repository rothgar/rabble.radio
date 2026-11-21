// tests/components/music-card.test.tsx

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MusicCard } from '@/components/MusicCard';
import { getMood, playlistFor } from '@/lib/music';

let play: ReturnType<typeof vi.fn>;
let pause: ReturnType<typeof vi.fn>;

beforeEach(() => {
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: play });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: pause });
});
afterEach(() => cleanup());

const first = playlistFor(getMood('lounge')!, 'sp1')[0];

describe('MusicCard', () => {
  it('plays the room playlist with attribution while active and pauses when not', async () => {
    const { rerender } = render(<MusicCard spaceId="sp1" moodId="lounge" active isHost={false} />);
    const audio = screen.getByTestId('music-audio') as HTMLAudioElement;
    await waitFor(() => expect(play).toHaveBeenCalled());
    expect(audio.getAttribute('src') ?? audio.src).toContain(`/music/${first.file}`);
    expect(audio.volume).toBeCloseTo(0.35);
    expect(screen.getByTestId('music-name').textContent).toBe(`${first.title} by Kevin MacLeod`);
    expect(screen.getByTestId('music-track').textContent).toContain('Now playing');
    expect(screen.getByTestId('music-track').textContent).toContain(first.license);
    expect(screen.getByTestId('music-track').querySelector('a')).toHaveProperty('href', first.licenseUrl);
    expect(screen.getByTestId('music-card').getAttribute('data-playing')).toBe('true');
    expect(screen.queryByTestId('music-muted-badge')).toBeNull();

    rerender(<MusicCard spaceId="sp1" moodId="lounge" active={false} isHost={false} />);
    expect(pause).toHaveBeenCalled();
    expect(screen.getByTestId('music-card').getAttribute('data-playing')).toBe('false');
    expect(screen.getByTestId('music-track').textContent).toContain('Next up');
    expect(screen.getByTestId('music-muted-badge')).toBeTruthy();
  });

  it('advances to the next track when one ends', async () => {
    render(<MusicCard spaceId="sp1" moodId="lounge" active isHost={false} />);
    const audio = screen.getByTestId('music-audio') as HTMLAudioElement;
    await waitFor(() => expect(play).toHaveBeenCalled());
    fireEvent(audio, new Event('ended'));
    const second = playlistFor(getMood('lounge')!, 'sp1')[1];
    await waitFor(() => expect(screen.getByTestId('music-name').textContent).toContain(second.title));
  });

  it('offers a Play control when autoplay is blocked, for a listener with no menu', async () => {
    play.mockRejectedValueOnce(new Error('NotAllowedError'));
    render(<MusicCard spaceId="sp1" moodId="upbeat" active isHost={false} />);
    await waitFor(() => expect(screen.getByTestId('music-card-play')).toBeTruthy());
    expect(screen.queryByTestId('music-menu-trigger')).toBeNull();

    play.mockResolvedValue(undefined);
    fireEvent.click(screen.getByTestId('music-card-play'));
    await waitFor(() => expect(screen.queryByTestId('music-card-play')).toBeNull());
  });

  it('has no action menu for a non-host listener', () => {
    render(<MusicCard spaceId="sp1" moodId="lounge" active isHost={false} />);
    expect(screen.queryByTestId('music-menu-trigger')).toBeNull();
  });

  it('gives each mood a distinct avatar icon', () => {
    const iconMarkup = (moodId: string): string | undefined => {
      const { container, unmount } = render(
        <MusicCard spaceId="sp1" moodId={moodId} active={false} isHost={false} />
      );
      const markup = container.querySelector('[data-testid="music-avatar"] svg')?.innerHTML;
      unmount();
      return markup;
    };
    const byMood = ['lounge', 'upbeat', 'focus', 'groove'].map(iconMarkup);
    expect(new Set(byMood).size).toBe(byMood.length);
  });

  it('lets the host pick, change and remove the mood from a standard guest-picker menu', async () => {
    const onMoodChange = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <MusicCard spaceId="sp1" moodId={null} active={false} isHost onMoodChange={onMoodChange} />
    );
    fireEvent.click(screen.getByTestId('music-menu-trigger'));
    expect(screen.getByTestId('music-menu-panel')).toBeTruthy();
    expect(screen.queryByTestId('music-mood-remove')).toBeNull();
    expect(screen.queryByTestId('music-copyright')).toBeNull();
    fireEvent.click(screen.getByTestId('music-mood-focus'));
    await waitFor(() => expect(onMoodChange).toHaveBeenCalledWith('focus'));
    expect(screen.queryByTestId('music-menu-panel')).toBeNull();

    rerender(<MusicCard spaceId="sp1" moodId="focus" active isHost onMoodChange={onMoodChange} />);
    fireEvent.click(screen.getByTestId('music-menu-trigger'));
    const focusTrack = playlistFor(getMood('focus')!, 'sp1')[0];
    expect(screen.getByTestId('music-copyright').textContent).toContain(`${focusTrack.title} by Kevin MacLeod (incompetech.com)`);
    expect(screen.getByTestId('music-copyright').querySelector('a')).toHaveProperty('href', focusTrack.licenseUrl);
    fireEvent.click(screen.getByTestId('music-mood-remove'));
    await waitFor(() => expect(onMoodChange).toHaveBeenLastCalledWith(null));

    rerender(<MusicCard spaceId="sp1" moodId="focus" active isHost onMoodChange={onMoodChange} />);
    fireEvent.click(screen.getByTestId('music-menu-trigger'));
    onMoodChange.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByTestId('music-mood-groove'));
    await waitFor(() => expect(screen.getByTestId('music-error').textContent).toBe('offline'));
  });
});
