#!/usr/bin/env node
// scripts/latency-triage.mjs — alert on elevated Worker wall-time, the way
// scripts/log-triage.mjs alerts on errors.
//
//   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… GH_TOKEN=… \
//   node scripts/latency-triage.mjs [--services=rabble-prod] [--hours=6]
//                                   [--repo=rothgar/rabble.radio] [--threshold-ms=5000]
//                                   [--dry-run] [--json] [--input=stats.json] [--dump=stats.json]
//
// Queries the same Workers Observability telemetry API as log-triage.mjs,
// but its "calculations" view instead of "events": the P95, P99 and count of
// `$workers.wallTimeMs` (request wall time) for each service's invocations
// ($metadata.type "cf-worker-event") over the last --hours. A service whose
// P95 crosses --threshold-ms gets one issue labelled `latency`, written as
// Today / Wanted / Done when; a service already over threshold with an open
// `latency` issue gets a "still happening" comment at most once a day,
// exactly as log-triage.mjs's error groups do. A service back under
// threshold, or with too few invocations in the window to trust a
// percentile, is left alone: nothing is filed or closed automatically. An
// issue closed `wontfix` is never re-filed.
//
// --dry-run prints the per-service stats and files nothing (--bodies adds
// the issue bodies it would file). --input reads one file mapping each
// service name to the telemetry API's calculations-view result object
// (for tests), instead of querying; --dump writes what the API returned,
// keyed by service, to a file (local use only).
// The token needs the account permission "Workers Observability", already
// granted for log-triage.yml, which runs this script too — no new secret.

const arg = (name, dflt) =>
  (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${dflt}`).split('=').slice(1).join('=');
const has = (flag) => process.argv.includes(`--${flag}`);

const services = arg('services', 'rabble-prod').split(',').map((s) => s.trim()).filter(Boolean);
const hours = Number(arg('hours', '6'));
const repo = arg('repo', 'rothgar/rabble.radio');
const thresholdMs = Number(arg('threshold-ms', '5000'));
const input = arg('input', '');
const dump = arg('dump', '');
const dryRun = has('dry-run');
const asJson = has('json');
const LABEL = 'latency';
const MARK = '<!-- latency-triage -->';
const COMMENT_EVERY_MS = 24 * 3600 * 1000;

const envOf = (service) => (service.endsWith('-prod') ? 'prod' : service.endsWith('-dev') ? 'dev' : service);
const dashboard = (service) =>
  `https://dash.cloudflare.com/?to=/:account/workers/services/view/${service}/production/observability/metrics`;
const fmt = (ms) => (Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z') : 'unknown');

// ---------------------------------------------------------------- fetch stats
async function cfQuery(service, from, to) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required (or --input)');
  const leaf = (key, operation, value, type = 'string') => ({ kind: 'filter', key, operation, type, value });
  const body = {
    queryId: `latency-triage-${service}`,
    timeframe: { from, to },
    view: 'calculations',
    parameters: {
      datasets: ['cloudflare-workers'],
      filterCombination: 'and',
      filters: [leaf('$metadata.service', 'eq', service), leaf('$metadata.type', 'eq', 'cf-worker-event')],
      calculations: [
        { operator: 'P95', key: '$workers.wallTimeMs', keyType: 'number', alias: 'p95' },
        { operator: 'P99', key: '$workers.wallTimeMs', keyType: 'number', alias: 'p99' },
        { operator: 'COUNT', key: '$workers.wallTimeMs', keyType: 'number', alias: 'count' },
      ],
    },
  };
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/observability/telemetry/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const msg = (json.errors ?? []).map((e) => `${e.code}: ${e.message}`).join('; ') || `HTTP ${res.status}`;
    throw new Error(`observability query for ${service} failed: ${msg}`);
  }
  return json.result ?? {};
}

