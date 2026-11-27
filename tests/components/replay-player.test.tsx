// tests/components/replay-player.test.tsx

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ReplayPlayer, formatDuration } from '@/components/ReplayPlayer';
import { formatSize } from '@/lib/format';

afterEach(cleanup);

describe('ReplayPlayer', () => {
  it('renders an audio element pointing at the stable audio route', () => {
    render(
      <ReplayPlayer
        title="Morning Show"
        replay={{
          recordingId: 'rec1',
          audioUrl: '/api/recordings/rec1/audio',
          contentType: 'audio/mp4',
          startedAt: '2026-11-07T00:00:00.000Z',
          endedAt: '2026-11-07T00:40:30.000Z',
          durationSeconds: 2430,
          sizeBytes: 5 * 1024 * 1024,
        }}
      />
    );
    const audio = screen.getByTestId('replay-audio') as HTMLAudioElement;
    expect(audio.getAttribute('src')).toBe('/api/recordings/rec1/audio');
    expect(audio.hasAttribute('controls')).toBe(true);
    expect(screen.getByTestId('replay-meta').textContent).toContain('40m 30s');
    expect(screen.getByTestId('replay-meta').textContent).toContain('5.0 MB');
    expect(screen.getByText(/Listen to the recording of Morning Show/)).toBeTruthy();
  });

  it('formats durations and sizes', () => {
    expect(formatDuration(null)).toBe('');
    expect(formatDuration(59)).toBe('59s');
    expect(formatDuration(3700)).toBe('1h 1m');
    expect(formatSize(null)).toBe('');
    expect(formatSize(512 * 1024)).toBe('512 KB');
  });
});
