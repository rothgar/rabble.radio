#!/usr/bin/env node
// scripts/log-triage.mjs — turn the Workers' error logs into GitHub issues.
//
//   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… GH_TOKEN=… \
//   node scripts/log-triage.mjs [--services=rabble-prod] [--hours=6]
//                               [--repo=rothgar/rabble.radio] [--dry-run] [--json]
//                               [--input=events.json] [--dump=events.json]
//
// Queries Workers Logs (the Workers Observability query API) for every
// error-level event and uncaught exception of each Worker in the last
// --hours, groups them by what the app logged (the logger's `event` name, or
// the exception's message with ids and numbers stripped), and files one
// issue per new group labelled `logs`, written as Today / Wanted / Done when
// so the factory's triage can take it from there. A group that already has
// an open `logs` issue gets a comment with the new count, at most once a day.
// A group whose issue was closed `wontfix` is ignored for good, and
// IGNORED_MESSAGES below lists runtime noise that is never filed.
//
// --dry-run prints the groups and files nothing (--bodies adds the issue
// bodies it would file). --input reads events from a file (the API's
// result.events.events array) instead of querying, for tests; --dump writes
// what the API returned to a file (local use only: log lines hold user data).
// The token needs the account permission "Workers Observability" (the API
// names it Workers Observability Write). Run by .github/workflows/log-triage.yml.
//
// A group whose newest event predates the environment's last successful
// deploy, and whose fingerprint already carries a closed (non-wontfix)
// issue, is treated as already fixed and awaiting deployment: it is
// reported in `skipped`, not filed again. The deploy time comes from the
// last successful run of deploy-production.yml (prod) or deploy.yml (dev);
// --deployed-at=<iso> overrides it, for tests and local runs. A group with
// no closed issue, or whose newest event postdates the deploy, files as
// before — including when the deploy time can't be resolved at all.
//
// Each issue (and each "still happening" comment) carries the timeline of up
// to MAX_TIMELINES of the failing requests: every log line of that request
// in order, with any D1 query that started and never finished flagged
// (scripts/lib/workers-logs.mjs). That is the evidence a hung-request issue
// needs, so the triage worker does not have to ask the owner for dashboard
// access. With --input the timelines come from the same file.

import { formatTimeline, requestEvents, requestIdOf, requestTimeline } from './lib/workers-logs.mjs';

