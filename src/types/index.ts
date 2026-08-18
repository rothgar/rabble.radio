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
  createdAt: string;
  updatedAt: string;
  host: PublicHost;
  shareableUrl: string;
}
