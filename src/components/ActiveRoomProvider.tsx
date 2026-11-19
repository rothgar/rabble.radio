'use client';

// src/components/ActiveRoomProvider.tsx
//
// Owns the LiveKit `Room` connection for whichever show the user has
// joined, independent of which page is on screen. Mounted once in the root
// layout (src/app/layout.tsx), so it survives client-side navigation: the
// room stays connected (and, for the host, still publishing) after the user
// clicks away from /show/[id]. SpacePageClient calls `join`/`leave` instead
// of owning the connection itself; SpaceRoom reads the ambient room via
// `useRoomContext()` instead of creating one. PersistentShowBar renders the
// sticky "you're still live" bar on every other route.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactElement, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { RoomContext, RoomAudioRenderer } from '@livekit/components-react';
import { Room } from 'livekit-client';

export type SpaceRole = 'host' | 'audience';

export interface ActiveRoomSession {
  spaceId: string;
  identity: string;
  role: SpaceRole;
  isHost: boolean;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  anonymous: boolean;
  title: string;
  host: {
    handle: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  shareableUrl: string;
  isLive: boolean;
}

export interface JoinPayload {
  spaceId: string;
  token: string;
  wsUrl: string;
  role: SpaceRole;
  identity: string;
  isHost: boolean;
  handle: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  anonymous?: boolean;
  /** Per-join STUN/TURN servers; absent when no relay is configured. */
  iceServers?: RTCIceServer[];
  title: string;
  host: {
    handle: string;
    displayName?: string | null;
    avatarUrl?: string | null;
  };
  shareableUrl: string;
  isLive: boolean;
}

interface ActiveRoomContextValue {
  session: ActiveRoomSession | null;
  /** Set when the connect attempt itself failed (bad token, no network). */
  connectionError: string | null;
  /**
   * True once there is a connected session and the current route isn't the
   * session's own /show/[id] page — the one place that already has full
   * room controls. Anything that reserves space for, or coordinates with,
   * PersistentShowBar (its own visibility, ReminderToasts' position, page
   * bottom padding) reads this single flag rather than re-deriving it.
   */
  barVisible: boolean;
  join: (payload: JoinPayload) => void;
  leave: () => void;
  setLive: (isLive: boolean) => void;
  setTitle: (title: string) => void;
}

const ActiveRoomContext = createContext<ActiveRoomContextValue | null>(null);

export function useActiveRoom(): ActiveRoomContextValue {
  const ctx = useContext(ActiveRoomContext);
  if (!ctx) {
    throw new Error('useActiveRoom must be used within an ActiveRoomProvider');
  }
  return ctx;
}

export function ActiveRoomProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const [session, setSession] = useState<ActiveRoomSession | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const roomRef = useRef<Room | null>(null);

  const leave = useCallback(() => {
    roomRef.current?.disconnect();
    roomRef.current = null;
    setRoom(null);
    setSession(null);
    setConnectionError(null);
  }, []);

  const join = useCallback((payload: JoinPayload) => {
    // A user can only be in one room at a time: drop whatever we were
    // previously connected to before starting the new one.
    roomRef.current?.disconnect();

    const next = new Room({
      adaptiveStream: true,
      dynacast: true,
      ...(payload.iceServers && payload.iceServers.length > 0
        ? { rtcConfig: { iceServers: payload.iceServers } }
        : {}),
    });
    roomRef.current = next;

    setConnectionError(null);
    setRoom(next);
    setSession({
      spaceId: payload.spaceId,
      identity: payload.identity,
      role: payload.role,
      isHost: payload.isHost,
      handle: payload.handle,
      displayName: payload.displayName ?? null,
      avatarUrl: payload.avatarUrl ?? null,
      anonymous: payload.anonymous === true,
      title: payload.title,
      host: {
        handle: payload.host.handle,
        displayName: payload.host.displayName ?? null,
        avatarUrl: payload.host.avatarUrl ?? null,
      },
      shareableUrl: payload.shareableUrl,
      isLive: payload.isLive,
    });

    next.connect(payload.wsUrl, payload.token).catch((err: unknown) => {
      // A later join (or leave) already replaced this room; ignore the stale rejection.
      if (roomRef.current !== next) return;
      setConnectionError(
        err instanceof Error ? err.message : 'Connection error.'
      );
    });
  }, []);

  const setLive = useCallback((isLive: boolean) => {
    setSession((prev) => (prev ? { ...prev, isLive } : prev));
  }, []);

  const setTitle = useCallback((title: string) => {
    setSession((prev) => (prev ? { ...prev, title } : prev));
  }, []);

  const pathname = usePathname();
  const barVisible =
    session !== null &&
    connectionError === null &&
    pathname !== `/show/${encodeURIComponent(session.spaceId)}`;

  const value = useMemo<ActiveRoomContextValue>(
    () => ({ session, connectionError, barVisible, join, leave, setLive, setTitle }),
    [session, connectionError, barVisible, join, leave, setLive, setTitle]
  );

  return (
    <ActiveRoomContext.Provider value={value}>
      <RoomContext.Provider value={room ?? undefined}>
        {/* Reserves space so PersistentShowBar (fixed, bottom-0) never
            covers page content sitting at the bottom of the viewport;
            harmless on the children's own fixed-position descendants
            (the bar itself, ReminderToasts), which padding on this
            non-positioned wrapper does not affect. */}
        <div className={barVisible ? 'pb-24' : undefined}>{children}</div>
        {room ? <RoomAudioRenderer /> : null}
      </RoomContext.Provider>
    </ActiveRoomContext.Provider>
  );
}

export default ActiveRoomProvider;
