// tests/components/space-room.test.tsx
//
// Joining a show as a listener must not request the microphone: the browser
// permission prompt belongs to joining (or being invited to) the stage.
//
// SpaceRoom no longer owns the LiveKit connection (ActiveRoomProvider does,
// so it survives navigating away from the page — see issue #7); it only
// consumes the ambient room via `useRoomContext()`. The mic-on-join contract
// now lives entirely in `HostAutoUnmute`, which enables the microphone once
// per mount when (and only when) the role is 'host'. These tests mount
// SpaceRoom against a fake LiveKit boundary and record what the local
// participant is asked to do.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act, fireEvent } from '@testing-library/react';

/**
 * Everything the mocked LiveKit boundary needs, hoisted so the `vi.mock`
 * factories (which lift above the imports) can close over it.
 */
const boundary = vi.hoisted(() => {
  /** Every `setMicrophoneEnabled(enabled)` call, in order. */
  const micCalls: boolean[] = [];

  interface FakeHandler {
    (...args: unknown[]): void;
  }

  /** Minimal stand-in for livekit-client's Room, already "connected". */
  class FakeRoom {
    readonly localParticipant = {
      identity: '',
      isMicrophoneEnabled: false,
      isSpeaking: false,
      setMicrophoneEnabled: async (enabled: boolean): Promise<void> => {
        micCalls.push(enabled);
      },
      setAttributes: async (): Promise<void> => {},
    };
    private readonly handlers = new Map<string, Set<FakeHandler>>();

    on(event: string, handler: FakeHandler): this {
      const set = this.handlers.get(event) ?? new Set<FakeHandler>();
      set.add(handler);
      this.handlers.set(event, set);
      return this;
    }

    off(event: string, handler: FakeHandler): this {
      this.handlers.get(event)?.delete(handler);
      return this;
    }

    disconnect(): void {
      /* test double */
    }
  }

  return {
    FakeRoom,
    micCalls,
    reset: (): void => {
      micCalls.length = 0;
    },
  };
});

vi.mock('livekit-client', () => ({
  RoomEvent: {
    Connected: 'connected',
    Disconnected: 'disconnected',
    Reconnecting: 'reconnecting',
    Reconnected: 'reconnected',
    DataReceived: 'dataReceived',
    ParticipantPermissionsChanged: 'participantPermissionsChanged',
    ParticipantAttributesChanged: 'participantAttributesChanged',
  },
  Track: {
    Source: {
      Microphone: 'microphone',
      Camera: 'camera',
      ScreenShare: 'screen_share',
      Unknown: 'unknown',
    },
  },
}));

/** The instance type of the hoisted FakeRoom class. */
type FakeRoom = InstanceType<typeof boundary.FakeRoom>;

/** Set by each test before rendering, read by the mocked hooks below. */
let activeFakeRoom: FakeRoom | null = null;

/** Mic tracks the room currently has published; set per test. */
let activeMicTracks: unknown[] = [];

/** Remote participants `useParticipants()` returns; set per test. */
let activeParticipants: unknown[] = [];

vi.mock('@livekit/components-react', () => ({
  useRoomContext: (): FakeRoom => {
    if (!activeFakeRoom) throw new Error('No room provided in this test.');
    return activeFakeRoom;
  },
  useLocalParticipant: (): { localParticipant: unknown } => ({
    localParticipant: activeFakeRoom?.localParticipant ?? null,
  }),
  useParticipants: (): unknown[] => activeParticipants,
  useTracks: (): unknown[] => activeMicTracks,
}));

vi.mock('@/components/ActiveRoomProvider', async () => {
  const actual = await vi.importActual<typeof import('@/components/ActiveRoomProvider')>(
    '@/components/ActiveRoomProvider'
  );
  return {
    ...actual,
    useActiveRoom: () => ({
      session: null,
      connectionError: null,
      join: vi.fn(),
      leave: vi.fn(),
      setLive: vi.fn(),
      setTitle: vi.fn(),
    }),
  };
});

import { SpaceRoom } from '@/components/SpaceRoom';
import type { SpaceRoomProps } from '@/components/SpaceRoom';

function baseProps(overrides: Partial<SpaceRoomProps> = {}): SpaceRoomProps {
  return {
    role: 'audience',
    identity: 'did:plc:listener1',
    title: 'Test show',
    host: { did: 'did:plc:host1', handle: 'host.bsky.social' },
    shareableUrl: 'https://rabble.example/show/sp1',
    isLive: true,
    onLiveChange: () => {},
    spaceId: 'sp1',
    ...overrides,
  };
}

beforeEach(() => {
  boundary.reset();
  activeFakeRoom = new boundary.FakeRoom();
  activeMicTracks = [];
  activeParticipants = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
    })) as unknown as typeof fetch
  );
});

describe('<SpaceRoom /> microphone on join', () => {
  it('never enables the microphone when a listener joins', async () => {
    render(<SpaceRoom {...baseProps({ role: 'audience' })} />);

    // Let effects settle (HostAutoUnmute only acts for the host, so a
    // listener's local participant should never be told to unmute).
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    });

    expect(boundary.micCalls).not.toContain(true);
  });

  it('enables the microphone when the host joins', async () => {
    render(<SpaceRoom {...baseProps({ role: 'host', isHost: true })} />);

    await waitFor(() => {
      expect(boundary.micCalls).toContain(true);
    });
  });

  it('does not re-enable a muted host\'s microphone on remount of the same room', async () => {
    // The room survives navigating away from the studio page (issue #7);
    // SpaceRoom itself does not. Reusing the same `activeFakeRoom` across
    // an unmount/remount mirrors a host leaving and returning while still
    // connected.
    const { unmount } = render(
      <SpaceRoom {...baseProps({ role: 'host', isHost: true })} />
    );
    await waitFor(() => expect(boundary.micCalls).toContain(true));

    // The host deliberately muted before navigating away; only the call
    // count is reset so the assertion below is about the remount, not the
    // first mount.
    boundary.reset();
    unmount();

    render(<SpaceRoom {...baseProps({ role: 'host', isHost: true })} />);
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    });

    expect(boundary.micCalls).not.toContain(true);
  });
});

