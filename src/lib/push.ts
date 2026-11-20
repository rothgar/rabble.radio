// src/lib/push.ts
//
// Web Push (RFC 8030/8291/8292) from the Worker. Browsers hand us a
// PushSubscription (endpoint + keys) which we store per user; when a show a
// user asked about goes on air we encrypt a small JSON payload and POST it
// to the browser vendor's push service. Delivery works with the site closed
// on Android Chrome and desktop browsers, and on iOS for home-screen
// installs. VAPID keys come from VAPID_PUBLIC_KEY / VAPID_SUBJECT (vars) and
// VAPID_PRIVATE_KEY (secret).

import { buildPushPayload, type PushSubscription as WirePushSubscription } from '@block65/webcrypto-web-push';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { resetHostFollowNotifications } from '@/lib/host-follows';

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

export interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  expirationTime?: number | null;
}

export class PushValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PushValidationError';
  }
}

/** Drop a subscription after this many consecutive failures. */
export const PUSH_MAX_FAILURES = 5;

export function vapidConfig(env: Record<string, string | undefined> = process.env): {
  subject: string;
  publicKey: string;
  privateKey: string;
} | null {
  const subject = env.VAPID_SUBJECT;
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) return null;
  return { subject, publicKey, privateKey };
}

export function vapidPublicKey(env: Record<string, string | undefined> = process.env): string | null {
  return env.VAPID_PUBLIC_KEY ?? null;
}

export function parseSubscription(input: unknown): SubscriptionInput {
  const o = (input ?? {}) as { endpoint?: unknown; keys?: unknown; expirationTime?: unknown };
  if (typeof o.endpoint !== 'string' || !o.endpoint.startsWith('https://')) {
    throw new PushValidationError('endpoint must be an https URL.');
  }
  const keys = (o.keys ?? {}) as { p256dh?: unknown; auth?: unknown };
  if (typeof keys.p256dh !== 'string' || !keys.p256dh || typeof keys.auth !== 'string' || !keys.auth) {
    throw new PushValidationError('keys.p256dh and keys.auth are required.');
  }
  return {
    endpoint: o.endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
    expirationTime: typeof o.expirationTime === 'number' ? o.expirationTime : null,
  };
}

/** Store (or re-own) a browser subscription for a user. */
export async function saveSubscription(
  did: string,
  sub: SubscriptionInput,
  userAgent: string | null
): Promise<{ id: string }> {
  const row = await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { did, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent },
    update: { did, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent, failures: 0 },
    select: { id: true },
  });
  return row;
}

export async function removeSubscription(did: string, endpoint: string): Promise<number> {
  const res = await prisma.pushSubscription.deleteMany({ where: { did, endpoint } });
  return res.count;
}

export async function countSubscriptions(did: string): Promise<number> {
  return prisma.pushSubscription.count({ where: { did } });
}

interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failures: number;
}

