// tests/components/show-follow-button.test.tsx

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ShowFollowButton } from '@/components/ShowFollowButton';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ShowFollowButton', () => {
  it('links signed-out visitors to login', () => {
    render(
      <ShowFollowButton spaceId="sp1" showTitle="The Weekly Show" isAuthenticated={false} following={false} loginNext="/show/sp1" />
    );
    const link = screen.getByTestId('follow-show-signin') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/login?next=%2Fshow%2Fsp1');
  });

  it('links signed-out visitors to plain login when no loginNext is given', () => {
    render(<ShowFollowButton spaceId="sp1" showTitle="The Weekly Show" isAuthenticated={false} following={false} />);
    const link = screen.getByTestId('follow-show-signin') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/login');
  });

  it('turns the follow on and off through the API', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ following: true }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ following: false }) });
    const onChange = vi.fn();
    render(
      <ShowFollowButton spaceId="sp1" showTitle="The Weekly Show" isAuthenticated following={false} onChange={onChange} />
    );
    const btn = screen.getByTestId('follow-show-button');
    expect(btn.textContent).toMatch(/follow the weekly show/i);
    fireEvent.click(btn);
    await waitFor(() => expect(btn.textContent).toMatch(/following the weekly show/i));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/spaces/sp1/follow',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ on: true }) })
    );
    expect(onChange).toHaveBeenCalledWith(true);
    fireEvent.click(btn);
    await waitFor(() => expect(btn.textContent).toMatch(/follow the weekly show/i));
    expect(JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body))).toEqual({ on: false });
  });

  it('shows the server error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ message: 'nope' }) });
    render(<ShowFollowButton spaceId="sp1" showTitle="The Weekly Show" isAuthenticated following={false} />);
    fireEvent.click(screen.getByTestId('follow-show-button'));
    await waitFor(() => expect(screen.getByTestId('follow-show-error').textContent).toBe('nope'));
  });
});
