// tests/components/follow-host-button.test.tsx

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FollowHostButton } from '@/components/FollowHostButton';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('FollowHostButton', () => {
  it('links signed-out visitors to login', () => {
    render(
      <FollowHostButton hostDid="did:h" hostName="@host" isAuthenticated={false} following={false} loginNext="/show/sp1" />
    );
    const link = screen.getByTestId('follow-host-signin') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/login?next=%2Fshow%2Fsp1');
  });

  it('links signed-out visitors to plain login when no loginNext is given', () => {
    render(<FollowHostButton hostDid="did:h" hostName="@host" isAuthenticated={false} following={false} />);
    const link = screen.getByTestId('follow-host-signin') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/login');
  });

  it('turns the follow on and off through the API', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ following: true }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ following: false }) });
    const onChange = vi.fn();
    render(
      <FollowHostButton hostDid="did:h" hostName="@host" isAuthenticated following={false} onChange={onChange} />
    );
    const btn = screen.getByTestId('follow-host-button');
    expect(btn.textContent).toMatch(/follow @host/i);
    fireEvent.click(btn);
    await waitFor(() => expect(btn.textContent).toMatch(/following @host/i));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/hosts/did%3Ah/follow',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ on: true }) })
    );
    expect(onChange).toHaveBeenCalledWith(true);
    fireEvent.click(btn);
    await waitFor(() => expect(btn.textContent).toMatch(/follow @host/i));
    expect(JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body))).toEqual({ on: false });
  });

  it('shows the server error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ message: 'nope' }) });
    render(<FollowHostButton hostDid="did:h" hostName="@host" isAuthenticated following={false} />);
    fireEvent.click(screen.getByTestId('follow-host-button'));
    await waitFor(() => expect(screen.getByTestId('follow-host-error').textContent).toBe('nope'));
  });
});
