// tests/components/show-ended-follow-popup.test.tsx

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ShowEndedFollowPopup } from '@/components/ShowEndedFollowPopup';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ShowEndedFollowPopup', () => {
  it('invites a listener to follow the host and lets the toggle work', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ following: true }) });
    render(
      <ShowEndedFollowPopup
        hostDid="did:h"
        hostName="@host"
        isAuthenticated
        following={false}
        onClose={() => {}}
      />
    );
    expect(screen.getByTestId('show-ended-follow-dialog')).toHaveTextContent('The show has ended');
    const btn = screen.getByTestId('follow-host-button');
    expect(btn.textContent).toMatch(/follow @host/i);
    fireEvent.click(btn);
    await waitFor(() => expect(btn.textContent).toMatch(/following @host/i));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/hosts/did%3Ah/follow',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ on: true }) })
    );
  });

  it('sends a signed-out listener to login instead of toggling the follow', () => {
    render(
      <ShowEndedFollowPopup
        hostDid="did:h"
        hostName="@host"
        isAuthenticated={false}
        following={false}
        loginNext="/show/sp1"
        onClose={() => {}}
      />
    );
    const link = screen.getByTestId('follow-host-signin') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/login?next=%2Fshow%2Fsp1');
  });

  it('closes on the close button and on a backdrop click', () => {
    const onClose = vi.fn();
    render(
      <ShowEndedFollowPopup
        hostDid="did:h"
        hostName="@host"
        isAuthenticated
        following={false}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByTestId('show-ended-follow-close'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.mouseDown(screen.getByTestId('show-ended-follow-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
