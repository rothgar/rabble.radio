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

// ---------------------------------------------------------------------------
// Filing against a stubbed GitHub: the dedup rules, which --dry-run skips.

const PROD = 'rabble-prod';
const REPO = 'rothgar/rabble.radio';
// The group #176 filed and 6a769ba fixed: it sat on main for hours before the
// v0.2.0 production deploy, and the scan re-filed it as new work (#215).
const INTEROP = "TypeError: Cannot read properties of undefined (reading 'interopDefault')";
const minutesAgo = (m: number) => Date.now() - m * 60_000;
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

const interopFailure = (at: number, rid: string) => ({
  timestamp: at,
  $metadata: { type: 'cf-worker', requestId: rid, service: PROD, level: 'error', error: INTEROP, url: 'https://rabble.radio/.well-known/security.txt' },
  $workers: { scriptName: PROD, event: { request: { url: 'https://rabble.radio/.well-known/security.txt', path: '/.well-known/security.txt' } } },
  source: { message: INTEROP, exception: { name: 'TypeError' } },
});

/** The fingerprint the script would stamp the issue for these events. */
function fingerprintOf(events: unknown[]) {
  const fpDir = mkdtempSync(path.join(tmpdir(), 'log-triage-fp-'));
  try {
    const file = path.join(fpDir, 'events.json');
    writeFileSync(file, JSON.stringify(events));
    const out = execFileSync(process.execPath, [SCRIPT, `--services=${PROD}`, `--input=${file}`, '--dry-run', '--bodies', '--json'], {
      encoding: 'utf8',
      env: { ...process.env, CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_ACCOUNT_ID: '', GH_TOKEN: '' },
    });
    const [group] = JSON.parse(out).groups;
    const fp = /log-triage:fp=([0-9a-f]{8})/.exec(group.body)?.[1];
    if (!fp) throw new Error(`fixture produced no fingerprint: ${group.title}`);
    return fp;
  } finally {
    rmSync(fpDir, { recursive: true, force: true });
  }
}

/**
 * The filing path against a stubbed GitHub API. `stub` is the repository the
 * script sees: its open and closed `logs` issues and the runs of the workflow
 * that deployed the Worker, so the scan's idea of "what is already filed" and
 * "what is live" both come from the fixture.
 */
function scan(
  events: unknown[],
  stub: { open?: unknown[]; closed?: unknown[]; deployRuns?: unknown[]; failRuns?: boolean },
  extraArgs: string[] = []
) {
  dir = mkdtempSync(path.join(tmpdir(), 'log-triage-gh-'));
  const input = path.join(dir, 'events.json');
  const github = path.join(dir, 'github.json');
  const runner = path.join(dir, 'github-stub.mjs');
  writeFileSync(input, JSON.stringify(events));
  writeFileSync(github, JSON.stringify({ open: stub.open ?? [], closed: stub.closed ?? [], deployRuns: stub.deployRuns ?? [], failRuns: stub.failRuns ?? false }));
  writeFileSync(
    runner,
    [
      `import { readFile } from 'node:fs/promises';`,
      `const fixture = JSON.parse(await readFile(${JSON.stringify(github)}, 'utf8'));`,
      `const answer = (payload) => ({ ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) });`,
      `globalThis.fetch = async (rawUrl, init = {}) => {`,
      `  const url = new URL(rawUrl);`,
      `  const parts = url.pathname.split('/').filter(Boolean);`,
      `  const last = parts[parts.length - 1];`,
      `  if (last === 'issues' && (init.method ?? 'GET').toUpperCase() === 'POST') {`,
      `    return answer({ number: 901, html_url: 'https://github.com/' + ${JSON.stringify(REPO)} + '/issues/901' });`,
      `  }`,
      `  if (last === 'issues' && parts[0] === 'repos') return answer(url.searchParams.get('state') === 'closed' ? fixture.closed : fixture.open);`,
      `  if (last === 'runs') return fixture.failRuns ? { ok: false, status: 500, text: async () => 'boom' } : answer({ workflow_runs: fixture.deployRuns });`,
      `  if (last === 'comments') return answer([]);`,
      `  throw new Error('stub has no route for ' + url.pathname);`,
      `};`,
      `await import(${JSON.stringify(SCRIPT)});`,
    ].join('\n')
  );
  const out = execFileSync(process.execPath, [runner, `--services=${PROD}`, `--repo=${REPO}`, `--input=${input}`, '--json', ...extraArgs], {
    encoding: 'utf8',
    env: { ...process.env, CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_ACCOUNT_ID: '', GH_TOKEN: 'stub-token' },
  });
  return JSON.parse(out);
}

const closedIssue = (fp: string) => ({
  number: 176,
  pull_request: null,
  state: 'closed',
  labels: [{ name: 'logs' }, { name: 'bug' }],
  body: `<!-- log-triage:fp=${fp} -->\n\n## Today\n\nThe \`${PROD}\` Worker logged this exception.\n`,
});

describe('log-triage files against the deployed build, not the merged one', () => {
  const deployAt = minutesAgo(120);
  const deployRuns = [{ status: 'completed', conclusion: 'success', created_at: iso(deployAt), updated_at: iso(deployAt) }];

  it('does not re-file a fingerprint whose closed issue was fixed before the last deploy', () => {
    const before = [interopFailure(minutesAgo(180), 'req_a1'), interopFailure(minutesAgo(175), 'req_a2')];
    const closed = [closedIssue(fingerprintOf(before))];

    const report = scan(before, { closed, deployRuns }, ['--hours=6', `--deployed-at=${iso(deployAt)}`]);

    expect(report.groups).toHaveLength(1);
    expect(report.filed).toHaveLength(0);
    expect(report.skipped).toHaveLength(1);
    expect(report.skipped[0].why).toMatch(/deploy/i);
  });

  it('files the same fingerprint when an event postdates the last deploy', () => {
    const before = [interopFailure(minutesAgo(180), 'req_a1')];
    const events = [...before, interopFailure(minutesAgo(40), 'req_b1')];
    const closed = [closedIssue(fingerprintOf(events))];

    const report = scan(events, { closed, deployRuns }, ['--hours=6', `--deployed-at=${iso(deployAt)}`]);

    expect(report.filed).toHaveLength(1);
    expect(report.filed[0].issue).toBe(901);
  });

  it('resolves the deploy time from the Actions API when no --deployed-at override is given', () => {
    const before = [interopFailure(minutesAgo(180), 'req_a1'), interopFailure(minutesAgo(175), 'req_a2')];
    const closed = [closedIssue(fingerprintOf(before))];

    const report = scan(before, { closed, deployRuns }, ['--hours=6']);

    expect(report.filed).toHaveLength(0);
    expect(report.skipped).toHaveLength(1);
    expect(report.skipped[0].why).toMatch(/deploy/i);
  });

  it('fails open and files when the Actions API call errors', () => {
    const before = [interopFailure(minutesAgo(180), 'req_a1'), interopFailure(minutesAgo(175), 'req_a2')];
    const closed = [closedIssue(fingerprintOf(before))];

    const report = scan(before, { closed, deployRuns, failRuns: true }, ['--hours=6']);

    expect(report.filed).toHaveLength(1);
    expect(report.skipped).toHaveLength(0);
  });
});