// A calculations-view result carries one entry per requested calculation,
// each with its aggregate value(s); matched by the alias we asked for.
function valueOf(result, alias) {
  const calc = (result.calculations ?? []).find((c) => (c.alias ?? c.calculation ?? '').toLowerCase() === alias);
  const v = calc?.aggregates?.[0]?.value;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function statsOf(service, result) {
  const hasData = Array.isArray(result?.calculations) && result.calculations.length > 0;
  return {
    service,
    env: envOf(service),
    p95: valueOf(result, 'p95'),
    p99: valueOf(result, 'p99'),
    count: valueOf(result, 'count') ?? 0,
    hasData,
  };
}

async function loadStats(from, to) {
  if (input) {
    const { readFile } = await import('node:fs/promises');
    const raw = JSON.parse(await readFile(input, 'utf8'));
    return services.map((s) => statsOf(s, raw[s] ?? {}));
  }
  const out = [];
  const dumped = {};
  for (const s of services) {
    const result = await cfQuery(s, from, to);
    dumped[s] = result;
    out.push(statsOf(s, result));
  }
  if (dump) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(dump, JSON.stringify(dumped, null, 1));
  }
  return out;
}

const fp = (key) => {
  // FNV-1a, enough to find our own marker again
  let h = 0x811c9dc5;
  for (const c of key) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
};

