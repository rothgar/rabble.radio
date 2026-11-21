// Shared type definitions for Bluesky Spaces MVP
export {};

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  uptime: number;
  service: string;
}

export interface PublicUser {
  id: string;
  did: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface PublicHost {
  did: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
}

/** A finished show's recording, playable without joining the room. */
export interface PublicReplay {
  recordingId: string;
  /** Stable URL that redirects to a short-lived signed object URL. */
  audioUrl: string;
  contentType: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  sizeBytes: number | null;
}

export interface PublicSpace {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  isLive: boolean;
  /** "scheduled" | "active" | "live" | "ended" | "expired". */
  status: string;
  /** ISO string when the space is scheduled to go live, null otherwise. */
  scheduledAt: string | null;
  /** ISO string when the space should be considered expired, null otherwise. */
  expiresAt: string | null;
  /** Live occupancy/reaction metrics (drives popularity sorting). */
  listenerCount: number;
  speakerCount: number;
  reactionCount: number;
  /** Cumulative unique listeners who joined the open session, even if they've
   *  since left. Falls back to `listenerCount` when off air or undecorated. */
  tunedInCount: number;
  /** Lifetime totals rolled up from finished shows (see src/lib/metrics.ts). */
  likeCount: number;
  sessionCount: number;
  totalListeners: number;
  hostedSeconds: number;
  /** ISO string of the last time a show on this station ended, null if never. */
  lastLiveAt: string | null;
  /** Up to 3 category tags used to group shows into stations. */
  tags: string[];
  createdAt: string;
  updatedAt: string;
  host: PublicHost;
  /** The host plus up to 3 currently on-stage speakers, capped at 4 total.
   *  Off air (or no extra speakers), this is just the host. Drives the
   *  per-show opengraph image (src/app/show/[id]/opengraph-image.tsx). */
  onStageHosts: PublicHost[];
  shareableUrl: string;
  /** Latest playable recording when the show is off air; null otherwise. */
  replay: PublicReplay | null;
  /** True when the viewer asked to be notified when this show goes on air. */
  reminded: boolean;
  /** Pre-show music mood id (src/lib/music.ts), null for silence. */
  musicMood?: string | null;
  /** True while music sits on stage; false once removed while on air. Ignored off air. */
  musicOnStage?: boolean;
  /** True once the host has turned this show into its own podcast feed. */
  podcastFeedEnabled: boolean;
  /** This show's own feed URL, scoped to just its published recordings; null when disabled. */
  podcastFeedUrl: string | null;
  /** Signed-in viewers: the host is someone they follow on Bluesky. */
  hostFollowed?: boolean;
  /** True when the viewer asked to be notified whenever this host goes on air, any show. */
  hostSubscribed?: boolean;
  /** True when this show has a name of its own, not the host's default-titled show. */
  isNamedShow: boolean;
  /** True when the viewer asked to be notified whenever this exact show goes on air. */
  showFollowed?: boolean;
  /** Signed-in viewers: people they follow who are in the room right now. */
  followedInRoom?: PublicHost[];
}
