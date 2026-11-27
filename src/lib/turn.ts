// src/lib/turn.ts
//
// Per-join TURN credentials from Cloudflare's hosted TURN service
// (https://developers.cloudflare.com/realtime/turn/).
//
// The LiveKit SFU runs behind the homelab NAT. Listeners on the LAN reach it
// directly, but anyone else needs a relay the SFU can talk to from behind
// NAT. Running LiveKit's embedded TURN would need a forwarded public port, a
// TLS certificate and dynamic DNS; Cloudflare's TURN only needs an API call.
//
// Credentials are minted for every join with a TTL that outlives any
// realistic session and handed to the client in the join response. Each
// client passes them to its LiveKit SDK as the ICE server list, which the
// web, Android and iOS SDKs use in place of the list the SFU would send.
//
// Configuration (both required to enable; when absent no relay is offered):
//   CLOUDFLARE_TURN_KEY_ID     TURN key id (Cloudflare dashboard → Realtime → TURN)
//   CLOUDFLARE_TURN_API_TOKEN  API token issued with that key

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface TurnConfig {
  keyId: string;
  apiToken: string;
}

// Lifetime of minted credentials (issue #184). Cloudflare re-checks this
// credential on every TURN Refresh the browser's ICE agent sends to keep
// the relay allocation alive for as long as the call runs — iceServers are
// fetched once at join and never refreshed client-side (ActiveRoomProvider,
// SpacePageClient) — so it has to outlive the show, not just the join
// request. 24h was the original, deliberately generous, value; 6h still
// cuts an abusive anonymous join's credential lifetime well down without
// cutting off the shows that run past an hour.
export const DEFAULT_TURN_TTL_SECONDS = 6 * 60 * 60;

const CLOUDFLARE_TURN_API = 'https://rtc.live.cloudflare.com/v1/turn/keys';
const REQUEST_TIMEOUT_MS = 5_000;

export class TurnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TurnError';
  }
}

/** Minimal view of process.env so tests can pass plain objects. */
export type EnvSource = Record<string, string | undefined>;

export function getTurnConfig(env: EnvSource = process.env): TurnConfig | null {
  const keyId = env.CLOUDFLARE_TURN_KEY_ID?.trim();
  const apiToken = env.CLOUDFLARE_TURN_API_TOKEN?.trim();
  if (!keyId || !apiToken) return null;
  return { keyId, apiToken };
}

export function isTurnConfigured(env: EnvSource = process.env): boolean {
  return getTurnConfig(env) !== null;
}

interface CloudflareIceServer {
  urls?: string[] | string;
  username?: string;
  credential?: string;
}

interface CloudflareIceServersResponse {
  iceServers?: CloudflareIceServer[] | CloudflareIceServer;
}

/**
 * Shape Cloudflare's response into plain ICE server entries. Drops URLs on
 * port 53: browsers refuse them and, without trickle ICE, a client would wait
 * for that candidate to time out.
 */
export function normalizeIceServers(raw: unknown): IceServer[] {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const servers: IceServer[] = [];
  for (const entry of list as CloudflareIceServer[]) {
    if (!entry || typeof entry !== 'object') continue;
    const urls = (Array.isArray(entry.urls) ? entry.urls : [entry.urls])
      .filter((u): u is string => typeof u === 'string' && u.length > 0)
      .filter((u) => !/:53(\?|$)/.test(u));
    if (urls.length === 0) continue;
    const server: IceServer = { urls };
    if (typeof entry.username === 'string') server.username = entry.username;
    if (typeof entry.credential === 'string') server.credential = entry.credential;
    servers.push(server);
  }
  return servers;
}

export interface GetIceServersOptions {
  ttlSeconds?: number;
  fetchImpl?: typeof fetch;
  env?: EnvSource;
}

/**
 * Mint a fresh STUN + TURN server list for one participant. Returns null when
 * TURN is not configured so callers can fall back to the SFU's own list.
 * Throws TurnError on any failure; callers should treat that as "no relay"
 * rather than refusing the join.
 */
export async function getIceServers(
  opts: GetIceServersOptions = {}
): Promise<IceServer[] | null> {
  const config = getTurnConfig(opts.env ?? process.env);
  if (!config) return null;

  const ttl =
    Number.isFinite(opts.ttlSeconds) && (opts.ttlSeconds as number) > 0
      ? Math.floor(opts.ttlSeconds as number)
      : DEFAULT_TURN_TTL_SECONDS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `${CLOUDFLARE_TURN_API}/${encodeURIComponent(config.keyId)}/credentials/generate-ice-servers`;

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new TurnError(
      `Cloudflare TURN credential request failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!res.ok) {
    throw new TurnError(`Cloudflare TURN credential request returned HTTP ${res.status}`);
  }

  let body: CloudflareIceServersResponse;
  try {
    body = (await res.json()) as CloudflareIceServersResponse;
  } catch {
    throw new TurnError('Cloudflare TURN credential response was not JSON');
  }

  const servers = normalizeIceServers(body.iceServers);
  if (servers.length === 0) {
    throw new TurnError('Cloudflare TURN credential response contained no ICE servers');
  }
  return servers;
}
