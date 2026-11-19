// tests/components/space-room.test.tsx
//
// Joining a show as a listener must not request the microphone: the browser
// permission prompt belongs to joining (or being invited to) the stage.
//
// On a real join the microphone request comes from the LiveKit room wrapper:
// `LiveKitRoom`'s `audio` prop ("publish audio immediately after connecting")
// is applied through `localParticipant.setMicrophoneEnabled`, which captures
// the microphone via getUserMedia — the browser permission prompt — before
// any publish-rights check. The livekit-client SDK cannot run under
// happy-dom (it needs RTCPeerConnection/MediaStream, see
// tests/integration/livekit-two-clients.test.ts), so these tests mount
// SpaceRoom against a fake LiveKit boundary that mirrors that documented
// on-connect contract, and record what the local participant is asked to do.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

/**
 * Everything the mocked LiveKit boundary needs, hoisted so the `vi.mock`
 * factories (which lift above the imports) can close over it.
 */
const boundary = vi.hoisted(() => {
  /** Every `setMicrophoneEnabled(enabled)` call, in order. */
  const micCalls: boolean[] = [];
  /** How many times the mocked LiveKitRoom completed a connect. */
  let connects = 0;

  interface FakeHandler {
    (...args: unknown[]): void;
  }

  /**
   * Minimal stand-in for livekit-client's Room: an event emitter holding a
   * local participant whose setMicrophoneEnabled is the recorder under test.
   */
  class FakeRoom {
    readonly localParticipant = {
      identity: '',
      isMicrophoneEnabled: false,
      isSpeaking: false,
      setMicrophoneEnabled: async (
        enabled: boolean,
        ..._rest: unknown[]
      ): Promise<void> => {
        micCalls.push(enabled);
      },
      setAttributes: async (): Promise<void> => {},
    };
    private readonly handlers = new Map<string, Set<FakeHandler>>();

    constructor(_options: unknown) {}

    on(event: string, handler: FakeHandler): this {
      const set = this.handlers.get(event) ?? new Set<FakeHandler>();
      set.add(handler);
      this.handlers.set(event, set);
      return this;
    }

    once(event: string, handler: FakeHandler): this {
      const wrapped: FakeHandler = (...args: unknown[]) => {
        this.off(event, wrapped);
        handler(...args);
      };
      return this.on(event, wrapped);
    }

    off(event: string, handler: FakeHandler): this {
      this.handlers.get(event)?.delete(handler);
      return this;
    }

    emit(event: string): boolean {
      for (const handler of this.handlers.get(event) ?? []) {
        handler();
      }
      return true;
    }

    disconnect(): void {
      /* test double */
    }
  }

  /** The event-name constants SpaceRoom reads off livekit-client. */
  const RoomEvent = {
    Connected: 'connected',
    Disconnected: 'disconnected',
    Reconnecting: 'reconnecting',
    Reconnected: 'reconnected',
    SignalConnected: 'signalConnected',
    DataReceived: 'dataReceived',
    ParticipantPermissionsChanged: 'participantPermissionsChanged',
    ParticipantAttributesChanged: 'participantAttributesChanged',
  } as const;

  const Track = {
    Source: {
      Microphone: 'microphone',
      Camera: 'camera',
      ScreenShare: 'screen_share',
      Unknown: 'unknown',
    },
  };

  return {
    FakeRoom,
    RoomEvent,
    Track,
    micCalls,
    connectCount: (): number => connects,
    noteConnect: (): void => {
      connects += 1;
    },
    reset: (): void => {
      micCalls.length = 0;
      connects = 0;
    },
  };
});

vi.mock('livekit-client', () => ({
  Room: boundary.FakeRoom,
  RoomEvent: boundary.RoomEvent,
  Track: boundary.Track,
}));

/** The instance type of the hoisted FakeRoom class. */
type FakeRoom = InstanceType<typeof boundary.FakeRoom>;

