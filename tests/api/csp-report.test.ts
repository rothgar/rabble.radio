// tests/api/csp-report.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockLoggerWarn } = vi.hoisted(() => ({ mockLoggerWarn: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: mockLoggerWarn, error: vi.fn(), debug: vi.fn() },
}));

import { POST } from '@/app/api/csp-report/route';

function post(body: unknown, contentType = 'application/json'): Promise<Response> {
  return POST(
    new NextRequest('http://localhost/api/csp-report', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'content-type': contentType },
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/csp-report', () => {
  it('logs a legacy report-uri violation at warn level and returns 204', async () => {
    const res = await post(
      {
        'csp-report': {
          'document-uri': 'https://rabble.rodeo/room/abc',
          'violated-directive': 'script-src-elem',
          'blocked-uri': 'https://evil.example/x.js',
          'source-file': 'https://rabble.rodeo/room/abc',
          'line-number': 12,
          'column-number': 3,
        },
      },
      'application/csp-report'
    );
    expect(res.status).toBe(204);
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'csp.violation',
      expect.objectContaining({
        documentUri: 'https://rabble.rodeo/room/abc',
        violatedDirective: 'script-src-elem',
        blockedUri: 'https://evil.example/x.js',
        sourceFile: 'https://rabble.rodeo/room/abc',
        lineNumber: 12,
        columnNumber: 3,
      })
    );
  });

  it('logs every violation in a Reporting API batch and returns 204', async () => {
    const res = await post(
      [
        {
          type: 'csp-violation',
          url: 'https://rabble.rodeo/room/abc',
          body: {
            documentURL: 'https://rabble.rodeo/room/abc',
            effectiveDirective: 'connect-src',
            blockedURL: 'https://evil.example/ws',
            disposition: 'report',
          },
        },
        {
          type: 'csp-violation',
          url: 'https://rabble.rodeo/room/xyz',
          body: { documentURL: 'https://rabble.rodeo/room/xyz', effectiveDirective: 'img-src' },
        },
      ],
      'application/reports+json'
    );
    expect(res.status).toBe(204);
    expect(mockLoggerWarn).toHaveBeenCalledTimes(2);
    expect(mockLoggerWarn).toHaveBeenNthCalledWith(
      1,
      'csp.violation',
      expect.objectContaining({ documentUri: 'https://rabble.rodeo/room/abc', effectiveDirective: 'connect-src' })
    );
  });

  it('ignores non-csp-violation report types in a batch', async () => {
    const res = await post([{ type: 'deprecation', body: { id: 'something' } }]);
    expect(res.status).toBe(204);
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it('truncates an oversized field instead of rejecting', async () => {
    await post({ 'csp-report': { 'document-uri': 'x'.repeat(5000) } });
    const fields = mockLoggerWarn.mock.calls[0][1];
    expect(fields.documentUri.length).toBe(1000);
  });

  it('strips the query string and fragment from reported URLs', async () => {
    await post({
      'csp-report': {
        'document-uri': 'https://rabble.rodeo/api/auth/bluesky/callback?code=secret&state=xyz',
        'blocked-uri': 'https://evil.example/x.js?token=abc',
        'source-file': 'https://rabble.rodeo/room/abc#frag',
      },
    });
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'csp.violation',
      expect.objectContaining({
        documentUri: 'https://rabble.rodeo/api/auth/bluesky/callback',
        blockedUri: 'https://evil.example/x.js',
        sourceFile: 'https://rabble.rodeo/room/abc',
      })
    );
  });

  it('caps a Reporting API batch at 20 entries instead of logging all of them', async () => {
    const batch = Array.from({ length: 50 }, (_, i) => ({
      type: 'csp-violation',
      body: { documentURL: `https://rabble.rodeo/room/${i}` },
    }));
    const res = await post(batch, 'application/reports+json');
    expect(res.status).toBe(204);
    expect(mockLoggerWarn).toHaveBeenCalledTimes(20);
  });

  it('returns 204 for an unrecognized but valid JSON body', async () => {
    const res = await post({ unexpected: true });
    expect(res.status).toBe(204);
  });

  it('returns 400 on invalid JSON', async () => {
    const res = await post('{nope');
    expect(res.status).toBe(400);
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });
});
