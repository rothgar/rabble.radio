// tests/components/notify-me-button.test.tsx

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NotifyMeButton } from '@/components/NotifyMeButton';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('NotifyMeButton', () => {
  it('links signed-out visitors to login', () => {
    render(<NotifyMeButton spaceId="sp1" isAuthenticated={false} reminded={false} />);
    const link = screen.getByTestId('notify-me-signin') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/login?next=%2Fshow%2Fsp1');
  });

  it('turns the reminder on and off through the API', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ reminded: true }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ reminded: false }) });
    const onChange = vi.fn();
    render(<NotifyMeButton spaceId="sp1" isAuthenticated reminded={false} onChange={onChange} />);
    const btn = screen.getByTestId('notify-me-button');
    expect(btn.textContent).toMatch(/notify me/i);
    fireEvent.click(btn);
    await waitFor(() => expect(btn.textContent).toMatch(/you'll be notified/i));
    expect(fetchMock).toHaveBeenCalledWith('/api/spaces/sp1/remind', expect.objectContaining({ method: 'POST', body: JSON.stringify({ on: true }) }));
    expect(onChange).toHaveBeenCalledWith(true);
    fireEvent.click(btn);
    await waitFor(() => expect(btn.textContent).toMatch(/notify me/i));
    expect(JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body))).toEqual({ on: false });
  });

  it('shows the server error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ message: 'nope' }) });
    render(<NotifyMeButton spaceId="sp1" isAuthenticated reminded={false} />);
    fireEvent.click(screen.getByTestId('notify-me-button'));
    await waitFor(() => expect(screen.getByTestId('notify-me-error').textContent).toBe('nope'));
  });
});
