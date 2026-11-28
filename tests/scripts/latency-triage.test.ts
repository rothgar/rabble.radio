// tests/scripts/latency-triage.test.ts
//
// Two layers. The CLI as a black box: spawn it with --input pointed at a
// fixture shaped like the telemetry API's calculations-view result (keyed by
// service), --dry-run so it never calls GitHub, and --json so its report is
// easy to assert on — consistent with scripts/log-triage.mjs's convention of
// exporting nothing. And decide(), imported directly: the de-dup/wontfix/
// comment-gate logic that --dry-run never reaches, which doesn't touch the
// network itself (its one network dependency, fetching an issue's comments,
// is injected), so it's tested in-process with fixtures instead of a real
// GitHub call.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decide, fp, fpOf, lastSlowAt } from '../../scripts/latency-triage.mjs';

const SCRIPT = path.resolve(__dirname, '../../scripts/latency-triage.mjs');

function calcResult(p95: number, p99: number, count: number) {
  return {
    calculations: [
      { alias: 'p95', calculation: 'P95', aggregates: [{ value: p95 }] },
      { alias: 'p99', calculation: 'P99', aggregates: [{ value: p99 }] },
      { alias: 'count', calculation: 'COUNT', aggregates: [{ value: count }] },
    ],
  };
}

