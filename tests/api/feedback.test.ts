// tests/api/feedback.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetCurrentUser, mockCreateFeedback, mockListFeedback, mockIsAdmin } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockCreateFeedback: vi.fn(),
  mockListFeedback: vi.fn(),
  mockIsAdmin: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getCurrentUser: mockGetCurrentUser }));
vi.mock('@/lib/feedback', async () => {
  const actual = await vi.importActual<typeof import('@/lib/feedback')>('@/lib/feedback');
  return {
    ...actual,
    createFeedback: mockCreateFeedback,
    listFeedback: mockListFeedback,
    isFeedbackAdmin: mockIsAdmin,
  };
});
vi.mock('@/lib/db', () => ({ prisma: {} }));

import { FeedbackValidationError } from '@/lib/feedback';
import { GET, POST } from '@/app/api/feedback/route';

function post(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    new NextRequest('http://localhost/api/feedback', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'content-type': 'application/json', 'user-agent': 'TestBrowser/1', ...headers },
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(null);
  mockCreateFeedback.mockImplementation(async (input) => ({
    id: 'fb1',
    did: input.did ?? null,
    platform: input.platform ?? 'web',
    category: input.category ?? 'problem',
  }));
});

describe('POST /api/feedback', () => {
  it('stores a signed-out report with the user agent and context', async () => {
    const res = await post({
      message: 'Login loops',
      platform: 'web',
      page: 'https://rabble.rodeo/login',
      context: { recentErrors: [{ message: 'boom' }] },
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'fb1' });
    expect(mockCreateFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        did: null,
        handle: null,
        message: 'Login loops',
        platform: 'web',
        page: 'https://rabble.rodeo/login',
        userAgent: 'TestBrowser/1',
        context: { recentErrors: [{ message: 'boom' }] },
      })
    );
  });

  it('attaches the session user when signed in', async () => {
    mockGetCurrentUser.mockResolvedValue({ did: 'did:plc:a', handle: 'alice.test' });
    await post({ message: 'hi', platform: 'android', appVersion: '0.1.0', spaceId: 'sp1' });
    expect(mockCreateFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ did: 'did:plc:a', handle: 'alice.test', appVersion: '0.1.0', spaceId: 'sp1' })
    );
  });

  it('returns 400 on invalid JSON and on validation errors', async () => {
    expect((await post('{nope')).status).toBe(400);
    mockCreateFeedback.mockRejectedValueOnce(new FeedbackValidationError('Message is required.'));
    const res = await post({ message: '' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'validation_error', message: 'Message is required.' });
  });

  it('returns 500 when storage fails', async () => {
    mockCreateFeedback.mockRejectedValueOnce(new Error('d1 down'));
    expect((await post({ message: 'x' })).status).toBe(500);
  });
});

describe('GET /api/feedback', () => {
  const get = () => GET(new NextRequest('http://localhost/api/feedback?limit=5'));

  it('requires a session and admin membership', async () => {
    expect((await get()).status).toBe(401);
    mockGetCurrentUser.mockResolvedValue({ did: 'did:plc:a', handle: 'alice.test' });
    mockIsAdmin.mockReturnValue(false);
    expect((await get()).status).toBe(403);
  });

  it('lists reports for admins', async () => {
    mockGetCurrentUser.mockResolvedValue({ did: 'did:plc:admin', handle: 'admin.test' });
    mockIsAdmin.mockReturnValue(true);
    mockListFeedback.mockResolvedValue([
      { id: 'fb1', message: 'x', context: {}, createdAt: new Date('2026-11-06T20:00:00Z') },
    ]);
    const res = await get();
    expect(res.status).toBe(200);
    expect(mockListFeedback).toHaveBeenCalledWith(5);
    const body = await res.json();
    expect(body.feedback[0]).toMatchObject({ id: 'fb1', createdAt: '2026-11-06T20:00:00.000Z' });
  });
});
