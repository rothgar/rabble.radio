// tests/components/reminder-toasts.test.tsx

let barVisible = false;

vi.mock('@/components/ActiveRoomProvider', () => ({
  useActiveRoom: () => ({ barVisible }),
}));

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReminderToasts } from '@/components/ReminderToasts';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  barVisible = false;
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('ReminderToasts', () => {
  it('shows a toast for each due reminder and lets it be dismissed', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        due: [{ spaceId: 'sp1', title: 'Morning Show', host: { handle: 'h.test', displayName: 'Host' } }],
      }),
    });
    render(<ReminderToasts pollMs={100000} />);
    await waitFor(() => expect(screen.getByTestId('reminder-toast-sp1')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith('/api/me/reminders?due=1', expect.anything());
    expect(screen.getByTestId('reminder-toast-listen').getAttribute('href')).toBe('/show/sp1');
    fireEvent.click(screen.getByTestId('reminder-toast-dismiss'));
    expect(screen.queryByTestId('reminder-toast-sp1')).toBeNull();
  });

  it('stops polling after a 401', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    render(<ReminderToasts pollMs={1000} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(3500);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('lands above PersistentShowBar instead of inside its height when a show is active', async () => {
    barVisible = true;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        due: [{ spaceId: 'sp1', title: 'Morning Show', host: { handle: 'h.test', displayName: 'Host' } }],
      }),
    });
    render(<ReminderToasts pollMs={100000} />);
    await waitFor(() => expect(screen.getByTestId('reminder-toasts')).toBeTruthy());
    expect(screen.getByTestId('reminder-toasts').className).toContain('bottom-24');
    expect(screen.getByTestId('reminder-toasts').className).not.toContain('bottom-4');
  });
});
