// src/lib/livekit.ts
//
// Server-side LiveKit helpers. Used by the /api/spaces/[id]/join route to
// mint JWTs scoped to a single LiveKit room with role-based publish
// permissions.
//
// Configuration:
//   LIVEKIT_URL        ws://host:port that the browser client connects to
//                      (e.g. ws://livekit:7880 inside kind, ws://localhost:7880
//                      for local dev).
//   LIVEKIT_API_KEY    API key issued by the LiveKit server.
//   LIVEKIT_API_SECRET API secret matching the key.
//
// When these are not set the helpers throw a descriptive error so misconfigured
// deployments fail fast instead of silently issuing unusable tokens.

import {
  AccessToken,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  RoomServiceClient,
  S3Upload,
} from 'livekit-server-sdk';

export type SpaceRole = 'host' | 'speaker' | 'audience';

export interface LiveKitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

export interface GenerateTokenInput {
  room: string;
  identity: string;
  role: SpaceRole;
  /** Optional display name shown in the participant tile. */
  name?: string;
  /** Token TTL in seconds. Defaults to 1 hour. */
  ttlSeconds?: number;
}

export interface GeneratedToken {
  token: string;
  wsUrl: string;
}

let cachedClient: RoomServiceClient | null = null;
let cachedConfig: LiveKitConfig | null = null;
let cachedEgressClient: EgressClient | null = null;
let cachedEgressConfig: LiveKitConfig | null = null;

export class LiveKitConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiveKitConfigError';
  }
}

/**
 * Read LiveKit configuration from environment variables. Throws if anything is
 * missing. Centralised so callers don't have to repeat the validation.
 */
export function getLiveKitConfig(): LiveKitConfig {
  if (cachedConfig) return cachedConfig;

  const url = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();

  if (!url) {
    throw new LiveKitConfigError(
      'LIVEKIT_URL is not configured. Set it to the LiveKit server ws://host:port URL.'
    );
  }
  if (!apiKey) {
    throw new LiveKitConfigError(
      'LIVEKIT_API_KEY is not configured. Set it to the API key issued by the LiveKit server.'
    );
  }
  if (!apiSecret) {
    throw new LiveKitConfigError(
      'LIVEKIT_API_SECRET is not configured. Set it to the API secret matching LIVEKIT_API_KEY.'
    );
  }

  cachedConfig = { url, apiKey, apiSecret };
  return cachedConfig;
}

/**
 * Return the configured LiveKit ws:// URL that browser clients should
 * connect to. Pulled from the env via `getLiveKitConfig` so the URL is
 * validated alongside the API credentials.
 *
 * NOTE: This is the *internal* URL (`LIVEKIT_URL`). It is intended for
 * server-to-server calls (token minting, room service, egress). Browser
 * clients must use {@link getLiveKitPublicWsUrl} instead, which returns
 * a URL the public internet can reach.
 */
export function getLiveKitWsUrl(): string {
  return getLiveKitConfig().url;
}

/**
 * Return the public WebSocket URL that browser clients should use when
 * connecting to LiveKit. Browsers cannot reach internal container
 * addresses like `ws://livekit:7880`, so we resolve the URL through:
 *
 *   1. `LIVEKIT_PUBLIC_URL` — operator-provided public WSS endpoint.
 *   2. `NEXT_PUBLIC_LIVEKIT_URL` — public, NEXT_PUBLIC_-prefixed value
 *      that can be bundled into client code if needed.
 *   3. Derive from `NEXT_PUBLIC_APP_URL` / `PUBLIC_URL` by swapping
 *      `https://` for `wss://` (and `http://` for `ws://`).
 *   4. Fall back to the internal `LIVEKIT_URL` so dev environments
 *      without a public URL continue to work (the operator is expected
 *      to set one of the above in production).
 */