describe('<SpaceRoom /> leave dialog warns the last one on stage', () => {
  it('warns a solo live host that leaving will take the show off air', async () => {
    activeParticipants = [];

    const { getByTestId } = render(
      <SpaceRoom {...baseProps({ role: 'host', isHost: true, isLive: true })} />
    );

    fireEvent.click(getByTestId('bottom-bar-leave'));
    expect(getByTestId('leave-dialog')).toHaveTextContent(
      "You're the last one on stage. Leaving will take the show off air."
    );
  });

  it('does not warn a live host when a co-host is still on stage', async () => {
    activeParticipants = [
      {
        identity: 'did:plc:cohost',
        isLocal: false,
        permissions: { canPublish: true },
      },
    ];

    const { getByTestId } = render(
      <SpaceRoom {...baseProps({ role: 'host', isHost: true, isLive: true })} />
    );

    fireEvent.click(getByTestId('bottom-bar-leave'));
    expect(getByTestId('leave-dialog')).toHaveTextContent(
      'The show stays open and you can come back from your shows list.'
    );
  });

  it('does not warn when the show is already off air', async () => {
    activeParticipants = [];

    const { getByTestId } = render(
      <SpaceRoom {...baseProps({ role: 'host', isHost: true, isLive: false })} />
    );

    fireEvent.click(getByTestId('bottom-bar-leave'));
    expect(getByTestId('leave-dialog')).toHaveTextContent(
      'The show stays open and you can come back from your shows list.'
    );
  });
});

describe('<SpaceRoom /> pre-show music follows on-air state', () => {
  it("mutes a solo host's own pre-show music the moment their mic goes live (issue #5)", async () => {
    // Only the local participant (the host) is publishing a mic track; the
    // music must stop on this device too, not just for remote listeners.
    activeMicTracks = [{ publication: {}, participant: { isLocal: true } }];

    const { findByTestId } = render(
      <SpaceRoom {...baseProps({ role: 'host', isHost: true, isLive: true, musicMood: 'lounge' })} />
    );

    const music = await findByTestId('pre-show-music');
    expect(music.getAttribute('data-playing')).toBe('false');
  });

  it('keeps the demo-show mood playing while live if nobody is actually publishing audio', async () => {
    activeMicTracks = [];

    const { findByTestId } = render(
      <SpaceRoom {...baseProps({ role: 'audience', isHost: false, isLive: true, musicMood: 'lounge' })} />
    );

    const music = await findByTestId('pre-show-music');
    expect(music.getAttribute('data-playing')).toBe('true');
  });

  it('resumes the selected mood automatically once the show goes back off air', async () => {
    activeMicTracks = [{ publication: {}, participant: { isLocal: true } }];

    const { findByTestId } = render(
      <SpaceRoom {...baseProps({ role: 'host', isHost: true, isLive: false, musicMood: 'lounge' })} />
    );

    const music = await findByTestId('pre-show-music');
    expect(music.getAttribute('data-playing')).toBe('true');
  });
});

describe('<SpaceRoom /> show-ended follow popup (issue #22)', () => {
  it('offers a listener who was in the room to follow the host once the show ends', () => {
    const { getByTestId, rerender } = render(
      <SpaceRoom {...baseProps({ role: 'audience', isLive: true })} />
    );

    expect(() => getByTestId('show-ended-follow-dialog')).toThrow();

    rerender(<SpaceRoom {...baseProps({ role: 'audience', isLive: false })} />);

    expect(getByTestId('show-ended-follow-dialog')).toHaveTextContent('host.bsky.social');
  });

  it('does not offer the popup to the host themselves', () => {
    const { getByTestId, rerender } = render(
      <SpaceRoom {...baseProps({ role: 'host', isHost: true, isLive: true })} />
    );

    rerender(<SpaceRoom {...baseProps({ role: 'host', isHost: true, isLive: false })} />);

    expect(() => getByTestId('show-ended-follow-dialog')).toThrow();
  });

  it('does not show the popup to someone who joins a room that is already off air', () => {
    const { getByTestId } = render(
      <SpaceRoom {...baseProps({ role: 'audience', isLive: false })} />
    );

    expect(() => getByTestId('show-ended-follow-dialog')).toThrow();
  });

  it('lets the listener dismiss the popup', () => {
    const { getByTestId, rerender } = render(
      <SpaceRoom {...baseProps({ role: 'audience', isLive: true })} />
    );
    rerender(<SpaceRoom {...baseProps({ role: 'audience', isLive: false })} />);
    expect(getByTestId('show-ended-follow-dialog')).toBeTruthy();

    fireEvent.click(getByTestId('show-ended-follow-close'));
    expect(() => getByTestId('show-ended-follow-dialog')).toThrow();
  });
});

describe('<SpaceRoom /> show details editing while live (issue #53)', () => {
  it('hides the editable show details from the host once the show is live', () => {
    const { queryByTestId } = render(
      <SpaceRoom {...baseProps({ role: 'host', isHost: true, isLive: true })} />
    );

    expect(queryByTestId('show-details-form')).toBeNull();
  });

  it('still lets the host edit show details before the show goes live', () => {
    const { getByTestId } = render(
      <SpaceRoom {...baseProps({ role: 'host', isHost: true, isLive: false })} />
    );

    expect(getByTestId('show-details-form')).toBeTruthy();
  });
});
