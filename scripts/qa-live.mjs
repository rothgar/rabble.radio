#!/usr/bin/env node
// scripts/qa-live.mjs — deterministic checks of the deployed site.
//
//   node scripts/qa-live.mjs [--base=https://rabble.rodeo] [--json]
//
// Exit 1 when any check fails. Used after every deploy by
// .github/workflows/deploy.yml and as the first step of the qa-live skill
// (the QA box reads the JSON and investigates what failed).

const arg = (name, dflt) => (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${dflt}`).split('=').slice(1).join('=');
const base = arg('base', 'https://rabble.rodeo').replace(/\/$/, '');
const asJson = process.argv.includes('--json');
const SLOW_MS = 5000;
const results = [];

const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function req(path, init = {}) {
  const res = await fetch(base + path, { redirect: 'manual', signal: AbortSignal.timeout(20000), ...init });
  return res;
}

async function check(name, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - t0, detail: detail ?? '' });
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, detail: e.message });
  }
}

let spaces = [];

await check('health', async () => {
  const r = await req('/api/health');
  expect(r.status === 200, `GET /api/health -> ${r.status}`);
  const j = await r.json();
  expect(j.status === 'ok', `health status ${j.status}`);
  expect(j.checks?.db === true, 'health: db check false');
  expect(j.checks?.livekit === true, 'health: livekit check false');
  return 'db and livekit ok';
});

await check('home', async () => {
  const r = await req('/');
  expect(r.status === 200, `GET / -> ${r.status}`);
  const html = await r.text();
  expect(html.includes('<title>Rabble'), 'home: <title> is not Rabble');
  expect(/data-testid="home-/.test(html), 'home: no home-* sections rendered');
  expect(!/Application error|Internal Server Error/i.test(html), 'home: error page text');
  return `${(html.length / 1024).toFixed(0)} KB`;
});

await check('spaces api', async () => {
  const r = await req('/api/spaces');
  expect(r.status === 200, `GET /api/spaces -> ${r.status}`);
  const j = await r.json();
  expect(Array.isArray(j.spaces), 'spaces: no spaces array');
  spaces = j.spaces;
  const live = spaces.filter((s) => s.status === 'live').length;
  return `${spaces.length} shows, ${live} live`;
});

await check('show page', async () => {
  const s = spaces.find((x) => x.status === 'live') ?? spaces[0];
  if (!s) return 'skipped: no shows';
  // The page is client-rendered: the server HTML carries the shell and a
  // loading marker, the data comes from GET /api/spaces/<id>.
  const r = await req(`/show/${s.id}`);
  expect(r.status === 200, `GET /show/${s.id} -> ${r.status}`);
  const html = await r.text();
  expect(/data-testid="(space-loading|space-page|space-title)"/.test(html), `/show/${s.id}: page shell not rendered`);
  const a = await req(`/api/spaces/${s.id}`);
  expect(a.status === 200, `GET /api/spaces/${s.id} -> ${a.status}`);
  const j = await a.json();
  const title = j.space?.title ?? j.title;
  expect(title === s.title, `show api title "${title}" != list title "${s.title}"`);
  return `/show/${s.id} (${s.status})`;
});

await check('anonymous join', async () => {
  const s = spaces.find((x) => x.status === 'live');
  if (!s) return 'skipped: no live show';
  const r = await req(`/api/spaces/${s.id}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  expect(r.status === 200, `POST /api/spaces/${s.id}/join -> ${r.status}`);
  const j = await r.json();
  expect(typeof j.token === 'string' && j.token.length > 20, 'join: no token');
  expect(/^wss:\/\//.test(j.wsUrl ?? ''), `join: wsUrl is ${j.wsUrl}`);
  return `role=${j.role} wsUrl=${new URL(j.wsUrl).host}`;
});

for (const path of ['/stations', '/hosts', '/downloads']) {
  await check(`page ${path}`, async () => {
    const r = await req(path);
    expect(r.status === 200, `GET ${path} -> ${r.status}`);
    const html = await r.text();
    expect(!/Application error|Internal Server Error/i.test(html), `${path}: error page text`);
  });
}

await check('android apk', async () => {
  const r = await req('/downloads/rabble-android.apk', { method: 'HEAD' });
  expect(r.status === 200, `HEAD /downloads/rabble-android.apk -> ${r.status}`);
  const ct = r.headers.get('content-type') ?? '';
  expect(ct.includes('android'), `apk content-type ${ct}`);
  const mb = Number(r.headers.get('content-length') ?? 0) / 1024 / 1024;
  expect(mb > 5, `apk is ${mb.toFixed(1)} MB`);
  return `${mb.toFixed(0)} MB`;
});

await check('jwks', async () => {
  const r = await req('/.well-known/jwks.json');
  expect(r.status === 200, `GET /.well-known/jwks.json -> ${r.status}`);
  const j = await r.json();
  expect(Array.isArray(j.keys) && j.keys.length > 0, 'jwks: no keys');
  return `${j.keys.length} key(s)`;
});

await check('push vapid', async () => {
  const r = await req('/api/push/vapid');
  expect(r.status === 200, `GET /api/push/vapid -> ${r.status}`);
  const j = await r.json();
  expect(typeof j.publicKey === 'string' && j.publicKey.length > 20, 'vapid: no publicKey');
});

const failed = results.filter((r) => !r.ok);
const slow = results.filter((r) => r.ok && r.ms > SLOW_MS).map((r) => r.name);
const report = { base, at: new Date().toISOString(), ok: failed.length === 0, failed: failed.length, slow, checks: results };

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name.padEnd(16)} ${String(r.ms).padStart(5)}ms  ${r.detail}`);
  console.log(failed.length ? `\n${failed.length} check(s) failed against ${base}` : `\nall ${results.length} checks passed against ${base}`);
  if (slow.length) console.log(`slow (> ${SLOW_MS} ms): ${slow.join(', ')}`);
}
process.exit(failed.length ? 1 : 0);