export function getLiveKitPublicWsUrl(): string {
  const explicit =
    process.env.LIVEKIT_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim() ||
    '';
  if (explicit) {
    return normalizeWsUrl(explicit);
  }
  const derivedFrom =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.PUBLIC_URL?.trim() ||
    '';
  if (derivedFrom) {
    return httpsToWss(derivedFrom);
  }
  // Last resort: the internal URL. In production this will not be
  // reachable by browsers, but we keep the helper total so callers do
  // not have to branch on missing env vars.
  return getLiveKitWsUrl();
}

/**
 * Convert an https:// URL to a wss:// URL (or http:// to ws://). Returns
 * the input unchanged if it already uses the ws:// or wss:// scheme.
 */
function httpsToWss(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') parsed.protocol = 'wss:';
    else if (parsed.protocol === 'http:') parsed.protocol = 'ws:';
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Normalise a WS URL so it is acceptable as a `serverUrl` for the
 * LiveKit browser SDK. Strips trailing slashes and ensures a scheme.
 */
function normalizeWsUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) return trimmed;
  if (
    trimmed.startsWith('ws://') ||
    trimmed.startsWith('wss://')
  ) {
    return trimmed;
  }
  // No scheme: assume secure websocket.
  return `wss://${trimmed}`;
}

/**
 * Get a server SDK client for the LiveKit room service. The client is cached
 * for the lifetime of the process because it only holds the host URL +
 * credentials (no per-call state).
 */
export function getLiveKitClient(): RoomServiceClient {
  if (cachedClient) return cachedClient;
  const { url, apiKey, apiSecret } = getLiveKitConfig();
  cachedClient = new RoomServiceClient(url, apiKey, apiSecret);
  return cachedClient;
}

/**
 * Get a server SDK client for the LiveKit Egress service. The egress
 * service may live at a different host than the SFU (`EGRESS_WS_URL`),
 * falling back to the SFU URL. Like the room client, this is cached.
 */
export function getEgressClient(): EgressClient {
  if (cachedEgressClient && cachedEgressConfig) return cachedEgressClient;
  const cfg = getLiveKitConfig();
  const wsUrl = (process.env.EGRESS_WS_URL?.trim() || cfg.url) as string;
  cachedEgressConfig = { ...cfg, url: wsUrl };
  cachedEgressClient = new EgressClient(wsUrl, cfg.apiKey, cfg.apiSecret);
  return cachedEgressClient;
}

/**
 * Map an internal role to LiveKit VideoGrant flags.
 */
function videoGrantForRole(role: SpaceRole): {
  canPublish: boolean;
  canSubscribe: boolean;
  canPublishData: boolean;
} {
  if (role === 'audience') {
    return {
      canPublish: false,
      canSubscribe: true,
      canPublishData: false,
    };
  }
  // host and speaker both get full publish / subscribe / data rights.
  return {
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  };
}

/**
 * Mint a LiveKit access token for `identity` joining `room` with the given
 * role. Returns the signed JWT and the public ws:// URL the browser
 * should connect to. The internal `LIVEKIT_URL` is used for token minting
 * (server-to-server), while the returned `wsUrl` is the public-facing URL
 * browsers can reach via `getLiveKitPublicWsUrl`.
 */
export async function generateToken(
  input: GenerateTokenInput
): Promise<GeneratedToken> {
  const { room, identity, role } = input;
  if (!room) throw new LiveKitConfigError('Room name is required.');
  if (!identity) throw new LiveKitConfigError('Participant identity is required.');

  const { apiKey, apiSecret } = getLiveKitConfig();
  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    name: input.name,
    ttl: input.ttlSeconds ?? 60 * 60, // 1 hour
  });
  const flags = videoGrantForRole(role);
  at.addGrant({
    roomJoin: true,
    room,
    canPublish: flags.canPublish,
    canSubscribe: flags.canSubscribe,
    canPublishData: flags.canPublishData,
    canUpdateOwnMetadata: true,
  });
  const token = await at.toJwt();
  return { token, wsUrl: getLiveKitPublicWsUrl() };
}