/** Send one message to one subscription. Returns true on acceptance. */
export async function sendToSubscription(
  sub: StoredSubscription,
  payload: PushPayload,
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  const vapid = vapidConfig(env);
  if (!vapid) return false;
  const wire: WirePushSubscription = {
    endpoint: sub.endpoint,
    expirationTime: null,
    keys: { p256dh: sub.p256dh, auth: sub.auth },
  };
  try {
    const request = await buildPushPayload(
      { data: payload, options: { ttl: 60 * 60, urgency: 'high', topic: payload.tag?.slice(0, 32) } },
      wire,
      vapid
    );
    const res = await fetchImpl(sub.endpoint, request);
    if (res.status === 404 || res.status === 410) {
      // The browser unsubscribed; forget it.
      await prisma.pushSubscription.deleteMany({ where: { id: sub.id } }).catch(() => undefined);
      return false;
    }
    if (!res.ok) {
      await bumpFailure(sub);
      logger.warn('push.rejected', { id: sub.id, status: res.status });
      return false;
    }
    await prisma.pushSubscription
      .update({ where: { id: sub.id }, data: { failures: 0, lastUsedAt: new Date() } })
      .catch(() => undefined);
    return true;
  } catch (err) {
    await bumpFailure(sub);
    logger.warn('push.send_failed', { id: sub.id, error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

async function bumpFailure(sub: StoredSubscription): Promise<void> {
  const failures = sub.failures + 1;
  if (failures >= PUSH_MAX_FAILURES) {
    await prisma.pushSubscription.deleteMany({ where: { id: sub.id } }).catch(() => undefined);
    return;
  }
  await prisma.pushSubscription
    .update({ where: { id: sub.id }, data: { failures } })
    .catch(() => undefined);
}

/** Send to every browser a user subscribed. Returns how many accepted. */
export async function sendPushToUser(
  did: string,
  payload: PushPayload,
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<number> {
  const subs = await prisma.pushSubscription.findMany({
    where: { did },
    select: { id: true, endpoint: true, p256dh: true, auth: true, failures: true },
  });
  if (subs.length === 0) return 0;
  const results = await Promise.all(subs.map((s) => sendToSubscription(s, payload, env, fetchImpl)));
  return results.filter(Boolean).length;
}

/**
 * A show went on air: push to everyone with a reminder on it and mark those
 * reminders notified so the polling clients don't repeat the alert.
 * Best-effort; never throws.
 */
export async function pushRemindersOnAir(
  space: { id: string; title: string; host: { handle: string; displayName?: string | null } },
  origin: string,
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<{ users: number; delivered: number }> {
  try {
    const reminders = await prisma.showReminder.findMany({
      where: { spaceId: space.id, notifiedAt: null },
      select: { did: true },
    });
    if (reminders.length === 0) return { users: 0, delivered: 0 };
    const hostName = space.host.displayName?.trim() || `@${space.host.handle}`;
    const payload: PushPayload = {
      title: `${space.title} is on air`,
      body: `${hostName} just went live on Rabble Radio.`,
      url: `${origin}/show/${encodeURIComponent(space.id)}`,
      tag: `rabble-${space.id}`,
    };
    const counts = await Promise.all(reminders.map((r) => sendPushToUser(r.did, payload, env, fetchImpl)));
    const notified = reminders.filter((_, i) => counts[i] > 0).map((r) => r.did);
    if (notified.length > 0) {
      await prisma.showReminder.updateMany({
        where: { spaceId: space.id, did: { in: notified } },
        data: { notifiedAt: new Date() },
      });
    }
    const delivered = counts.reduce((a, b) => a + b, 0);
    logger.info('push.reminders_sent', { spaceId: space.id, users: reminders.length, delivered });
    return { users: reminders.length, delivered };
  } catch (err) {
    logger.error('push.reminders_failed', {
      spaceId: space.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return { users: 0, delivered: 0 };
  }
}

/**
 * A host went on air: push to everyone following that host (on any show,
 * not just this one) and mark those follows notified. Clears the followers'
 * notified flag first so a host who has gone live before still reaches
 * them for this session. Best-effort; never throws.
 */
export async function pushHostFollowersOnAir(
  space: { id: string; title: string; host: { did: string; handle: string; displayName?: string | null } },
  origin: string,
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<{ users: number; delivered: number }> {
  try {
    await resetHostFollowNotifications(space.host.did);
    const follows = await prisma.hostFollow.findMany({
      where: { hostDid: space.host.did, notifiedAt: null },
      select: { did: true },
    });
    if (follows.length === 0) return { users: 0, delivered: 0 };
    const hostName = space.host.displayName?.trim() || `@${space.host.handle}`;
    const payload: PushPayload = {
      title: `${hostName} is on air`,
      body: `${space.title} just went live on Rabble Radio.`,
      url: `${origin}/show/${encodeURIComponent(space.id)}`,
      tag: `rabble-host-${space.host.did}`,
    };
    const counts = await Promise.all(follows.map((f) => sendPushToUser(f.did, payload, env, fetchImpl)));
    const notified = follows.filter((_, i) => counts[i] > 0).map((f) => f.did);
    if (notified.length > 0) {
      await prisma.hostFollow.updateMany({
        where: { hostDid: space.host.did, did: { in: notified } },
        data: { notifiedAt: new Date() },
      });
    }
    const delivered = counts.reduce((a, b) => a + b, 0);
    logger.info('push.host_followers_sent', { hostDid: space.host.did, users: follows.length, delivered });
    return { users: follows.length, delivered };
  } catch (err) {
    logger.error('push.host_followers_failed', {
      hostDid: space.host.did,
      error: err instanceof Error ? err.message : String(err),
    });
    return { users: 0, delivered: 0 };
  }
}