let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function run(fixture: Record<string, unknown>, extraArgs: string[]) {
  dir = mkdtempSync(path.join(tmpdir(), 'latency-triage-'));
  const file = path.join(dir, 'stats.json');
  writeFileSync(file, JSON.stringify(fixture));
  const out = execFileSync(process.execPath, [SCRIPT, `--input=${file}`, '--dry-run', '--json', ...extraArgs], {
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

describe('latency-triage.mjs (CLI, --dry-run)', () => {
  it('flags a service whose P95 crosses the threshold and leaves one under it alone', () => {
    const report = run(
      {
        'rabble-dev': calcResult(800, 1200, 540),
        'rabble-prod': calcResult(6200, 9100, 1800),
      },
      ['--services=rabble-dev,rabble-prod', '--threshold-ms=5000']
    );

    expect(report.thresholdMs).toBe(5000);
    expect(report.stats).toEqual([
      { service: 'rabble-dev', env: 'dev', p95: 800, p99: 1200, count: 540 },
      { service: 'rabble-prod', env: 'prod', p95: 6200, p99: 9100, count: 1800 },
    ]);

    const devSkip = report.skipped.find((s: { service: string }) => s.service === 'rabble-dev');
    expect(devSkip.why).toMatch(/under the 5000ms threshold/);

    const prodSkip = report.skipped.find((s: { service: string }) => s.service === 'rabble-prod');
    expect(prodSkip.why).toBe('dry run');
    expect(prodSkip.title).toBe('Latency (prod): P95 wall time 6200ms (> 5000ms)');
  });

  it('skips a service with no invocations in the window instead of flagging it', () => {
    const report = run(
      {
        'rabble-dev': calcResult(800, 1200, 540),
        'rabble-prod': {},
      },
      ['--services=rabble-dev,rabble-prod']
    );

    const prodSkip = report.skipped.find((s: { service: string }) => s.service === 'rabble-prod');
    expect(prodSkip.why).toBe('no invocations in window');
    expect(prodSkip.p95).toBeNull();
  });

  it('writes the issue body with the Today/Wanted/Done-when sections when --bodies is passed', () => {
    const report = run({ 'rabble-prod': calcResult(7000, 9000, 900) }, [
      '--services=rabble-prod',
      '--threshold-ms=5000',
      '--bodies',
    ]);

    const [skip] = report.skipped;
    expect(skip.body).toContain('<!-- latency-triage:fp=');
    expect(skip.body).toContain('## Today');
    expect(skip.body).toContain("The `rabble-prod` Worker's P95 wall time was **7000ms** (P99 **9000ms**)");
    expect(skip.body).toContain('## Wanted');
    expect(skip.body).toContain('## Done when');
    expect(skip.body).toContain('close this issue as `wontfix`');
  });

  it('tells apart an unparseable telemetry response from a genuinely quiet window', () => {
    const report = run({ 'rabble-prod': { calculations: [{ alias: 'p50', aggregates: [{ value: 100 }] }] } }, [
      '--services=rabble-prod',
    ]);
    const skip = report.skipped.find((s: { service: string }) => s.service === 'rabble-prod');
    expect(skip.why).toMatch(/no parseable P95\/P99\/count/);
  });

  it('skips a quiet service (no calculations at all) as "no invocations", not a parse mismatch', () => {
    const report = run({ 'rabble-prod': {} }, ['--services=rabble-prod']);
    const skip = report.skipped.find((s: { service: string }) => s.service === 'rabble-prod');
    expect(skip.why).toBe('no invocations in window');
  });
});

describe('decide()', () => {
  const s = { service: 'rabble-prod', env: 'prod', p95: 7000, p99: 9000, count: 900 };
  const row = { service: 'rabble-prod', env: 'prod', p95: 7000, p99: 9000, count: 900 };
  const breaching = [{ s, row }];
  const id = fp('rabble-prod');
  const dayAgo = (hours: number) => new Date(Date.now() - hours * 3600 * 1000).toISOString();

  it('comments on the existing open issue instead of filing a duplicate', async () => {
    const existing = { number: 42, body: `<!-- latency-triage:fp=${id} -->`, labels: [], created_at: dayAgo(48) };
    const getComments = vi.fn().mockResolvedValue([]);

    const decisions = await decide(breaching, { open: [existing], closed: [], getComments });

    expect(decisions).toEqual([{ kind: 'comment', row, s, issue: 42 }]);
    expect(getComments).toHaveBeenCalledWith(42);
  });

  it('skips commenting again within 24h of the last "still happening" comment', async () => {
    const existing = { number: 42, body: `<!-- latency-triage:fp=${id} -->`, labels: [], created_at: dayAgo(48) };
    const getComments = vi.fn().mockResolvedValue([{ body: '<!-- latency-triage -->\nStill above threshold', created_at: dayAgo(2) }]);

    const decisions = await decide(breaching, { open: [existing], closed: [], getComments });

    expect(decisions).toEqual([{ kind: 'skip', row, why: '#42 updated in the last 24h' }]);
  });

  it('comments again once the last "still happening" comment is over 24h old', async () => {
    const existing = { number: 42, body: `<!-- latency-triage:fp=${id} -->`, labels: [], created_at: dayAgo(72) };
    const getComments = vi.fn().mockResolvedValue([{ body: '<!-- latency-triage -->\nStill above threshold', created_at: dayAgo(30) }]);

    const decisions = await decide(breaching, { open: [existing], closed: [], getComments });

    expect(decisions).toEqual([{ kind: 'comment', row, s, issue: 42 }]);
  });

  it('never re-files a service whose issue was closed wontfix', async () => {
    const closed = [{ number: 10, body: `<!-- latency-triage:fp=${id} -->`, labels: [{ name: 'wontfix' }], created_at: dayAgo(1) }];
    const getComments = vi.fn();

    const decisions = await decide(breaching, { open: [], closed, getComments });

    expect(decisions).toEqual([{ kind: 'skip', row, why: 'closed wontfix' }]);
    expect(getComments).not.toHaveBeenCalled();
  });

  it('files a new issue when no matching open or closed issue exists', async () => {
    const getComments = vi.fn();

    const decisions = await decide(breaching, { open: [], closed: [], getComments });

    expect(decisions).toEqual([{ kind: 'file', row, s }]);
    expect(getComments).not.toHaveBeenCalled();
  });

  it('a closed issue for a different service does not shadow this one', async () => {
    const closed = [{ number: 10, body: `<!-- latency-triage:fp=${fp('rabble-dev')} -->`, labels: [{ name: 'wontfix' }], created_at: dayAgo(1) }];
    const getComments = vi.fn();

    const decisions = await decide(breaching, { open: [], closed, getComments });

    expect(decisions).toEqual([{ kind: 'file', row, s }]);
  });
});

// A fix merged on main is not what production runs until a `v*` tag or a
// manual deploy-production.yml run, so a level closed by that merge looks new
// again to the open/closed dedupe while the scan still reads pre-fix
// invocations. Same rule scripts/log-triage.mjs applies (#230); here the
// stats row carries no event timestamp of its own, so `lastSlowAt` stands in
// for log-triage's `g.last`.
describe('decide() against the deployed build, not the merged one', () => {
  const id = fp('rabble-prod');
  const ago = (hours: number) => Date.now() - hours * 3600 * 1000;
  const s = { service: 'rabble-prod', env: 'prod', p95: 7000, p99: 9000, count: 900 };
  const row = { service: 'rabble-prod', env: 'prod', p95: 7000, p99: 9000, count: 900 };
  const breaching = [{ s, row }];
  const closedIssue = { number: 176, body: `<!-- latency-triage:fp=${id} -->`, labels: [{ name: 'latency' }, { name: 'bug' }], created_at: new Date(ago(6)).toISOString() };

  it('does not file a level whose closed issue was fixed before the last deploy', async () => {
    const getComments = vi.fn();
    const lastSlowAt = vi.fn().mockResolvedValue(ago(4));
    const deployedAt = vi.fn().mockResolvedValue(ago(3));

    const decisions = await decide(breaching, { open: [], closed: [closedIssue], getComments, lastSlowAt, deployedAt });

    expect(decisions).toEqual([{ kind: 'skip', row, why: expect.stringMatching(/deploy/i) }]);
    expect(getComments).not.toHaveBeenCalled();
    expect(lastSlowAt).toHaveBeenCalledWith('rabble-prod');
    expect(deployedAt).toHaveBeenCalledWith('prod');
  });

  it('files the same level when a slow invocation postdates the last deploy', async () => {
    const getComments = vi.fn();
    const lastSlowAt = vi.fn().mockResolvedValue(ago(1));
    const deployedAt = vi.fn().mockResolvedValue(ago(3));

    const decisions = await decide(breaching, { open: [], closed: [closedIssue], getComments, lastSlowAt, deployedAt });

    expect(decisions).toEqual([{ kind: 'file', row, s }]);
  });

  it('files when the deploy time cannot be resolved, failing open', async () => {
    const getComments = vi.fn();
    const lastSlowAt = vi.fn().mockResolvedValue(ago(4));
    const deployedAt = vi.fn().mockResolvedValue(null);

    const decisions = await decide(breaching, { open: [], closed: [closedIssue], getComments, lastSlowAt, deployedAt });

    expect(decisions).toEqual([{ kind: 'file', row, s }]);
  });

  it('never calls lastSlowAt or deployedAt when there is no closed issue to check against', async () => {
    const getComments = vi.fn();
    const lastSlowAt = vi.fn();
    const deployedAt = vi.fn();

    const decisions = await decide(breaching, { open: [], closed: [], getComments, lastSlowAt, deployedAt });

    expect(decisions).toEqual([{ kind: 'file', row, s }]);
    expect(lastSlowAt).not.toHaveBeenCalled();
    expect(deployedAt).not.toHaveBeenCalled();
  });
});

describe('lastSlowAt()', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('resolves to null instead of throwing when the telemetry query fails (fail open)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });

    await expect(lastSlowAt('rabble-prod', Date.now() - 3600_000, Date.now())).resolves.toBeNull();
  });

  it('takes the newest timestamp of the matching invocations', async () => {
    const events = [{ timestamp: 1000 }, { timestamp: 3000 }, { timestamp: 2000 }];
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ result: { events: { events } } }) });

    await expect(lastSlowAt('rabble-prod', 0, 4000)).resolves.toBe(3000);
  });
});

describe('fpOf()', () => {
  it('extracts the fingerprint marker from an issue body', () => {
    const id = fp('rabble-prod');
    expect(fpOf({ body: `<!-- latency-triage:fp=${id} -->\nmore text` })).toBe(id);
  });

  it('returns null for a body with no marker', () => {
    expect(fpOf({ body: 'no marker here' })).toBeNull();
    expect(fpOf({})).toBeNull();
  });
});
