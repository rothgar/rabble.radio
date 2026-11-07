// src/lib/push-client.ts
//
// Browser side of Web Push: register the service worker, subscribe with the
// server's VAPID key and hand the subscription to /api/push/subscribe.
// Every function is safe to call where push is unsupported; they return
// a status instead of throwing.

export type PushStatus =
  | 'subscribed'
  | 'unsupported'
  | 'denied'
  | 'not_configured'
  | 'unauthorized'
  | 'failed';

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined' &&
    window.isSecureContext
  );
}

function base64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Make sure this browser is subscribed for the signed-in user. Asks for
 * notification permission when `prompt` is true and permission is still
 * undecided; otherwise only syncs an existing grant.
 */
export async function ensurePushSubscription(prompt: boolean): Promise<PushStatus> {
  if (!pushSupported()) return 'unsupported';
  try {
    let permission = Notification.permission;
    if (permission === 'default' && prompt) permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';

    const keyRes = await fetch('/api/push/vapid', { cache: 'no-store' });
    if (!keyRes.ok) return 'not_configured';
    const { publicKey } = (await keyRes.json()) as { publicKey: string };

    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(publicKey),
      });
    }
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    if (res.status === 401) return 'unauthorized';
    if (res.status === 404) return 'not_configured';
    return res.ok ? 'subscribed' : 'failed';
  } catch {
    return 'failed';
  }
}

/** Unsubscribe this browser and tell the server. */
export async function removePushSubscription(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => undefined);
    await subscription.unsubscribe();
  } catch {
    // nothing to clean up
  }
}
