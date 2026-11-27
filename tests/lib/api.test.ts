import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetCurrentUser } = vi.hoisted(() => ({ mockGetCurrentUser: vi.fn() }));

vi.mock('@/lib/session', () => ({ getCurrentUser: mockGetCurrentUser }));

import { jsonError, readJson, requireUser } from '@/lib/api';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('jsonError', () => {
  it('builds the { error, message } envelope', async () => {
    const res = jsonError(400, 'validation_error', 'Title is required.');
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'validation_error',
      message: 'Title is required.',
    });
  });

  it('omits message when not given', async () => {
    const res = jsonError(404, 'not_found');
    await expect(res.json()).resolves.toEqual({ error: 'not_found' });
  });

  it('merges extra fields into the envelope', async () => {
    const res = jsonError(401, 'unauthorized', undefined, { ok: false });
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'unauthorized' });
  });
});

describe('requireUser', () => {
  it('returns the current user when signed in', async () => {
    const user = { did: 'did:plc:a', handle: 'a.bsky.social', displayName: null };
    mockGetCurrentUser.mockResolvedValue(user);
    expect(await requireUser()).toBe(user);
  });

  it('returns a 401 Response when signed out', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const result = await requireUser();
    expect(result).toBeInstanceOf(Response);
    const res = result as Response;
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
  });

  it('merges extra fields into the 401 body', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const result = await requireUser({ ok: false });
    const res = result as Response;
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'unauthorized' });
  });
});

describe('readJson', () => {
  it('returns the parsed body', async () => {
    const request = new Request('https://example.com', {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
    });
    expect(await readJson<{ a: number }>(request)).toEqual({ a: 1 });
  });

  it('returns a 400 invalid_json Response for a bad body', async () => {
    const request = new Request('https://example.com', { method: 'POST', body: '{not json' });
    const result = await readJson(request);
    expect(result).toBeInstanceOf(Response);
    const res = result as Response;
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'invalid_json',
      message: 'Request body must be JSON.',
    });
  });

  it('uses a custom message when given', async () => {
    const request = new Request('https://example.com', { method: 'POST', body: '{not json' });
    const result = await readJson(request, 'Body must be JSON.');
    const res = result as Response;
    await expect(res.json()).resolves.toEqual({
      error: 'invalid_json',
      message: 'Body must be JSON.',
    });
  });
});