/**
 * Idempotently create a LiveKit room. If the room already exists this is a
 * no-op; otherwise it creates it with sensible defaults for an audio space
 * (emptyTimeout / departureTimeout keep the room around long enough for
 * audience reconnects but not indefinitely).
 */
export async function createRoom(spaceId: string): Promise<void> {
  const name = roomNameForSpace(spaceId);
  const client = getLiveKitClient();
  try {
    await client.createRoom({
      name,
      emptyTimeout: 60 * 30, // 30 min after last participant leaves
      departureTimeout: 60 * 5, // 5 min grace for re-joins
      maxParticipants: 500,
    });
  } catch (err) {
    // ALREADY_EXISTS is fine — the room is already there. Anything else
    // bubbles up so callers can surface a 500.
    const code = (err as { code?: string; message?: string } | undefined)?.code;
    const message = (err as { message?: string } | undefined)?.message ?? '';
    if (
      code === 'already_exists' ||
      message.toLowerCase().includes('already exists')
    ) {
      return;
    }
    throw err;
  }
}

/**
 * Derive a deterministic LiveKit room name from the internal space id. We use
 * the cuid id (not the slug) so URLs cannot be guessed and so the host can
 * rename slugs without affecting the underlying room.
 */
export function roomNameForSpace(spaceId: string): string {
  const safe = spaceId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `space-${safe}`;
}

/**
 * Idempotently provision a LiveKit room and mint a host-scoped JWT for the
 * given user. Used by the start-now flow so the caller can hand the
 * browser the token + wsUrl + room metadata in one round trip.
 *
 * - The room is created (no-op if it already exists) so the host can join
 *   immediately even if the room hasn't been opened by another participant.
 * - The token is generated with `role: 'host'` so the participant is granted
 *   publish + subscribe + data rights.
 */
export async function createHostToken(
  spaceId: string,
  user: { did: string; handle: string }
): Promise<{
  token: string;
  wsUrl: string;
  roomName: string;
  identity: string;
}> {
  const roomName = roomNameForSpace(spaceId);
  await createRoom(spaceId);
  const { token, wsUrl } = await generateToken({
    room: roomName,
    identity: user.did,
    name: user.handle,
    role: 'host',
  });
  return {
    token,
    wsUrl,
    roomName,
    identity: user.did,
  };
}

/**
 * Best-effort LiveKit helper: forcibly remove a participant from a room.
 * Used by the host's "kick" action. Returns true if the call succeeded,
 * false otherwise. The caller should not treat a `false` return as fatal
 * because LiveKit may auto-disconnect the user anyway.
 */
export async function removeParticipant(
  roomName: string,
  identity: string
): Promise<boolean> {
  try {
    const client = getLiveKitClient();
    await client.removeParticipant(roomName, identity);
    return true;
  } catch {
    return false;
  }
}

/**
 * Best-effort LiveKit helper: set the microphone mute state for a
 * participant. We delegate to `updateParticipant` with the matching
 * `permission.canPublish` flag, which the LiveKit server treats as a
 * publish gate. Returns true on success, false otherwise.
 */
export async function muteParticipant(
  roomName: string,
  identity: string,
  muted: boolean
): Promise<boolean> {
  try {
    const client = getLiveKitClient() as unknown as {
      updateParticipant: (...args: unknown[]) => Promise<unknown>;
    };
    try {
      await client.updateParticipant(roomName, identity, undefined, {
        canPublish: !muted,
        canSubscribe: true,
        canPublishData: !muted,
      });
    } catch {
      // Legacy positional signature.
      await client.updateParticipant(
        roomName,
        identity,
        undefined,
        { canPublish: !muted, canSubscribe: true, canPublishData: !muted } as unknown as undefined
      );
    }
    return true;
  } catch {
    return false;
  }
}

