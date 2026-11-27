import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postJson } from '@/lib/post-json';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('postJson', () => {
  it('posts JSON and returns the parsed body', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ on: true }) });
    await expect(postJson('/api/x', { a: 1 })).resolves.toEqual({ on: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
    });
  });

  it('omits the body when none is given', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    await postJson('/api/x');
    expect(fetchMock).toHaveBeenCalledWith('/api/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
  });

  it('throws the server message on a non-ok response', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ message: 'nope' }) });
    await expect(postJson('/api/x')).rejects.toThrow('nope');
  });

  it('falls back to the error field, then the given fallback with the status, then a generic message', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: 'bad' }) });
    await expect(postJson('/api/x')).rejects.toThrow('bad');

    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await expect(postJson('/api/x', undefined, 'Could not save')).rejects.toThrow('Could not save (HTTP 500).');

    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    await expect(postJson('/api/x')).rejects.toThrow('Request failed (HTTP 503).');
  });

  it('tolerates a non-JSON body', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    });
    await expect(postJson('/api/x', undefined, 'Could not save')).rejects.toThrow('Could not save (HTTP 500).');
  });
});
