// scripts/lib/workers-logs.mjs
//
// Shared by scripts/log-triage.mjs and scripts/request-logs.mjs: one query
// against the Workers Observability telemetry API, and the per-request
// timeline built from its events, which flags D1 queries that started and
// never finished (src/lib/db.ts logs db.query.start / done / failed with a
// queryId). That unfinished query is the evidence every "Worker hung,
// runtime canceled the request" issue asks for.

const TELEMETRY = (account) =>
  `https://api.cloudflare.com/client/v4/accounts/${account}/workers/observability/telemetry/query`;

export const filter = (key, operation, value, type = 'string') => ({ kind: 'filter', key, operation, type, value });

// The API wants the window as epoch milliseconds; callers may pass ISO strings.
const ms = (v) => (typeof v === 'number' ? v : Date.parse(v));

/** Run one events query. `filters` are and-ed after the service filter. */
export async function telemetryQuery({ account, token, service, filters, timeframe, limit = 2000, queryId }) {
  const body = {
    queryId: queryId ?? `workers-logs-${service}`,
    timeframe: { from: ms(timeframe.from), to: ms(timeframe.to) },
    view: 'events',
    limit,
    parameters: {
      datasets: ['cloudflare-workers'],
      filterCombination: 'and',
      filters: [filter('$metadata.service', 'eq', service), ...filters],
    },
  };
  const res = await fetch(TELEMETRY(account), {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON: the status and a snippet of the body are the message
  }
  if (!res.ok || json.success === false) {
    const msg =
      (json.errors ?? []).map((e) => `${e.code}: ${e.message}`).join('; ') ||
      `HTTP ${res.status} ${text.replace(/\s+/g, ' ').slice(0, 300)}`;
    throw new Error(`observability query for ${service} failed: ${msg}`);
  }
  return json.result?.events?.events ?? json.result?.events ?? [];
}

/** The filter log-triage uses: an error-level line or a runtime error. */
export const failedFilter = () => ({
  kind: 'group',
  filterCombination: 'or',
  filters: [filter('$metadata.level', 'eq', 'error'), filter('$metadata.error', 'exists', undefined)],
});

/** Every event of one request. */
export function requestEvents({ account, token, service, requestId, timeframe }) {
  return telemetryQuery({
    account,
    token,
    service,
    filters: [filter('$metadata.requestId', 'eq', requestId)],
    timeframe,
    queryId: `request-logs-${service}`,
  });
}

export const isInvocation = (e) => e.$metadata?.type === 'cf-worker-event';
export const requestIdOf = (e) => e.$metadata?.requestId ?? e.$workers?.requestId ?? null;
export const requestPath = (e) => {
  try {
    return e.$workers?.event?.request?.path ?? new URL(e.$workers?.event?.request?.url ?? e.$metadata?.url ?? '').pathname;
  } catch {
    return '';
  }
};

/** Scrub what may identify a person before anything is printed or posted. */
export const redactLine = (s) =>
  String(s)
    .replace(/did:[a-z]+:[A-Za-z0-9._:%-]+/g, 'did:*')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[redacted]');

/**
 * Build the timeline of one request from its events (any order). Lines are
 * relative to the first event; D1 queries are matched start-to-done by
 * queryId and the ones left open are listed in `neverFinished`.
 */
export function requestTimeline(events) {
  const sorted = [...events].sort((a, b) => Number(a.timestamp ?? 0) - Number(b.timestamp ?? 0));
  const inv = sorted.find(isInvocation);
  const path = inv ? requestPath(inv) : '';
  const outcome = inv?.$workers?.outcome ?? inv?.$metadata?.outcome ?? null;
  const wallMs = inv?.$workers?.wallTimeMs ?? inv?.$workers?.wallTime ?? null;
  const t0 = Number(sorted[0]?.timestamp ?? 0);
  const open = new Map();
  const lines = [];
  for (const e of sorted) {
    const src = e.source && typeof e.source === 'object' ? e.source : null;
    const at = `+${String(Number(e.timestamp ?? t0) - t0).padStart(6)}ms`;
    const level = src?.level ?? e.$metadata?.level ?? '';
    if (isInvocation(e)) {
      lines.push(`${at} [request] ${path || '(no path)'}`);
      continue;
    }
    if (typeof src?.event === 'string' && src.event.startsWith('db.query.')) {
      const q = `${src.model ?? '?'}.${src.operation ?? '?'}`;
      if (src.event === 'db.query.start') open.set(src.queryId, q);
      else open.delete(src.queryId);
      const dur = src.durationMs !== undefined ? ` ${src.durationMs}ms` : '';
      lines.push(`${at} [${level}] ${src.event} ${src.queryId ?? ''} ${q}${dur}`);
      continue;
    }
    const msg = src?.event ?? src?.message ?? e.$metadata?.message ?? e.$metadata?.error ?? '';
    lines.push(`${at} [${level}] ${redactLine(msg).replace(/\s+/g, ' ').slice(0, 200)}`);
  }
  const neverFinished = [...open].map(([queryId, query]) => ({ queryId, query }));
  return { path, outcome, wallMs, lines, neverFinished, count: sorted.length };
}

/** Plain-text rendering of requestTimeline(), capped so it fits an issue. */
export function formatTimeline(requestId, t, { maxLines = 60 } = {}) {
  const head = `=== request ${requestId} ${t.path} outcome=${t.outcome ?? '?'} wall=${t.wallMs ?? '?'}ms (${t.count} events)`;
  const body = t.lines.length > maxLines ? [...t.lines.slice(0, maxLines), `… ${t.lines.length - maxLines} more lines`] : t.lines;
  const tail =
    t.neverFinished.length > 0
      ? `--- never finished: ${t.neverFinished.map((q) => `${q.queryId} ${q.query}`).join(', ')}`
      : '--- every D1 query that started also finished';
  return [head, ...body, tail].join('\n');
}
