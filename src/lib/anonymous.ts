// src/lib/anonymous.ts
//
// Anonymous (not signed in) listeners join LiveKit rooms with a synthetic
// identity so they are counted as listeners but never rendered as active
// participants and can never be invited to stage. Shared by the join route
// (server) and the room UI (client), so this module must stay free of
// server-only imports.

export const ANONYMOUS_IDENTITY_PREFIX = 'anon:';

export function isAnonymousIdentity(identity: string | null | undefined): boolean {
  return typeof identity === 'string' && identity.startsWith(ANONYMOUS_IDENTITY_PREFIX);
}

/** Mint a fresh anonymous identity (`anon:<uuid>`). */
export function newAnonymousIdentity(): string {
  const uuid =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${ANONYMOUS_IDENTITY_PREFIX}${uuid}`;
}