vi.mock('@livekit/components-react', async () => {
  const React = await import('react');

  const RoomContext = React.createContext<FakeRoom | null>(null);

  interface MockLiveKitRoomProps {
    room?: FakeRoom;
    token?: string;
    serverUrl?: string;
    connect?: boolean;
    audio?: boolean | Record<string, unknown>;
    children?: ReactNode;
    onConnected?: () => void;
    onError?: (error: Error) => void;
  }

  /**
   * Mirrors the real LiveKitRoom contract for the props SpaceRoom uses: on
   * connect the audio prop is applied by enabling the local microphone once
   * the signal round-trip completes (RoomEvent.SignalConnected), exactly as
   * the component's useRoom hook does.
   */
  function MockLiveKitRoom({
    room,
    token,
    connect,
    audio,
    children,
    onConnected,
    onError,
  }: MockLiveKitRoomProps): ReactElement {
    React.useEffect(() => {
      if (!room || !connect || !token) return;
      const applyTracks = (): void => {
        void Promise.all([
          room.localParticipant.setMicrophoneEnabled(
            Boolean(audio),
            typeof audio !== 'boolean' ? audio : undefined
          ),
        ]).catch((error: unknown) => {
          onError?.(error instanceof Error ? error : new Error('Track error.'));
        });
      };
      room.on(boundary.RoomEvent.SignalConnected, applyTracks);
      void Promise.resolve().then(() => {
        room.emit(boundary.RoomEvent.SignalConnected);
        room.emit(boundary.RoomEvent.Connected);
        boundary.noteConnect();
        onConnected?.();
      });
      return () => {
        room.off(boundary.RoomEvent.SignalConnected, applyTracks);
      };
    }, [room, connect, token, audio, onConnected, onError]);

    return React.createElement(
      RoomContext.Provider,
      { value: room ?? null },
      children
    );
  }

  return {
    LiveKitRoom: MockLiveKitRoom,
    RoomAudioRenderer: (): null => null,
    useRoomContext: (): FakeRoom | null => React.useContext(RoomContext),
    // Reads the room out of the same context the real hook does, so the
    // local participant is available to the components under test (as it
    // is inside the real LiveKitRoom) instead of always being null.
    useLocalParticipant: (): { localParticipant: unknown } => ({
      localParticipant: React.useContext(RoomContext)?.localParticipant ?? null,
    }),
    useParticipants: (): unknown[] => [],
    useTracks: (): unknown[] => [],
  };
});

import { SpaceRoom } from '@/components/SpaceRoom';
import type { SpaceRoomProps } from '@/components/SpaceRoom';

function baseProps(overrides: Partial<SpaceRoomProps> = {}): SpaceRoomProps {
  return {
    token: 'token',
    wsUrl: 'wss://livekit.example.com',
    role: 'audience',
    identity: 'did:plc:listener1',
    title: 'Test show',
    host: { handle: 'host.bsky.social' },
    shareableUrl: 'https://rabble.example/show/sp1',
    posts: [],
    postsError: null,
    onPostAdded: () => {},
    isLive: true,
    onLiveChange: () => {},
    spaceId: 'sp1',
    ...overrides,
  };
}

beforeEach(() => {
  boundary.reset();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
    })) as unknown as typeof fetch
  );
});

/** Wait until the mocked LiveKitRoom has connected, then let the on-connect
 * track setup (and anything it triggers) settle. */
async function connectAndSettle(): Promise<void> {
  await waitFor(() => {
    expect(boundary.connectCount()).toBe(1);
  });
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  });
}

describe('<SpaceRoom /> microphone on join', () => {
  it('never enables the microphone when a listener joins', async () => {
    render(<SpaceRoom {...baseProps({ role: 'audience' })} />);

    await connectAndSettle();

    // The reported bug: joining in listening mode asks for the microphone.
    // The on-connect track setup still passes `false` through
    // setMicrophoneEnabled — the real useRoom hook always does, and a
    // disable never captures the microphone — so what must hold is that no
    // call *enables* it (an enable is the getUserMedia permission prompt).
    expect(boundary.micCalls).not.toContain(true);
  });

  it('enables the microphone when the host joins', async () => {
    render(<SpaceRoom {...baseProps({ role: 'host', isHost: true })} />);

    await connectAndSettle();

    // The host is expected on stage, so their microphone is published.
    expect(boundary.micCalls).toContain(true);
  });
});