const arg = (name, dflt) =>
  (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${dflt}`).split('=').slice(1).join('=');
const has = (flag) => process.argv.includes(`--${flag}`);

const services = arg('services', 'rabble-prod').split(',').map((s) => s.trim()).filter(Boolean);
const hours = Number(arg('hours', '6'));
const repo = arg('repo', 'rothgar/rabble.radio');
const input = arg('input', '');
const dump = arg('dump', '');
const deployedAtArg = arg('deployed-at', '');
const dryRun = has('dry-run');
const asJson = has('json');
const LABEL = 'logs';
const MARK = '<!-- log-triage -->';
const COMMENT_EVERY_MS = 24 * 3600 * 1000;
const MAX_NEW_ISSUES = 10;
const MAX_TIMELINES = 3;
const TIMELINE_MARGIN_MS = 5 * 60 * 1000;

const envOf = (service) => (service.endsWith('-prod') ? 'prod' : service.endsWith('-dev') ? 'dev' : service);
const dashboard = (service) =>
  `https://dash.cloudflare.com/?to=/:account/workers/services/view/${service}/production/observability/logs`;

// ---------------------------------------------------------------- fetch events
async function cfQuery(service, from, to) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required (or --input)');
  const leaf = (key, operation, value, type = 'string') => ({ kind: 'filter', key, operation, type, value });
  const body = {
    queryId: `log-triage-${service}`,
    timeframe: { from, to },
    view: 'events',
    limit: 2000,
    parameters: {
      datasets: ['cloudflare-workers'],
      filterCombination: 'and',
      filters: [
        leaf('$metadata.service', 'eq', service),
        {
          kind: 'group',
          filterCombination: 'or',
          filters: [leaf('$metadata.level', 'eq', 'error'), leaf('$metadata.error', 'exists', undefined)],
        },
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
  const events = json.result?.events?.events ?? [];
  return events.map((e) => ({ ...e, _service: service }));
}

async function loadEvents(from, to) {
  if (input) {
    const { readFile } = await import('node:fs/promises');
    const raw = JSON.parse(await readFile(input, 'utf8'));
    const list = Array.isArray(raw) ? raw : raw.result?.events?.events ?? raw.events ?? [];
    return list.map((e) => ({ ...e, _service: e._service ?? e.$metadata?.service ?? e.$workers?.scriptName ?? services[0] }));
  }
  const all = [];
  for (const s of services) all.push(...(await cfQuery(s, from, to)));
  if (dump) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(dump, JSON.stringify(all, null, 1));
  }
  return all;
}

// ------------------------------------------------------------------ grouping
// Workers Logs holds two kinds of event. A log event ($metadata.type
// "cf-worker") is one console line or one uncaught exception: our logger's
// JSON line parsed into `source` (src/lib/logger.ts), or the runtime's
// `{message, exception: {name}}` with the text also in $metadata.error. An
// invocation event ("cf-worker-event") is the request itself, one per
// request, whose message is only the request line and whose $workers.event
// holds the request (headers included: never post it). A failed request
// usually has both, so invocation events count only when no log event of
// the same request explains the failure.
const IGNORED_MESSAGES = [
  /^Network connection lost\.?$/, // the client went away mid-response; nothing the Worker did
];
const isInvocation = (e) => e.$metadata?.type === 'cf-worker-event';
const requestPath = (e) => {
  const p = e.$workers?.event?.request?.path ?? (() => { try { return new URL(e.$workers?.event?.request?.url ?? e.$metadata?.url ?? '').pathname; } catch { return ''; } })();
  return p ? p.replace(/[a-z0-9]{16,}|\d+/gi, ':id') : '';
};
const normalize = (s) =>
  String(s)
    .replace(/req_[0-9a-f]{8,}/gi, 'req_*')
    .replace(/did:[a-z]+:[A-Za-z0-9._:%-]+/g, 'did:*')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/https?:\/\/[^\s"']+/g, '<url>')
    .replace(/\b\d{2,}\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim();

const redact = (s) =>
  String(s)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/(cookie|authorization|token|secret|password)(["']?\s*[:=]\s*["']?)[^\s"',;}]+/gi, '$1$2[redacted]')
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[redacted]');

const stripRefer = (m) => String(m).replace(/\s*Refer to:\s*<?https?:\/\/\S+>?\s*$/i, '').trim();

function describe(e) {
  const src = e.source && typeof e.source === 'object' ? e.source : null;
  const meta = e.$metadata ?? {};
  const level = String(src?.level ?? meta.level ?? 'error').toLowerCase();
  if (isInvocation(e)) {
    // Only reached for an invocation with no log event of its own (see group()).
    const outcome = e.$workers?.outcome && e.$workers.outcome !== 'ok' ? e.$workers.outcome : null;
    const status = e.$workers?.event?.response?.status;
    const what = `${outcome ? `request ${outcome}` : status ? `HTTP ${status}` : 'request error'} with no error logged`;
    return { level, kind: 'outcome', what, errMsg: null, key: `${envOf(e._service)}:outcome:${outcome ?? status ?? 'error'}:${requestPath(e)}` };
  }
  const event = typeof src?.event === 'string' ? src.event : null;
  const errMsg = src?.err && typeof src.err === 'object' ? src.err.message : typeof src?.err === 'string' ? src.err : null;
  const exception = src?.exception || meta.error ? stripRefer(src?.message || meta.errorTemplate || meta.error) : null;
  const message = stripRefer(meta.messageTemplate || meta.message || (typeof e.source === 'string' ? e.source : src?.message) || '');
  const kind = event ? 'event' : exception ? 'exception' : 'log';
  const what = event ?? exception ?? message ?? '(no message)';
  const key = `${envOf(e._service)}:${kind}:${normalize(what).slice(0, 160)}${event && errMsg ? ':' + normalize(errMsg).slice(0, 80) : ''}`;
  return { level, kind, what: String(what), errMsg, key };
}

function group(events) {
  const groups = new Map();
  const explained = new Set(events.filter((e) => !isInvocation(e) && e.$metadata?.requestId).map((e) => e.$metadata.requestId));
  for (const e of events) {
    if (isInvocation(e) && explained.has(e.$metadata?.requestId)) continue; // its log event carries the error
    const d = describe(e);
    if (d.level !== 'error') continue; // warn lines reach Workers Logs through console.error; keep only errors
    if (d.kind !== 'event' && IGNORED_MESSAGES.some((re) => re.test(d.what))) continue;
    const meta = e.$metadata ?? {};
    const g = groups.get(d.key) ?? {
      key: d.key,
      service: e._service,
      env: envOf(e._service),
      kind: d.kind,
      what: d.what,
      errMsg: d.errMsg,
      count: 0,
      requests: new Set(),
      urls: new Map(),
      first: Infinity,
      last: 0,
      sample: null,
      requestIds: [],
    };
    g.count++;
    const rid = meta.requestId ?? e.$workers?.requestId;
    if (rid) g.requests.add(rid);
    const path = requestPath(e);
    if (path) g.urls.set(path, (g.urls.get(path) ?? 0) + 1);
    const ts = Number(e.timestamp ?? meta.startTime ?? 0);
    if (ts) { g.first = Math.min(g.first, ts); g.last = Math.max(g.last, ts); }
    if (!g.sample) {
      const src = e.source && typeof e.source === 'object' ? e.source : null;
      g.sample = src && !isInvocation(e) ? JSON.stringify({ ...src, stack: undefined, err: src.err && typeof src.err === 'object' ? { ...src.err, stack: undefined } : src.err }) : (meta.error ?? meta.message ?? '');
      g.stack = src?.err?.stack ?? meta.stackId ?? null;
    }
    const cid = e.source?.correlationId ?? rid;
    if (cid && g.requestIds.length < 3 && !g.requestIds.includes(cid)) g.requestIds.push(cid);
    groups.set(d.key, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

const fp = (key) => {
  // FNV-1a, enough to find our own marker again
  let h = 0x811c9dc5;
  for (const c of key) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
};

// --------------------------------------------------------------------- GitHub
const GH = 'https://api.github.com';
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

// The deploy that last changed env's running build, or null when it can't be
// resolved (no such workflow, no successful run, or the API call failed) —
// callers then fail open and file as if no deploy time were known at all.
const DEPLOY_WORKFLOW = { prod: 'deploy-production.yml', dev: 'deploy.yml' };
const deployTimeCache = new Map();
async function deployedAt(env) {
  if (deployedAtArg) return Date.parse(deployedAtArg);
  if (deployTimeCache.has(env)) return deployTimeCache.get(env);
  const promise = (async () => {
    const workflow = DEPLOY_WORKFLOW[env];
    if (!workflow) return null;
    try {
      const runs = await gh(`/repos/${repo}/actions/workflows/${workflow}/runs?status=success&per_page=1`);
      const run = runs.workflow_runs?.[0];
      return run ? Date.parse(run.updated_at) : null;
    } catch (err) {
      console.error(`deploy time for ${env} unavailable: ${err.message}`);
      return null;
    }
  })();
  deployTimeCache.set(env, promise);
  return promise;
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

const fpOf = (issue) => issue.body?.match(/<!-- log-triage:fp=([0-9a-f]{8}) -->/)?.[1] ?? null;
const fmt = (ms) => (Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z') : 'unknown');

const SHORT_TITLES = [
  [/canceled this request because it detected that your Worker's code had hung/i, 'Worker hung, runtime canceled the request'],
  [/exceeded the CPU time limit/i, 'Worker exceeded the CPU time limit'],
  [/exceeded the memory limit/i, 'Worker exceeded the memory limit'],
  [/Too many subrequests/i, 'Too many subrequests'],
];
function title(g) {
  // Titles are public and unredacted elsewhere: scrub them like the body.
  let what = redact(g.kind === 'event' || g.kind === 'outcome' ? g.what : normalize(g.what.split('\n')[0]));
  for (const [re, short] of SHORT_TITLES) if (re.test(what)) { what = short; break; }
  if (what.length > 80) what = what.slice(0, 80).replace(/\s+\S*$/, '') + '…';
  if (g.kind === 'outcome') what += ` on ${[...g.urls.keys()][0] ?? 'a request'}`;
  return `Logs (${g.env}): ${what}`;
}

// ------------------------------------------------------------- timelines
async function timelinesFor(g, events) {
  const out = [];
  for (const id of [...g.requests].slice(0, MAX_TIMELINES)) {
    try {
      const own = input
        ? events.filter((e) => requestIdOf(e) === id)
        : await requestEvents({
            account: process.env.CLOUDFLARE_ACCOUNT_ID,
            token: process.env.CLOUDFLARE_API_TOKEN,
            service: g.service,
            requestId: id,
            timeframe: { from: new Date(g.first - TIMELINE_MARGIN_MS).toISOString(), to: new Date(g.last + TIMELINE_MARGIN_MS).toISOString() },
          });
      if (own.length === 0) continue;
      out.push({ id, timeline: requestTimeline(own) });
    } catch (err) {
      console.error(`timeline for ${id} skipped: ${err.message}`);
    }
  }
  return out;
}

function timelineSection(timelines) {
  if (!timelines?.length) return '';
  const hung = timelines.filter((t) => t.timeline.neverFinished.length > 0);
  const summary = hung.length
    ? `Request timelines: ${hung.length} of ${timelines.length} left a D1 query unfinished (${[...new Set(hung.flatMap((t) => t.timeline.neverFinished.map((q) => q.query)))].join(', ')})`
    : `Request timelines (${timelines.length}; every D1 query finished)`;
  const text = timelines.map((t) => redact(formatTimeline(t.id, t.timeline))).join('\n\n');
  return `<details><summary>${summary}</summary>\n\n\`\`\`\n${text.slice(0, 6000)}\n\`\`\`\n</details>`;
}

function body(g, from, to, timelines = []) {
  const urls = [...g.urls.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([p, n]) => `\`${p}\` (${n})`).join(', ');
  const lines = [
    `<!-- log-triage:fp=${fp(g.key)} -->`,
    '## Today',
    '',
    `The \`${g.service}\` Worker logged **${g.count}** ${g.kind === 'exception' ? 'uncaught exception' : 'error'}${g.count === 1 ? '' : 's'} of this kind across ${g.requests.size} request${g.requests.size === 1 ? '' : 's'} between ${fmt(g.first)} and ${fmt(g.last)} (scan window ${fmt(from)} to ${fmt(to)}).`,
    '',
    g.kind === 'event' ? `Event: \`${g.what}\`${g.errMsg ? `\nError: \`${redact(g.errMsg).slice(0, 300)}\`` : ''}` : `Message: \`${redact(g.what.split('\n')[0]).slice(0, 300)}\``,
    urls ? `Routes: ${urls}` : '',
    g.requestIds.length ? `Request ids: ${g.requestIds.map((r) => `\`${r}\``).join(', ')} (search them in the dashboard logs: ${dashboard(g.service)})` : `Dashboard: ${dashboard(g.service)}`,
    '',
    g.sample ? `<details><summary>Sample log line (ids and secrets redacted)</summary>\n\n\`\`\`json\n${redact(g.sample).slice(0, 1500)}\n\`\`\`\n</details>` : '',
    g.stack && typeof g.stack === 'string' && g.stack.includes('\n') ? `<details><summary>Stack</summary>\n\n\`\`\`\n${redact(g.stack).slice(0, 1500)}\n\`\`\`\n</details>` : '',
    timelineSection(timelines),
    '',
    '## Wanted',
    '',
    g.kind === 'exception'
      ? 'The request that threw either succeeds or answers with a handled error and one `log.error` naming what went wrong; nothing reaches the Worker as an uncaught exception.'
      : 'The condition this event reports is handled or prevented, so the error stops appearing for ordinary use; if it reports a client mistake, it is logged at `warn` with the reason instead.',
    '',
    '## Done when',
    '',
    `- The cause is found in the code the routes above run (start from where \`${g.kind === 'event' ? g.what : 'the thrown error'}\` is produced) and fixed with a test that reproduces it.`,
    `- After the fix deploys, the next log-triage scans show no new \`${g.kind === 'event' ? g.what : 'exception of this kind'}\` events for ${g.env}.`,
    '- If this error is expected and not worth fixing, close this issue as `wontfix`: the scan then stops reporting it.',
    '',
    `Filed by \`scripts/log-triage.mjs\`${process.env.GITHUB_RUN_ID ? ` ([run](${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}))` : ''}.`,
  ];
  return lines.filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n');
}

// ----------------------------------------------------------------------- main
const to = Date.now();
const from = to - hours * 3600 * 1000;
const events = await loadEvents(from, to);
const groups = group(events);

const report = { window: { from: fmt(from), to: fmt(to) }, services, events: events.length, groups: [], filed: [], commented: [], skipped: [] };

if (dryRun || groups.length === 0) {
  for (const g of groups) {
    const timelines = has('bodies') ? await timelinesFor(g, events) : [];
    report.groups.push({ key: g.key, count: g.count, requests: g.requests.size, title: title(g), ...(has('bodies') ? { body: body(g, from, to, timelines) } : {}) });
  }
} else {
  const open = await listLabelled('open');
  const closed = await listLabelled('closed');
  const openBy = new Map(open.map((i) => [fpOf(i), i]).filter(([k]) => k));
  const ignore = new Set(closed.filter((i) => i.labels.some((l) => l.name === 'wontfix')).map(fpOf).filter(Boolean));
  const fixedBy = new Map(closed.filter((i) => !i.labels.some((l) => l.name === 'wontfix')).map((i) => [fpOf(i), i]).filter(([k]) => k));
  let filed = 0;
  for (const g of groups) {
    const id = fp(g.key);
    const row = { key: g.key, count: g.count, requests: g.requests.size, title: title(g) };
    report.groups.push(row);
    if (ignore.has(id)) { report.skipped.push({ ...row, why: 'closed wontfix' }); continue; }
    const existing = openBy.get(id);
    if (existing) {
      const comments = await gh(`/repos/${repo}/issues/${existing.number}/comments?per_page=100`);
      const last = comments.filter((c) => c.body?.includes(MARK)).map((c) => Date.parse(c.created_at)).sort((a, b) => b - a)[0] ?? Date.parse(existing.created_at);
      if (Date.now() - last < COMMENT_EVERY_MS) { report.skipped.push({ ...row, why: `#${existing.number} updated in the last 24h` }); continue; }
      const section = timelineSection(await timelinesFor(g, events));
      await gh(`/repos/${repo}/issues/${existing.number}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: `${MARK}\nStill happening: **${g.count}** more between ${fmt(g.first)} and ${fmt(g.last)} across ${g.requests.size} request${g.requests.size === 1 ? '' : 's'}.${section ? `\n\n${section}` : ''}` }),
      });
      report.commented.push({ ...row, issue: existing.number });
      continue;
    }
    const fixed = fixedBy.get(id);
    if (fixed) {
      const deployTime = await deployedAt(g.env);
      if (deployTime && g.last < deployTime) {
        report.skipped.push({ ...row, why: `fixed by #${fixed.number}, which closed before the ${fmt(deployTime)} deploy` });
        continue;
      }
    }
    if (filed >= MAX_NEW_ISSUES) { report.skipped.push({ ...row, why: `more than ${MAX_NEW_ISSUES} new groups in one run` }); continue; }
    const timelines = await timelinesFor(g, events);
    const issue = await gh(`/repos/${repo}/issues`, { method: 'POST', body: JSON.stringify({ title: title(g), body: body(g, from, to, timelines), labels: [LABEL, 'bug'] }) });
    filed++;
    report.filed.push({ ...row, issue: issue.number, url: issue.html_url });
  }
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`log-triage: ${events.length} error events in ${services.join(', ')} between ${report.window.from} and ${report.window.to}; ${groups.length} group${groups.length === 1 ? '' : 's'}${dryRun ? ' (dry run)' : ''}`);
  for (const g of report.groups) {
    console.log(`  ${String(g.count).padStart(5)} × ${g.title}  [${g.requests} req]`);
    if (g.body) console.log(g.body.replace(/^/gm, '      ') + '\n');
  }
  for (const f of report.filed) console.log(`  filed #${f.issue}: ${f.url}`);
  for (const c of report.commented) console.log(`  commented on #${c.issue}: ${c.title}`);
  for (const s of report.skipped) console.log(`  skipped (${s.why}): ${s.title}`);
}
