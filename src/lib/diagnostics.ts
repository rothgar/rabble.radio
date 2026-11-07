// src/lib/diagnostics.ts
//
// Client-side state capture for the feedback button. Keeps a small ring
// buffer of recent errors (window errors, unhandled rejections, console
// errors), the latest room snapshot published by SpaceRoom, and reads the
// environment (browser, viewport, network, build) at send time.
//
// Everything here is best-effort and safe to call during SSR: the installer
// and collector no-op without a `window`.

export interface RoomSnapshot {
  spaceId: string;
  role: string;
  connected: boolean;
  onAir: boolean;
  micOn: boolean;
  participants: number;
  speakers: number;
  updatedAt: string;
}

export interface RecentError {
  at: string;
  kind: 'error' | 'unhandledrejection' | 'console';
  message: string;
}

export interface Diagnostics {
  capturedAt: string;
  page: string;
  referrer: string;
  build: string | null;
  userAgent: string;
  language: string;
  platform: string;
  viewport: { width: number; height: number; dpr: number };
  screen: { width: number; height: number };
  online: boolean;
  connection: { effectiveType?: string; downlink?: number; rtt?: number } | null;
  visibility: string;
  mediaDevices: boolean;
  secureContext: boolean;
  room: RoomSnapshot | null;
  recentErrors: RecentError[];
}

const MAX_ERRORS = 20;
const errors: RecentError[] = [];
let room: RoomSnapshot | null = null;
let installed = false;

function push(kind: RecentError['kind'], message: string): void {
  errors.push({ at: new Date().toISOString(), kind, message: message.slice(0, 500) });
  if (errors.length > MAX_ERRORS) errors.shift();
}

/** Record an error for later reports. Exported for tests and manual use. */
export function recordError(kind: RecentError['kind'], message: string): void {
  push(kind, message);
}

/** SpaceRoom calls this whenever the room state changes. */
export function setRoomSnapshot(next: Omit<RoomSnapshot, 'updatedAt'> | null): void {
  room = next ? { ...next, updatedAt: new Date().toISOString() } : null;
}

export function getRoomSnapshot(): RoomSnapshot | null {
  return room;
}

/** Hook window error sources once. Idempotent. */
export function installDiagnostics(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (e) => {
    push('error', e.message || String(e.error ?? 'error'));
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = (e as PromiseRejectionEvent).reason;
    push('unhandledrejection', reason instanceof Error ? reason.message : String(reason));
  });
  const original = console.error;
  console.error = (...args: unknown[]) => {
    try {
      push(
        'console',
        args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
      );
    } catch {
      // never let diagnostics break logging
    }
    original.apply(console, args);
  };
}

/** Snapshot everything we know. Safe to call on the server (returns minimal data). */
export function collectDiagnostics(): Diagnostics {
  const now = new Date().toISOString();
  if (typeof window === 'undefined') {
    return {
      capturedAt: now,
      page: '',
      referrer: '',
      build: process.env.NEXT_PUBLIC_BUILD_ID ?? null,
      userAgent: '',
      language: '',
      platform: '',
      viewport: { width: 0, height: 0, dpr: 1 },
      screen: { width: 0, height: 0 },
      online: true,
      connection: null,
      visibility: '',
      mediaDevices: false,
      secureContext: false,
      room,
      recentErrors: [...errors],
    };
  }
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; downlink?: number; rtt?: number };
    userAgentData?: { platform?: string };
  };
  return {
    capturedAt: now,
    page: window.location.href,
    referrer: document.referrer,
    build: process.env.NEXT_PUBLIC_BUILD_ID ?? null,
    userAgent: nav.userAgent,
    language: nav.language,
    platform: nav.userAgentData?.platform ?? nav.platform ?? '',
    viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
    screen: { width: window.screen?.width ?? 0, height: window.screen?.height ?? 0 },
    online: nav.onLine,
    connection: nav.connection
      ? {
          effectiveType: nav.connection.effectiveType,
          downlink: nav.connection.downlink,
          rtt: nav.connection.rtt,
        }
      : null,
    visibility: document.visibilityState,
    mediaDevices: Boolean(nav.mediaDevices),
    secureContext: window.isSecureContext,
    room,
    recentErrors: [...errors],
  };
}

/** Test helper. */
export function resetDiagnosticsForTests(): void {
  errors.length = 0;
  room = null;
}
