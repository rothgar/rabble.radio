// tests/components/admin-user-actions.test.tsx

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminUserActions } from '@/components/AdminUserActions';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(window.location, 'reload').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AdminUserActions', () => {
  it('kicks without a confirmation prompt', async () => {
    render(<AdminUserActions did="did:plc:a" bannedAt={null} />);
    fireEvent.click(screen.getByTestId('admin-kick-did:plc:a'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/users',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ did: 'did:plc:a', action: 'kick', reason: undefined }),
      })
    );
    await waitFor(() => expect(window.location.reload).toHaveBeenCalled());
  });

  it('bans only after confirming, sending the typed reason', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.stubGlobal('prompt', vi.fn(() => 'spam'));
    render(<AdminUserActions did="did:plc:a" bannedAt={null} />);
    fireEvent.click(screen.getByTestId('admin-ban-did:plc:a'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/users',
      expect.objectContaining({
        body: JSON.stringify({ did: 'did:plc:a', action: 'ban', reason: 'spam' }),
      })
    );
  });

  it('does not call the API when the ban confirmation is declined', () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    render(<AdminUserActions did="did:plc:a" bannedAt={null} />);
    fireEvent.click(screen.getByTestId('admin-ban-did:plc:a'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows Unban instead of Ban for an already-banned user', () => {
    render(<AdminUserActions did="did:plc:a" bannedAt="2026-11-18T00:00:00.000Z" />);
    expect(screen.getByTestId('admin-unban-did:plc:a')).toBeTruthy();
    expect(screen.queryByTestId('admin-ban-did:plc:a')).toBeFalsy();
  });

  it('shows an error message when the request fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'not_found' }) });
    render(<AdminUserActions did="did:plc:a" bannedAt="2026-11-18T00:00:00.000Z" />);
    fireEvent.click(screen.getByTestId('admin-unban-did:plc:a'));
    await waitFor(() => expect(screen.getByTestId('admin-user-error-did:plc:a').textContent).toBe('not_found'));
  });
});