// --------------------------------------------------------------------- GitHub
// Overridable so tests can point it at a local stub instead of the real API.
const GH = process.env.GH_API_BASE_URL ?? 'https://api.github.com';
async function gh(path, init = {}) {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GH_TOKEN is required to file issues (use --dry-run to only report)');
  const res = await fetch(GH + path, {
    ...init,
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`GitHub ${init.method ?? 'GET'} ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

async function listLabelled(state) {
  const out = [];
  for (let page = 1; page <= 5; page++) {
    const list = await gh(`/repos/${repo}/issues?state=${state}&labels=${LABEL}&per_page=100&page=${page}`);
    out.push(...list.filter((i) => !i.pull_request));
    if (list.length < 100) break;
  }
  return out;
}

const fpOf = (issue) => issue.body?.match(/<!-- latency-triage:fp=([0-9a-f]{8}) -->/)?.[1] ?? null;

function title(s) {
  return `Latency (${s.env}): P95 wall time ${Math.round(s.p95)}ms (> ${thresholdMs}ms)`;
}

function body(s, from, to) {
  const lines = [
    `<!-- latency-triage:fp=${fp(s.service)} -->`,
    '## Today',
    '',
    `The \`${s.service}\` Worker's P95 wall time was **${Math.round(s.p95)}ms** (P99 **${Math.round(s.p99 ?? s.p95)}ms**) across ${s.count} invocation${s.count === 1 ? '' : 's'} between ${fmt(from)} and ${fmt(to)}, above the ${thresholdMs}ms threshold.`,
    '',
    `Dashboard: ${dashboard(s.service)}`,
    '',
    '## Wanted',
    '',
    `Requests to \`${s.service}\` finish inside normal bounds; a sustained P95 above ${thresholdMs}ms gets investigated and fixed (a slow upstream call, a missing index, a regression) rather than left to alert indefinitely.`,
    '',
    '## Done when',
    '',
    '- The slow path is found (start from the dashboard\'s per-route breakdown for the window above) and fixed with a test that reproduces it.',
    `- After the fix deploys, the next latency-triage scans show ${s.env} back under ${thresholdMs}ms P95.`,
    '- If this level is expected and not worth fixing, close this issue as `wontfix`: the scan then stops reporting it.',
    '',
    `Filed by \`scripts/latency-triage.mjs\`${process.env.GITHUB_RUN_ID ? ` ([run](${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}))` : ''}.`,
  ];
  return lines.filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n');
}

// ------------------------------------------------------------------- decide
// What to do about each service already known to be over threshold: skip
// (ignored for good, or commented on too recently), comment on the existing
// issue, or file a new one. Pure given its inputs (no fetching of its own),
// so it's the part of the triage worth testing directly — `getComments` is
// the one piece that needs the network, injected so tests can fake it.
async function decide(breaching, { open, closed, getComments, now = Date.now() }) {
  const openByFp = new Map(open.map((i) => [fpOf(i), i]).filter(([k]) => k));
  const ignore = new Set(closed.filter((i) => i.labels.some((l) => l.name === 'wontfix')).map(fpOf).filter(Boolean));
  const decisions = [];
  for (const { s, row } of breaching) {
    const id = fp(s.service);
    if (ignore.has(id)) { decisions.push({ kind: 'skip', row, why: 'closed wontfix' }); continue; }
    const existing = openByFp.get(id);
    if (!existing) { decisions.push({ kind: 'file', row, s }); continue; }
    const comments = await getComments(existing.number);
    const last = comments.filter((c) => c.body?.includes(MARK)).map((c) => Date.parse(c.created_at)).sort((a, b) => b - a)[0] ?? Date.parse(existing.created_at);
    if (now - last < COMMENT_EVERY_MS) { decisions.push({ kind: 'skip', row, why: `#${existing.number} updated in the last 24h` }); continue; }
    decisions.push({ kind: 'comment', row, s, issue: existing.number });
  }
  return decisions;
}

// ----------------------------------------------------------------------- main
async function main() {
  const to = Date.now();
  const from = to - hours * 3600 * 1000;
  const stats = await loadStats(from, to);

  const report = { window: { from: fmt(from), to: fmt(to) }, services, thresholdMs, stats: [], filed: [], commented: [], skipped: [] };
  const breaching = [];

  for (const s of stats) {
    const row = { service: s.service, env: s.env, p95: s.p95, p99: s.p99, count: s.count };
    report.stats.push(row);
    if (s.p95 === null) {
      const why = s.hasData
        ? 'telemetry response had data but no parseable P95/P99/count (check the alias/field names against --dump)'
        : 'no invocations in window';
      report.skipped.push({ ...row, why });
      continue;
    }
    if (s.count === 0) { report.skipped.push({ ...row, why: 'no invocations in window' }); continue; }
    if (s.p95 <= thresholdMs) { report.skipped.push({ ...row, why: `P95 ${Math.round(s.p95)}ms under the ${thresholdMs}ms threshold` }); continue; }
    if (dryRun) { report.skipped.push({ ...row, why: 'dry run', title: title(s), ...(has('bodies') ? { body: body(s, from, to) } : {}) }); continue; }
    breaching.push({ s, row });
  }

  if (breaching.length > 0) {
    const open = await listLabelled('open');
    const closed = await listLabelled('closed');
    const getComments = (n) => gh(`/repos/${repo}/issues/${n}/comments?per_page=100`);
    const decisions = await decide(breaching, { open, closed, getComments });
    for (const d of decisions) {
      if (d.kind === 'skip') { report.skipped.push({ ...d.row, why: d.why }); continue; }
      if (d.kind === 'comment') {
        await gh(`/repos/${repo}/issues/${d.issue}/comments`, {
          method: 'POST',
          body: JSON.stringify({ body: `${MARK}\nStill above threshold: P95 **${Math.round(d.s.p95)}ms** (P99 **${Math.round(d.s.p99 ?? d.s.p95)}ms**) across ${d.s.count} invocation${d.s.count === 1 ? '' : 's'} between ${fmt(from)} and ${fmt(to)}.` }),
        });
        report.commented.push({ ...d.row, issue: d.issue });
        continue;
      }
      const issue = await gh(`/repos/${repo}/issues`, { method: 'POST', body: JSON.stringify({ title: title(d.s), body: body(d.s, from, to), labels: [LABEL, 'bug'] }) });
      report.filed.push({ ...d.row, issue: issue.number, url: issue.html_url });
    }
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`latency-triage: ${services.join(', ')} between ${report.window.from} and ${report.window.to}, threshold ${thresholdMs}ms P95${dryRun ? ' (dry run)' : ''}`);
    for (const s of report.stats) console.log(`  ${s.service}: P95 ${s.p95 ?? 'n/a'}ms, P99 ${s.p99 ?? 'n/a'}ms, ${s.count} invocations`);
    for (const f of report.filed) console.log(`  filed #${f.issue}: ${f.url}`);
    for (const c of report.commented) console.log(`  commented on #${c.issue}: ${title(c)}`);
    for (const s of report.skipped) console.log(`  skipped (${s.why}): ${s.service}${s.body ? '\n' + s.body.replace(/^/gm, '      ') + '\n' : ''}`);
  }
}

// Running as `node scripts/latency-triage.mjs`: do the real thing. Imported
// by a test instead: just expose decide()/fp()/fpOf() below, untouched.
const { fileURLToPath } = await import('node:url');
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

export { decide, fp, fpOf };
