// tests/api/crashes.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetCurrentUser, mockLoggerError } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockLoggerError: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getCurrentUser: mockGetCurrentUser }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: mockLoggerError, debug: vi.fn() },
}));

import { POST } from '@/app/api/crashes/route';

function post(body: unknown): Promise<Response> {
  return POST(
    new NextRequest('http://localhost/api/crashes', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(null);
});

describe('POST /api/crashes', () => {
  it('logs a valid signed-out crash report and returns 204 with no did/handle', async () => {
    const res = await post({
      platform: 'android',
      message: 'NullPointerException in Foo',
      exceptionClass: 'java.lang.NullPointerException',
      appVersion: '1.2.3',
      osVersion: '14',
      device: 'Pixel 8',
      screen: 'RoomScreen',
      fatal: true,
    });
    expect(res.status).toBe(204);
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
    expect(mockLoggerError).toHaveBeenCalledWith(
      'mobile.crash',
      expect.objectContaining({
        err: { message: 'java.lang.NullPointerException: NullPointerException in Foo' },
        platform: 'android',
        message: 'NullPointerException in Foo',
        exceptionClass: 'java.lang.NullPointerException',
        appVersion: '1.2.3',
        osVersion: '14',
        device: 'Pixel 8',
        screen: 'RoomScreen',
        fatal: true,
        did: undefined,
        handle: undefined,
      })
    );
  });

  it('attaches did/handle when signed in', async () => {
    mockGetCurrentUser.mockResolvedValue({ did: 'did:plc:a', handle: 'alice.test' });
    const res = await post({ platform: 'ios', message: 'Fatal error: nil unwrap', fatal: true });
    expect(res.status).toBe(204);
    expect(mockLoggerError).toHaveBeenCalledWith(
      'mobile.crash',
      expect.objectContaining({ did: 'did:plc:a', handle: 'alice.test' })
    );
  });

  it('truncates oversized message and stack instead of rejecting', async () => {
    const longMessage = 'x'.repeat(3000);
    const longStack = 'y'.repeat(10000);
    const res = await post({ platform: 'ios', message: longMessage, stack: longStack, fatal: false });
    expect(res.status).toBe(204);
    const fields = mockLoggerError.mock.calls[0][1];
    expect(fields.message.length).toBe(2000);
    expect(fields.stack.length).toBe(8000);
  });

  it('truncates oversized optional string fields instead of rejecting', async () => {
    const res = await post({
      platform: 'android',
      message: 'boom',
      exceptionClass: 'x'.repeat(600),
      appVersion: 'y'.repeat(600),
      osVersion: 'z'.repeat(600),
      device: 'd'.repeat(600),
      screen: 's'.repeat(600),
    });
    expect(res.status).toBe(204);
    const fields = mockLoggerError.mock.calls[0][1];
    expect(fields.exceptionClass.length).toBe(500);
    expect(fields.appVersion.length).toBe(500);
    expect(fields.osVersion.length).toBe(500);
    expect(fields.device.length).toBe(500);
    expect(fields.screen.length).toBe(500);
  });

  it('returns 400 when message is missing', async () => {
    const res = await post({ platform: 'android', fatal: true });
    expect(res.status).toBe(400);
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid platform', async () => {
    const res = await post({ platform: 'windows', message: 'oops' });
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid JSON', async () => {
    const res = await post('{nope');
    expect(res.status).toBe(400);
  });

  it('two different exceptionClass/message pairs produce two different err.message signatures', async () => {
    await post({ platform: 'android', message: 'NPE in Foo', exceptionClass: 'java.lang.NullPointerException' });
    await post({ platform: 'ios', message: 'nil unwrap in Bar', exceptionClass: 'FatalError' });
    const first = mockLoggerError.mock.calls[0][1].err.message;
    const second = mockLoggerError.mock.calls[1][1].err.message;
    expect(first).not.toBe(second);
  });
});
