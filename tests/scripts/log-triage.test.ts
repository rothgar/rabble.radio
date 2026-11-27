// tests/scripts/log-triage.test.ts
//
// The CLI as a black box, like latency-triage: --input with a fixture shaped
// like the telemetry API's events, --dry-run so GitHub is never called,
// --bodies --json to read the issue body it would file. Checks that the
// body of a hung-request group carries the request's timeline with the
// unfinished D1 query named, built from the same input file.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = path.resolve(__dirname, '../../scripts/log-triage.mjs');
const t0 = Date.now() - 60_000;
const service = 'rabble-dev';

const HUNG = "The Workers runtime canceled this request because it detected that your Worker's code had hung and would never generate a response.";
// The runtime reports a hang as a log event with an exception (as in #158's
// sample line) alongside the request's own invocation event.
const invocation = {
  timestamp: t0,
  $metadata: { type: 'cf-worker-event', requestId: 'reqhung', service, message: 'GET https://rabble.rodeo/api/me/shows' },
  $workers: { outcome: 'canceled', wallTimeMs: 30000, requestId: 'reqhung', scriptName: service, event: { request: { url: 'https://rabble.rodeo/api/me/shows' } } },
};
const hung = {
  timestamp: t0 + 30000,
  $metadata: { type: 'cf-worker', requestId: 'reqhung', service, level: 'error', error: HUNG, url: 'https://rabble.rodeo/api/me/shows' },
  $workers: { scriptName: service, event: { request: { url: 'https://rabble.rodeo/api/me/shows' } } },
  source: { message: HUNG, exception: { name: 'Error' } },
};
const line = (ms: number, source: Record<string, unknown>) => ({
  timestamp: t0 + ms,
  $metadata: { type: 'cf-worker', requestId: 'reqhung', service, level: 'info' },
  $workers: { scriptName: service },
  source: { level: 'info', ...source },
});
const fixture = [
  invocation,
  hung,
  line(5, { event: 'db.query.start', queryId: 'd1q_1', model: 'Space', operation: 'findMany' }),
  line(60, { event: 'db.query.done', queryId: 'd1q_1', model: 'Space', operation: 'findMany', durationMs: 55 }),
  line(61, { event: 'db.query.start', queryId: 'd1q_2', model: 'ShowSession', operation: 'findMany' }),
];

let dir: string | null = null;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe('log-triage --dry-run --bodies', () => {
  it('attaches the request timeline with the unfinished query to the issue body', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'log-triage-'));
    const input = path.join(dir, 'events.json');
    writeFileSync(input, JSON.stringify(fixture));
    const out = execFileSync(process.execPath, [SCRIPT, `--services=${service}`, `--input=${input}`, '--dry-run', '--bodies', '--json'], {
      encoding: 'utf8',
      env: { ...process.env, CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_ACCOUNT_ID: '', GH_TOKEN: '' },
    });
    const report = JSON.parse(out);
    expect(report.groups).toHaveLength(1);
    const g = report.groups[0];
    expect(g.title).toBe('Logs (dev): Worker hung, runtime canceled the request');
    expect(g.body).toContain('Request timelines: 1 of 1 left a D1 query unfinished (ShowSession.findMany)');
    expect(g.body).toContain('--- never finished: d1q_2 ShowSession.findMany');
    expect(g.body).toContain('db.query.done d1q_1 Space.findMany 55ms');
  });
});
