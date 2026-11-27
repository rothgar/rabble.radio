#!/usr/bin/env node
// scripts/request-logs.mjs
//
// Print the per-request log timeline of a Worker from Workers Logs
// (Cloudflare observability), and flag D1 queries that started and never
// finished: the evidence a "Worker hung, runtime canceled the request" issue
// asks for. scripts/log-triage.mjs attaches the same timelines to the issues
// it files; this is for a window or a request id it did not cover.
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

import { filter, formatTimeline, requestEvents, requestIdOf, requestPath, requestTimeline, telemetryQuery } from './lib/workers-logs.mjs';

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

async function main() {
  let ids = requestIds;
  const timeframe = from ? { from, to } : { from: new Date(Date.now() - 7 * 86400e3).toISOString(), to };
  if (ids.length === 0) {
    const found = await telemetryQuery({ account, token, service, filters: [filter('$metadata.error', 'exists', undefined)], timeframe });
    ids = [...new Set(found.filter((e) => requestPath(e) === route && requestIdOf(e)).map(requestIdOf))];
    if (ids.length === 0) {
      console.log(`no failed requests on ${route} for ${service} between ${timeframe.from} and ${timeframe.to}`);
      return;
    }
    console.log(`${ids.length} failed request(s) on ${route}: ${ids.join(' ')}`);
  }
  for (const id of ids) {
    const events = await requestEvents({ account, token, service, requestId: id, timeframe });
    if (events.length === 0) {
      console.log(`\n=== request ${id}: no events (outside the window, or past Workers Logs retention)`);
      continue;
    }
    console.log('\n' + formatTimeline(id, requestTimeline(events)));
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
