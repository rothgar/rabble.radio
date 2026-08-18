// tests/components/create-space-form.test.tsx
//
// Exercises the CreateSpaceForm UI:
// - Default mode is "Start now" with no schedule input visible.
// - The caret button opens a dropdown exposing "Schedule for later", which
//   switches the form into schedule mode and reveals the datetime input.
// - Default schedule value is the next local 15-minute boundary.
// - Submitting in now mode POSTs { title, description, startNow: true } and
//   stores the join payload in sessionStorage under
//   `rabble_join_<spaceId>` before navigating to /space/<id>.
// - Submitting in schedule mode POSTs { title, description, scheduledAt }
//   and navigates to /spaces.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { CreateSpaceForm } from '@/components/CreateSpaceForm';

const SPACE_ID = 'sp-create-now';
const NOW_SPACE = {
  id: SPACE_ID,
  slug: 'sp-create-now',
  title: 'Test',
  description: null,
  isLive: true,
  status: 'live',
  scheduledAt: null,
  expiresAt: null,
  createdAt: '2025-02-01T00:00:00.000Z',
  updatedAt: '2025-02-01T00:00:00.000Z',
  host: {
    did: 'did:plc:abc',
    handle: 'host.bsky.social',
    displayName: 'Host',
    avatarUrl: null,
  },
  shareableUrl: 'https://rabble.example/space/sp-create-now',
};

const SCHEDULED_SPACE = {
  ...NOW_SPACE,
  id: 'sp-create-sched',
  slug: 'sp-create-sched',
  status: 'scheduled',
  isLive: false,
  scheduledAt: '2025-02-02T15:00:00.000Z',
  shareableUrl: 'https://rabble.example/space/sp-create-sched',
};

beforeEach(() => {
  pushMock.mockReset();
  sessionStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchSequence(
  responses: Array<{ ok: boolean; status?: number; body: unknown }>
) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let i = 0;
  global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = responses[i] ?? responses[responses.length - 1];
    i += 1;
    return {
      ok: next.ok,
      status: next.status ?? (next.ok ? 200 : 500),
      json: async () => next.body,
    } as Response;
  }) as unknown as typeof fetch;
  return calls;
}

function setTitle(value: string) {
  fireEvent.change(screen.getByTestId('title-input'), {
    target: { value },
  });
}

function setDescription(value: string) {
  fireEvent.change(screen.getByTestId('description-input'), {
    target: { value },
  });
}

function submit() {
  fireEvent.click(screen.getByTestId('submit-button'));
}

describe('<CreateSpaceForm />', () => {
  it('defaults to Start now mode and hides the schedule input', () => {
    render(<CreateSpaceForm />);
    const submit = screen.getByTestId('submit-button');
    expect(submit).toHaveTextContent('Start now');
    expect(screen.queryByTestId('schedule-input')).not.toBeInTheDocument();
  });

  it('opens the dropdown and switches to schedule mode', () => {
    render(<CreateSpaceForm />);
    fireEvent.click(screen.getByTestId('caret-button'));
    const menu = screen.getByTestId('schedule-menu');
    expect(menu).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('schedule-menu-item'));
    expect(screen.getByTestId('schedule-input')).toBeInTheDocument();
    // Closing the dropdown on outside click.
    fireEvent.click(screen.getByTestId('caret-button'));
    expect(screen.getByTestId('schedule-menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('schedule-menu')).not.toBeInTheDocument();
  });

  it('closes the dropdown when Escape is pressed', () => {
    render(<CreateSpaceForm />);
    fireEvent.click(screen.getByTestId('caret-button'));
    expect(screen.getByTestId('schedule-menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('schedule-menu')).not.toBeInTheDocument();
  });

  it('uses a 15-minute boundary as the default schedule value', () => {
    render(<CreateSpaceForm />);
    fireEvent.click(screen.getByTestId('caret-button'));
    fireEvent.click(screen.getByTestId('schedule-menu-item'));
    const input = screen.getByTestId(
      'schedule-input'
    ) as HTMLInputElement;
    expect(input).toHaveAttribute('step', '900');
    expect(input.value).not.toBe('');
    // The value is formatted as YYYY-MM-DDTHH:mm; the minute portion must
    // be a multiple of 15.
    const value = input.value;
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    const minutes = Number(value.slice(14, 16));
    expect(minutes % 15).toBe(0);
    // And the default must be in the future relative to now.
    const candidate = new Date(value);
    expect(candidate.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('POSTs startNow: true in now mode, stores join payload, and navigates to the space', async () => {
    const calls = mockFetchSequence([
      {
        ok: true,
        status: 200,
        body: {
          space: NOW_SPACE,
          startNow: true,
          token: 'jwt',
          wsUrl: 'wss://livekit.example.com',
          role: 'host',
          roomName: 'space-room',
          identity: 'did:plc:abc',
          handle: 'host.bsky.social',
          displayName: 'Host',
          avatarUrl: 'https://cdn.example/avatar.png',
        },
      },
    ]);

    render(<CreateSpaceForm />);
    setTitle('My space');
    setDescription('A description');
    submit();

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(`/space/${SPACE_ID}`);
    });
    expect(calls).toHaveLength(1);
    const init = calls[0].init;
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      title: 'My space',
      description: 'A description',
      startNow: true,
    });
    const stored = sessionStorage.getItem(`rabble_join_${SPACE_ID}`);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!)).toEqual({
      token: 'jwt',
      wsUrl: 'wss://livekit.example.com',
      role: 'host',
      roomName: 'space-room',
      identity: 'did:plc:abc',
      handle: 'host.bsky.social',
      displayName: 'Host',
      avatarUrl: 'https://cdn.example/avatar.png',
    });
  });

  it('POSTs scheduledAt in schedule mode and navigates to /spaces', async () => {
    const calls = mockFetchSequence([
      { ok: true, status: 201, body: { space: SCHEDULED_SPACE } },
    ]);

    render(<CreateSpaceForm />);
    setTitle('Scheduled space');
    fireEvent.click(screen.getByTestId('caret-button'));
    fireEvent.click(screen.getByTestId('schedule-menu-item'));
    const input = screen.getByTestId(
      'schedule-input'
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2030-01-15T14:30' } });
    submit();

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/spaces');
    });
    expect(calls).toHaveLength(1);
    const body = JSON.parse(String(calls[0].init?.body)) as {
      title: string;
      scheduledAt: string;
    };
    expect(body.title).toBe('Scheduled space');
    expect(typeof body.scheduledAt).toBe('string');
    const parsed = new Date(body.scheduledAt);
    expect(parsed.toISOString()).toBe(body.scheduledAt);
    // And there must be no join payload stored for scheduled spaces.
    expect(sessionStorage.getItem(`rabble_join_${SPACE_ID}`)).toBeNull();
  });
});
