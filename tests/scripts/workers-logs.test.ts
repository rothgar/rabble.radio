// tests/scripts/workers-logs.test.ts
//
// requestTimeline() and formatTimeline() from scripts/lib/workers-logs.mjs:
// the per-request view that log-triage attaches to its issues and
// request-logs prints. Fixtures mimic Workers Logs events (one invocation
// event plus the logger's JSON lines parsed into `source`).

import { describe, expect, it } from 'vitest';
import { formatTimeline, redactLine, requestTimeline } from '../../scripts/lib/workers-logs.mjs';

const t0 = 1_700_000_000_000;
const invocation = (outcome: string, wallTimeMs: number) => ({
  timestamp: t0,
  $metadata: { type: 'cf-worker-event', requestId: 'req1' },
  $workers: { outcome, wallTimeMs, requestId: 'req1', event: { request: { url: 'https://rabble.rodeo/api/me/shows', headers: { cookie: 'secret' } } } },
});
const line = (ms: number, source: Record<string, unknown>) => ({
  timestamp: t0 + ms,
  $metadata: { type: 'cf-worker', requestId: 'req1', level: 'info' },
  source: { level: 'info', ...source },
});

describe('requestTimeline', () => {
  it('flags a D1 query that started and never finished', () => {
    const events = [
      line(10, { event: 'db.query.start', queryId: 'd1q_2', model: 'ShowSession', operation: 'findMany' }),
      line(5, { event: 'db.query.start', queryId: 'd1q_1', model: 'Space', operation: 'findMany' }),
      invocation('canceled', 30000),
      line(90, { event: 'db.query.done', queryId: 'd1q_1', model: 'Space', operation: 'findMany', durationMs: 85 }),
    ];
    const t = requestTimeline(events);
    expect(t.path).toBe('/api/me/shows');
    expect(t.outcome).toBe('canceled');
    expect(t.wallMs).toBe(30000);
    expect(t.neverFinished).toEqual([{ queryId: 'd1q_2', query: 'ShowSession.findMany' }]);
    // Sorted by time, relative to the first event.
    expect(t.lines[0]).toContain('[request] /api/me/shows');
    expect(t.lines[1]).toContain('+     5ms');
    expect(t.lines[3]).toContain('db.query.done d1q_1 Space.findMany 85ms');
  });

  it('reports a clean request and redacts identities in free-text lines', () => {
    const events = [
      invocation('ok', 120),
      line(1, { event: 'db.query.start', queryId: 'd1q_1', model: 'User', operation: 'findUnique' }),
      line(40, { event: 'db.query.done', queryId: 'd1q_1', model: 'User', operation: 'findUnique', durationMs: 39 }),
      line(41, { level: 'warn', message: 'session for did:plc:abc123 and bob@example.com expired' }),
    ];
    const t = requestTimeline(events);
    expect(t.neverFinished).toEqual([]);
    const text = formatTimeline('req1', t);
    expect(text).toContain('every D1 query that started also finished');
    expect(text).toContain('did:*');
    expect(text).toContain('[email]');
    expect(text).not.toContain('abc123');
    expect(text).not.toContain('secret');
  });

  it('caps long timelines', () => {
    const events = [invocation('ok', 1), ...Array.from({ length: 100 }, (_, i) => line(i + 1, { message: `line ${i}` }))];
    const text = formatTimeline('req1', requestTimeline(events), { maxLines: 10 });
    expect(text).toContain('… 91 more lines');
  });
});

describe('redactLine', () => {
  it('scrubs bearer tokens', () => {
    expect(redactLine('authorization: Bearer abc.def')).toBe('authorization: Bearer [redacted]');
  });
});
