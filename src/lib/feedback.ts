// src/lib/feedback.ts
//
// Problem reports from the in-app feedback button. Each row keeps the
// message plus a JSON `context` of whatever the client captured: the page
// or screen, room state (show, role, connection, on-air, mic), recent
// errors, and environment (device, OS, browser, app version).
//
// Reading reports is limited to the DIDs or handles listed in the
// FEEDBACK_ADMIN_DIDS environment variable (comma separated).

import { prisma } from '@/lib/db';

export const FEEDBACK_CATEGORIES = ['problem', 'idea', 'other'] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export const FEEDBACK_PLATFORMS = ['web', 'android', 'ios'] as const;
export type FeedbackPlatform = (typeof FEEDBACK_PLATFORMS)[number];

export const FEEDBACK_MESSAGE_MAX = 4000;
/** Serialized context larger than this is truncated rather than rejected. */
export const FEEDBACK_CONTEXT_MAX = 32 * 1024;

export interface FeedbackInput {
  did?: string | null;
  handle?: string | null;
  category?: string;
  message: string;
  platform?: string;
  appVersion?: string | null;
  page?: string | null;
  spaceId?: string | null;
  userAgent?: string | null;
  context?: unknown;
  now?: Date;
}

export interface FeedbackRow {
  id: string;
  did: string | null;
  handle: string | null;
  category: FeedbackCategory;
  message: string;
  platform: FeedbackPlatform;
  appVersion: string | null;
  page: string | null;
  spaceId: string | null;
  userAgent: string | null;
  context: Record<string, unknown>;
  createdAt: Date;
}

export class FeedbackValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeedbackValidationError';
  }
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number' || typeof value === 'string') return new Date(value);
  return new Date(NaN);
}

function clampString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/** Serialize the captured context, truncating oversized blobs with a marker. */
export function serializeContext(context: unknown): string {
  if (!context || typeof context !== 'object') return '{}';
  let json: string;
  try {
    json = JSON.stringify(context);
  } catch {
    return '{"error":"context_not_serializable"}';
  }
  if (json.length <= FEEDBACK_CONTEXT_MAX) return json;
  return JSON.stringify({
    truncated: true,
    originalLength: json.length,
    head: json.slice(0, FEEDBACK_CONTEXT_MAX - 200),
  });
}

function rowToFeedback(row: Record<string, unknown>): FeedbackRow {
  let context: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(String(row.context ?? '{}'));
    if (parsed && typeof parsed === 'object') context = parsed as Record<string, unknown>;
  } catch {
    context = {};
  }
  return {
    id: String(row.id),
    did: (row.did as string | null) ?? null,
    handle: (row.handle as string | null) ?? null,
    category: (FEEDBACK_CATEGORIES as readonly string[]).includes(String(row.category))
      ? (row.category as FeedbackCategory)
      : 'other',
    message: String(row.message ?? ''),
    platform: (FEEDBACK_PLATFORMS as readonly string[]).includes(String(row.platform))
      ? (row.platform as FeedbackPlatform)
      : 'web',
    appVersion: (row.appVersion as string | null) ?? null,
    page: (row.page as string | null) ?? null,
    spaceId: (row.spaceId as string | null) ?? null,
    userAgent: (row.userAgent as string | null) ?? null,
    context,
    createdAt: toDate(row.createdAt),
  };
}

/** Validate and store a report. Throws FeedbackValidationError on bad input. */
export async function createFeedback(input: FeedbackInput): Promise<FeedbackRow> {
  const message = clampString(input.message, FEEDBACK_MESSAGE_MAX + 1);
  if (!message) throw new FeedbackValidationError('Message is required.');
  if (message.length > FEEDBACK_MESSAGE_MAX) {
    throw new FeedbackValidationError(`Message must be ${FEEDBACK_MESSAGE_MAX} characters or fewer.`);
  }
  const category = (FEEDBACK_CATEGORIES as readonly string[]).includes(input.category ?? '')
    ? (input.category as FeedbackCategory)
    : 'problem';
  const platform = (FEEDBACK_PLATFORMS as readonly string[]).includes(input.platform ?? '')
    ? (input.platform as FeedbackPlatform)
    : 'web';

  const row = await prisma.feedback.create({
    data: {
      did: input.did ?? null,
      handle: input.handle ?? null,
      category,
      message,
      platform,
      appVersion: clampString(input.appVersion, 100),
      page: clampString(input.page, 500),
      spaceId: clampString(input.spaceId, 100),
      userAgent: clampString(input.userAgent, 500),
      context: serializeContext(input.context),
      createdAt: input.now ?? new Date(),
    },
  });
  return rowToFeedback(row as unknown as Record<string, unknown>);
}

/** Newest reports first. */
export async function listFeedback(limit = 100): Promise<FeedbackRow[]> {
  const rows = await prisma.feedback.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.max(1, Math.min(limit, 500)),
  });
  return rows.map((r) => rowToFeedback(r as unknown as Record<string, unknown>));
}

/** Parse FEEDBACK_ADMIN_DIDS (DIDs or handles, comma separated). */
export function feedbackAdmins(env: Record<string, string | undefined> = process.env): Set<string> {
  const raw = env.FEEDBACK_ADMIN_DIDS ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean)
  );
}

export function isFeedbackAdmin(
  user: { did: string; handle: string } | null | undefined,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (!user) return false;
  const admins = feedbackAdmins(env);
  return admins.has(user.did.toLowerCase()) || admins.has(user.handle.toLowerCase());
}