// Test-only: reset the module-level caches so unit tests can change env vars
// between runs. Not exported via the public API surface.
export function __resetLiveKitCacheForTests(): void {
  cachedClient = null;
  cachedConfig = null;
  cachedEgressClient = null;
  cachedEgressConfig = null;
}

// ---------------------------------------------------------------------------
// Recording helpers (LiveKit Egress)
//
// `startRecording` returns either the egress ID (success) or `null` if the
// Egress service is unavailable / misconfigured. We intentionally swallow
// egress errors here because the host's "go live" flow must still succeed
// when the recording infra is down — recording is a best-effort feature.
// Callers should treat `null` as "no recording will be produced" but the
// space going live is unaffected.
// ---------------------------------------------------------------------------

export interface StartRecordingOptions {
  /** Optional file basename. Defaults to `recordings/<roomName>-<timestamp>.mp4`. */
  filepath?: string;
  /** Recording format. Defaults to MP4. */
  fileType?: EncodedFileType;
}

export interface RecordingStartResult {
  egressId: string;
}

/**
 * Start a composite room recording. By default this records audio only,
 * uploads the file to MinIO/S3, and uses an MP4 container.
 */
export async function startRecording(
  roomName: string,
  options: StartRecordingOptions = {}
): Promise<RecordingStartResult | null> {
  try {
    const cfg = getLiveKitConfig();
    const bucket = process.env.RECORDING_BUCKET?.trim() || 'rabble-recordings';
    const endpoint = process.env.S3_ENDPOINT?.trim() || '';
    const accessKey = process.env.S3_ACCESS_KEY?.trim() || cfg.apiKey;
    const secret = process.env.S3_SECRET_KEY?.trim() || cfg.apiSecret;
    const region = process.env.S3_REGION?.trim() || 'us-east-1';
    if (!endpoint) {
      // Misconfigured storage — fall back to no recording rather than
      // throwing, so the host's "go live" flow continues to work.
      return null;
    }

    const s3 = new S3Upload({
      accessKey,
      secret,
      bucket,
      region,
      endpoint,
      forcePathStyle: true,
    });
    const filepath =
      options.filepath ?? `recordings/${roomName}-${Date.now()}.mp4`;
    const output = new EncodedFileOutput({
      fileType: options.fileType ?? EncodedFileType.MP4,
      filepath,
      disableManifest: true,
    });
    (output as unknown as { s3: S3Upload }).s3 = s3;
    const egress = getEgressClient();
    const info = await egress.startTrackCompositeEgress(
      roomName,
      output,
      {}
    );
    if (!info?.egressId) {
      return null;
    }
    return { egressId: info.egressId };
  } catch {
    return null;
  }
}

/**
 * Stop an in-flight egress. Returns `true` on success, `false` otherwise.
 * Like `startRecording` this is best-effort — callers should not abort the
 * caller flow on a failure here.
 */
export async function stopRecording(egressId: string): Promise<boolean> {
  if (!egressId) return false;
  try {
    const egress = getEgressClient();
    await egress.stopEgress(egressId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Look up an egress's current status. Used by the completion handler when
 * we need to refresh a recording's metadata.
 */
export async function getEgressStatus(
  egressId: string
): Promise<{ status: string; endedAt?: Date } | null> {
  try {
    const egress = getEgressClient();
    const items = await egress.listEgress({ egressId });
    const info = items[0];
    if (!info) return null;
    return {
      status: String(info.status ?? 'unknown'),
      endedAt: info.endedAt ? new Date(Number(info.endedAt) * 1000) : undefined,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// EncodedFileOutput construction helper.
//
// The generated `EncodedFileOutput` is a protobuf-es Message with a oneof
// `output` field. The TS class doesn't accept the oneof discriminator via
// the constructor; the SDK sets it via `.s3 = ...` after construction.
// ---------------------------------------------------------------------------
