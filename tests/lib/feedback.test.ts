// tests/lib/feedback.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreate, mockFindMany } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFindMany: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: { feedback: { create: mockCreate, findMany: mockFindMany } },
}));

import {
  createFeedback,
  FEEDBACK_CONTEXT_MAX,
  FeedbackValidationError,
  isFeedbackAdmin,
  listFeedback,
  serializeContext,
} from '@/lib/feedback';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fb1',
    did: 'did:plc:a',
    handle: 'alice.test',
    category: 'problem',
    message: 'Audio cut out',
    platform: 'android',
    appVersion: '0.1.0',
    page: 'show/sp1',
    spaceId: 'sp1',
    userAgent: 'okhttp',
    context: '{"room":{"onAir":true}}',
    createdAt: '2026-11-06T20:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockImplementation(async ({ data }) => row({ ...data, id: 'fb-new' }));
});

describe('createFeedback', () => {
  it('stores the message with captured context and returns the row', async () => {
    const out = await createFeedback({
      did: 'did:plc:a',
      handle: 'alice.test',
      message: '  Audio cut out  ',
      platform: 'android',
      appVersion: '0.1.0',
      spaceId: 'sp1',
      context: { room: { onAir: true } },
    });
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        message: 'Audio cut out',
        platform: 'android',
        category: 'problem',
        context: '{"room":{"onAir":true}}',
      }),
    });
    expect(out.id).toBe('fb-new');
    expect(out.context).toEqual({ room: { onAir: true } });
    expect(out.createdAt).toBeInstanceOf(Date);
  });

  it('rejects an empty message', async () => {
    await expect(createFeedback({ message: '   ' })).rejects.toBeInstanceOf(FeedbackValidationError);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects an oversized message', async () => {
    await expect(createFeedback({ message: 'x'.repeat(4001) })).rejects.toThrow(/4000/);
  });

  it('falls back to defaults for unknown category and platform', async () => {
    await createFeedback({ message: 'hi', category: 'rant', platform: 'toaster' });
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ category: 'problem', platform: 'web' }),
    });
  });

  it('stores a beta sign-up with its email', async () => {
    await createFeedback({
      message: 'Requesting Android beta access.',
      category: 'beta',
      email: '  Alice@Example.com  ',
      platform: 'android',
    });
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ category: 'beta', email: 'Alice@Example.com' }),
    });
  });

  it('rejects a beta sign-up with no email', async () => {
    await expect(
      createFeedback({ message: 'Requesting Android beta access.', category: 'beta' })
    ).rejects.toThrow(/Email is required/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects a malformed email', async () => {
    await expect(createFeedback({ message: 'hi', email: 'not-an-email' })).rejects.toThrow(
      /valid address/
    );
  });
});

describe('serializeContext', () => {
  it('returns {} for non-objects', () => {
    expect(serializeContext(undefined)).toBe('{}');
    expect(serializeContext('nope')).toBe('{}');
  });

  it('truncates oversized context instead of failing', () => {
    const big = { blob: 'y'.repeat(FEEDBACK_CONTEXT_MAX * 2) };
    const out = JSON.parse(serializeContext(big));
    expect(out.truncated).toBe(true);
    expect(out.originalLength).toBeGreaterThan(FEEDBACK_CONTEXT_MAX);
    expect(serializeContext(big).length).toBeLessThanOrEqual(FEEDBACK_CONTEXT_MAX);
  });
});

describe('listFeedback', () => {
  it('returns newest first with parsed context and tolerates bad JSON', async () => {
    mockFindMany.mockResolvedValue([row(), row({ id: 'fb2', context: 'not json', category: 'weird' })]);
    const out = await listFeedback(10);
    expect(mockFindMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' }, take: 10 });
    expect(out[0].context).toEqual({ room: { onAir: true } });
    expect(out[1].context).toEqual({});
    expect(out[1].category).toBe('other');
  });
});

describe('isFeedbackAdmin', () => {
  it('matches DIDs and handles from FEEDBACK_ADMIN_DIDS, case-insensitively', () => {
    const env = { FEEDBACK_ADMIN_DIDS: 'did:plc:admin, @Justin.Test' };
    expect(isFeedbackAdmin({ did: 'did:plc:admin', handle: 'x' }, env)).toBe(true);
    expect(isFeedbackAdmin({ did: 'did:plc:other', handle: 'justin.test' }, env)).toBe(true);
    expect(isFeedbackAdmin({ did: 'did:plc:other', handle: 'bob' }, env)).toBe(false);
    expect(isFeedbackAdmin(null, env)).toBe(false);
    expect(isFeedbackAdmin({ did: 'did:plc:admin', handle: 'x' }, {})).toBe(false);
  });
});
