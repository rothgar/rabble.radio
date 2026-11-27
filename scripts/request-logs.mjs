#!/usr/bin/env node
// scripts/request-logs.mjs
//
// Print the per-request log timeline of a Worker from Workers Logs
// (Cloudflare observability), and flag D1 queries that started and never
// finished. This is the evidence a "Worker hung, runtime canceled the
// request" issue asks for (`db.query.start` with no matching `db.query.done`
// or `db.query.failed`, src/lib/db.ts).
//
//   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
//   node scripts/request-logs.mjs --service rabble-dev --request <id> [--request <id>]
//
//   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
//   node scripts/request-logs.mjs --service rabble-dev --route /api/me/shows \
//     --from 2026-11-27T05:00:00Z --to 2026-11-27T07:30:00Z
//
// --route finds every request on that path in the window that the runtime
// reported an error for (hung, exception, cancelled) and prints each one's
// timeline. The token needs Account, Workers Observability, Read (the CI
// token in docs/DEPLOY.md has it). Workers Logs keeps a few days only.
//
// Output is safe to paste on a public issue: request headers are never read,
// DIDs and e-mail addresses are redacted. Nothing is written anywhere.

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : def;
};
const all = (name) => args.flatMap((a, i) => (a === `--${name}` && i + 1 < args.length ? [args[i + 1]] : []));

const service = opt('service', 'rabble-dev');
const requestIds = all('request');
const route = opt('route');
const from = opt('from');
const to = opt('to', new Date().toISOString());
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;

if (!token || !account) {
  console.error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required');
  process.exit(2);
}
if (requestIds.length === 0 && !(route && from)) {
  console.error('give --request <id> (repeatable) or --route <path> --from <iso> [--to <iso>]');
  process.exit(2);
}

const leaf = (key, operation, value, type = 'string') => ({ kind: 'filter', key, operation, type, value });

async function query(filters, timeframe) {
  const body = {
    queryId: `request-logs-${service}`,
    timeframe,
    view: 'events',
    limit: 2000,
    parameters: {
      datasets: ['cloudflare-workers'],
      filterCombination: 'and',
      filters: [leaf('$metadata.service', 'eq', service), ...filters],
    },
  };
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/workers/observability/telemetry/query`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    }
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const msg = (json.errors ?? []).map((e) => `${e.code}: ${e.message}`).join('; ') || `HTTP ${res.status}`;
    throw new Error(`observability query failed: ${msg}`);
  }
  return json.result?.events?.events ?? json.result?.events ?? [];
}

const redact = (s) =>
  String(s)
    .replace(/did:[a-z]+:[A-Za-z0-9._:%-]+/g, 'did:*')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[redacted]');

const isInvocation = (e) => e.$metadata?.type === 'cf-worker-event';
const requestPath = (e) => {
  try {
    return e.$workers?.event?.request?.path ?? new URL(e.$workers?.event?.request?.url ?? e.$metadata?.url ?? '').pathname;
  } catch {
    return '';
  }
};
const rid = (e) => e.$metadata?.requestId ?? e.$workers?.requestId;

function printTimeline(id, events) {
  const sorted = [...events].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  const inv = sorted.find(isInvocation);
  const path = inv ? requestPath(inv) : '';
  const outcome = inv?.$workers?.outcome ?? inv?.$metadata?.outcome ?? '';
  const wall = inv?.$workers?.wallTimeMs ?? inv?.$workers?.wallTime ?? '';
  console.log(`\n=== request ${id} ${path} outcome=${outcome || '?'} wall=${wall || '?'}ms  (${sorted.length} events)`);

  const open = new Map(); // queryId -> start line
  const t0 = sorted[0]?.timestamp ?? 0;
  for (const e of sorted) {
    const src = e.source && typeof e.source === 'object' ? e.source : null;
    const ts = `+${String((e.timestamp ?? t0) - t0).padStart(6)}ms`;
    const level = e.$metadata?.level ?? '';
    if (isInvocation(e)) {
      console.log(`${ts} [request] ${path}`);
      continue;
    }
    if (src?.event?.startsWith('db.query.')) {
      const q = `${src.model ?? '?'}.${src.operation ?? '?'}`;
      if (src.event === 'db.query.start') open.set(src.queryId, `${q}`);
      else open.delete(src.queryId);
      const dur = src.durationMs !== undefined ? ` ${src.durationMs}ms` : '';
      console.log(`${ts} [${level}] ${src.event} ${src.queryId ?? ''} ${q}${dur}`);
      continue;
    }
    const msg = src?.event ?? src?.message ?? e.$metadata?.message ?? e.$metadata?.error ?? '';
    console.log(`${ts} [${level}] ${redact(msg).slice(0, 200)}`);
  }
  if (open.size > 0) {
    console.log(`--- never finished: ${[...open].map(([id, q]) => `${id} ${q}`).join(', ')}`);
  } else {
    console.log('--- every D1 query that started also finished');
  }
}

async function main() {
  let ids = requestIds;
  const timeframe = from ? { from, to } : { from: new Date(Date.now() - 7 * 86400e3).toISOString(), to };
  if (ids.length === 0) {
    const found = await query([leaf('$metadata.error', 'exists', undefined)], timeframe);
    ids = [...new Set(found.filter((e) => requestPath(e) === route && rid(e)).map(rid))];
    if (ids.length === 0) {
      console.log(`no failed requests on ${route} for ${service} between ${timeframe.from} and ${timeframe.to}`);
      return;
    }
    console.log(`${ids.length} failed request(s) on ${route}: ${ids.join(' ')}`);
  }
  for (const id of ids) {
    const events = await query([leaf('$metadata.requestId', 'eq', id)], timeframe);
    if (events.length === 0) {
      console.log(`\n=== request ${id}: no events (outside the window, or past Workers Logs retention)`);
      continue;
    }
    printTimeline(id, events);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
