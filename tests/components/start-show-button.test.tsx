// tests/components/start-show-button.test.tsx
//
// One tap creates an off-air show, hands the host token to the show page
// through sessionStorage, and navigates there.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { StartShowButton } from '@/components/StartShowButton';

beforeEach(() => {
  pushMock.mockReset();
  sessionStorage.clear();
});

describe('<StartShowButton />', () => {
  it('creates a show with startNow and jumps into the room', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        space: { id: 'sp-new' },
        startNow: true,
        token: 'jwt',
        wsUrl: 'wss://livekit.example',
        role: 'host',
        roomName: 'space-sp-new',
        identity: 'did:plc:me',
        handle: 'me.bsky.social',
        displayName: 'Me',
        avatarUrl: null,
      }),
    }) as unknown as typeof fetch;

    render(<StartShowButton />);
    fireEvent.click(screen.getByTestId('start-show-button'));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/show/sp-new'));
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/spaces');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ startNow: true });
    const stored = JSON.parse(sessionStorage.getItem('rabble_join_sp-new') ?? '{}');
    expect(stored.token).toBe('jwt');
    expect(stored.role).toBe('host');
  });

  it('surfaces an error when the request fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'token_failed', message: 'LiveKit is down' }),
    }) as unknown as typeof fetch;

    render(<StartShowButton />);
    fireEvent.click(screen.getByTestId('start-show-button'));
    await waitFor(() =>
      expect(screen.getByTestId('start-show-error')).toHaveTextContent('LiveKit is down')
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('sends signed-out users to login', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'unauthorized' }),
    }) as unknown as typeof fetch;

    render(<StartShowButton />);
    fireEvent.click(screen.getByTestId('start-show-button'));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login?next=%2Fme'));
  });

  it('is a 44px touch target', () => {
    render(<StartShowButton />);
    expect(screen.getByTestId('start-show-button').className).toContain('min-h-touch');
  });
});

describe('<StartShowButton spaceId />', () => {
  it('asks the API to reopen that show', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ space: { id: 'sp2' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<StartShowButton spaceId="sp2" label="Start a session" />);
    fireEvent.click(screen.getByTestId('start-show-button'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ startNow: true, spaceId: 'sp2' });
    vi.unstubAllGlobals();
  });
});
