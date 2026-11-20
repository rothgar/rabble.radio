#!/usr/bin/env node
// scripts/box-watch.mjs — notice discoboxes stuck on a Claude usage limit,
// say so on GitHub, and get them going again when the limit resets.
//
//   node scripts/box-watch.mjs [--dry-run] [--no-llm] [--verbose]
//
// Every tick (rabble-boxwatch.timer, every 5 minutes):
//   1. lists the live boxes (`discobox ls`) and reads each screen
//      (`discobox capture`);
//   2. finds boxes stopped on "You've hit your … limit · resets …" (a regex,
//      then, for screens that match nothing, a yes/no from a local model on
//      the aperture gateway, which has no usage limit);
//   3. on the first sighting opens (or comments on) one issue labelled `ops`,
//      "Claude usage limit reached", so the owner learns why the factory went
//      quiet, and remembers the box in ~/.local/state/rabble-boxwatch/;
//   4. with BOXWATCH_FALLBACK_MODEL set (the timer sets qwen3.8-27b-nvfp4),
//      types `/effort medium`, `/model <fallback>` and `continue` into the
//      box, so the worker carries on with a local model that has no limit
//      (the gateway rejects effort "high" for it, hence the effort step);
//      when the reset time has passed, types `/model <primary>` and
//      `/effort auto` to put it back. Without a fallback model the box is
//      parked and gets `continue` at the reset.
//
// Claude Code's own `fallbackModel` chain does not help here: it skips
// rate-limit and billing errors by design, and a usage limit is one.
//
// Environment: DISCOBOX (cli), BOXWATCH_REPO (rothgar/rabble.radio),
// BOXWATCH_GATEWAY (https://ai.gerbil-dragon.ts.net), BOXWATCH_LLM_MODEL
// (qwen3.8-27b-nvfp4, the classifier), BOXWATCH_FALLBACK_MODEL (unset = park
// the box), BOXWATCH_FALLBACK_EFFORT (medium), BOXWATCH_STATE
// (~/.local/state/rabble-boxwatch).

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const run = promisify(execFile);
const has = (f) => process.argv.includes(`--${f}`);
const dryRun = has('dry-run');
const useLlm = !has('no-llm');
const verbose = has('verbose');

const DISCOBOX = process.env.DISCOBOX ?? 'discobox';
const REPO = process.env.BOXWATCH_REPO ?? 'rothgar/rabble.radio';
const GATEWAY = (process.env.BOXWATCH_GATEWAY ?? 'https://ai.gerbil-dragon.ts.net').replace(/\/$/, '');
const LLM_MODEL = process.env.BOXWATCH_LLM_MODEL ?? 'qwen3.8-27b-nvfp4';
const FALLBACK = process.env.BOXWATCH_FALLBACK_MODEL ?? '';
const FALLBACK_EFFORT = process.env.BOXWATCH_FALLBACK_EFFORT ?? 'medium';
const STATE_DIR = process.env.BOXWATCH_STATE ?? path.join(homedir(), '.local/state/rabble-boxwatch');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const ISSUE_TITLE = 'Claude usage limit reached';
const LABEL = 'ops';
const MARK = '<!-- box-watch -->';
const SCREEN_LINES = 60;

// "You've hit your session limit · resets 3:45pm", "… weekly limit · resets Mon 12:00am (America/Los_Angeles)",
// "… Opus limit · resets 3pm". Matched on the trimmed screen.
const LIMIT_RE = /You(?:'|’)ve hit your ([A-Za-z0-9 ]+?) limit(?:\s*[·•-]\s*resets?\s*(?:at\s*)?([^\n]*))?/i;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const dbg = (...a) => { if (verbose) log(...a); };

async function sh(cmd, args, opts = {}) {
  const { stdout } = await run(cmd, args, { maxBuffer: 16 * 1024 * 1024, ...opts });
  return stdout;
}

// ------------------------------------------------------------------- discobox
async function liveBoxes() {
  const out = JSON.parse(await sh(DISCOBOX, ['ls', '-o', 'json']));
  const list = out.sandboxes ?? out;
  return list
    .filter((b) => b.runtime?.state && b.runtime.state !== 'archived')
    .map((b) => ({
      id: b.id,
      name: b.meta?.name ?? b.displayName ?? b.id,
      harnessId: b.config?.harnessConfigId ?? null,
      tags: b.meta?.tags ?? {},
      state: b.runtime.state,
      running: (b.runtime.agentStatus?.sessions ?? []).some((s) => s.execStatus === 'running'),
    }));
}

async function screen(id) {
  try {
    const out = await sh(DISCOBOX, ['capture', id, '--trim', '--scrollback', '40'], { timeout: 30000 });
    const lines = out.split('\n');
    return lines.slice(-SCREEN_LINES).join('\n');
  } catch (e) {
    dbg(`capture ${id} failed: ${e.message.split('\n')[0]}`);
    return '';
  }
}

let harnessModels = null;
async function modelOf(harnessId) {
  // Harness configs are named "<slug> (<model>)" by scripts/discobox-gateway-harness.sh.
  if (!harnessModels) {
    harnessModels = new Map();
    try {
      const out = JSON.parse(await sh(DISCOBOX, ['admin', 'harness', 'ls', '-o', 'json']));
      for (const h of out.harnessConfigs ?? out.items ?? out) {
        const m = String(h.name ?? '').match(/\(([^)]+)\)\s*$/);
        if (m) harnessModels.set(h.id, m[1].split(/[\s,]+/)[0]);
      }
    } catch (e) { dbg(`harness ls failed: ${e.message.split('\n')[0]}`); }
  }
  return harnessModels.get(harnessId) ?? process.env.BOXWATCH_PRIMARY_MODEL ?? 'claude-sonnet-5';
}

async function type(id, text) {
  if (dryRun) { log(`  would type into ${id}: ${text}`); return; }
  await sh(DISCOBOX, ['send', id, text]);
  await sh(DISCOBOX, ['send-key', id, 'Enter']);
}

// ------------------------------------------------------------------------ LLM
async function classify(text) {
  const body = {
    model: LLM_MODEL,
    max_tokens: 200,
    temperature: 0,
    chat_template_kwargs: { enable_thinking: false },
    messages: [
      {
        role: 'system',
        content:
          'You read the last lines of a terminal running a coding agent (Claude Code). Answer with JSON only, no prose: ' +
          '{"status": "usage_limit" | "question" | "error" | "working" | "idle", "resets_at": string | null}. ' +
          '"usage_limit" means the agent stopped because an Anthropic or Claude usage, rate, session, weekly or model limit was reached; ' +
          'copy the reset time text into resets_at. "question" means it is waiting for a person to answer or approve. ' +
          '"error" means it stopped on another error. "working" means it is still doing something. "idle" means it finished and waits at the prompt.',
      },
      { role: 'user', content: `Screen:\n${text.slice(-3000)}` },
    ],
  };
  const res = await fetch(`${GATEWAY}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`gateway ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content ?? '';
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`no JSON in model answer: ${raw.slice(0, 120)}`);
  return JSON.parse(m[0]);
}

// ----------------------------------------------------------------- reset time
// "3:45pm", "3pm", "Mon 12:00am", "1:50am (Asia/Tokyo)" -> epoch ms of the next such moment.
function parseReset(text, now = new Date()) {
  if (!text) return null;
  const m = text.match(/(?:(Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?:\s*\(([A-Za-z_]+\/[A-Za-z_]+)\))?/i);
  if (!m) return null;
  const [, wd, hh, mm, ap, tz] = m;
  let hour = Number(hh) % 12;
  if (ap?.toLowerCase() === 'pm') hour += 12;
  if (!ap && Number(hh) === 24) hour = 0;
  if (!ap && Number(hh) > 12) hour = Number(hh);
  const minute = Number(mm ?? 0);
  const zone = tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour12: false, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const wall = (d) => Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  // Walk forward minute by minute from now until the wall clock in `zone` reads hh:mm (and the weekday, if given); at most 8 days.
  const want = { hour: String(hour).padStart(2, '0'), minute: String(minute).padStart(2, '0') };
  for (let t = Math.ceil(now.getTime() / 60000) * 60000, end = t + 8 * 86400000; t < end; t += 60000) {
    const w = wall(new Date(t));
    if ((w.hour === want.hour || (w.hour === '24' && want.hour === '00')) && w.minute === want.minute && (!wd || w.weekday.toLowerCase() === wd.toLowerCase())) return t;
  }
  return null;
}

// --------------------------------------------------------------------- GitHub
async function gh(args) {
  return (await sh('gh', args, { timeout: 60000 })).trim();
}

async function openIssueNumber() {
  const out = await gh(['issue', 'list', '--repo', REPO, '--label', LABEL, '--state', 'open', '--search', `"${ISSUE_TITLE}" in:title`, '--json', 'number', '--jq', '.[0].number']);
  return out ? Number(out) : null;
}

async function report(box, info) {
  const line = `${MARK}\n**${box.name}** (\`${box.id}\`) stopped on the ${info.kind ?? 'usage'} limit${info.resetsText ? `, resets ${info.resetsText}` : ''}${info.resetsAt ? ` (${new Date(info.resetsAt).toISOString()})` : ''}.${FALLBACK ? ` Switched to \`${FALLBACK}\` meanwhile.` : ' It is parked until then; box-watch types `continue` once the limit resets.'}`;
  if (dryRun) { log(`  would report: ${line.replace(MARK + '\n', '')}`); return null; }
  const num = await openIssueNumber();
  if (num) {
    await gh(['issue', 'comment', String(num), '--repo', REPO, '--body', line]);
    return num;
  }
  const body = [
    MARK,
    '## Today',
    '',
    'The Claude subscription behind the aperture gateway hit a usage limit, so every Claude Code box (the factory manager, its workers, the QA box) stops until it resets. Boxes seen stopped:',
    '',
    line.replace(MARK + '\n', '- '),
    '',
    '## Wanted',
    '',
    'Know when the factory is quiet because of the limit rather than a bug, and have workers resume on their own once it resets.',
    '',
    '## Done when',
    '',
    '- Every box listed here has resumed (box-watch comments as each one does) and this issue is closed.',
    '- If limits keep stopping work, decide on a fallback: a second credential, a smaller model for triage, or fewer parallel workers.',
    '',
    'Filed by `scripts/box-watch.mjs` (rabble-boxwatch.timer on the homelab).',
  ].join('\n');
  const url = await gh(['issue', 'create', '--repo', REPO, '--title', ISSUE_TITLE, '--label', LABEL, '--body', body]);
  return Number(url.split('/').pop());
}

async function comment(num, text) {
  if (!num) return;
  if (dryRun) { log(`  would comment on #${num}: ${text}`); return; }
  await gh(['issue', 'comment', String(num), '--repo', REPO, '--body', `${MARK}\n${text}`]);
}

// ---------------------------------------------------------------------- state
async function loadState() {
  try { return JSON.parse(await readFile(STATE_FILE, 'utf8')); } catch { return { boxes: {} }; }
}
async function saveState(state) {
  if (dryRun) return;
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

// ----------------------------------------------------------------------- main
const state = await loadState();
const boxes = await liveBoxes();
const now = Date.now();
log(`${boxes.length} live box${boxes.length === 1 ? '' : 'es'}${dryRun ? ' (dry run)' : ''}`);

for (const box of boxes) {
  const text = await screen(box.id);
  const entry = state.boxes[box.id];
  let limited = null;
  const m = text.match(LIMIT_RE);
  if (m) {
    const resets = (m[2] ?? '').trim() || text.match(/reset(?:s)?\s+(?:at\s+)?([A-Za-z]{3}\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?(?:\s*\([A-Za-z_]+\/[A-Za-z_]+\))?)/i)?.[0]?.replace(/^reset(?:s)?\s+(?:at\s+)?/i, '') || null;
    limited = { kind: m[1].trim(), resetsText: resets, via: 'regex' };
  }
  else if (useLlm && text.trim()) {
    try {
      const c = await classify(text);
      dbg(`${box.id}: llm says ${JSON.stringify(c)}`);
      if (c.status === 'usage_limit') limited = { kind: 'usage', resetsText: c.resets_at ?? null, via: 'llm' };
    } catch (e) { dbg(`${box.id}: llm failed: ${e.message.split('\n')[0]}`); }
  }

  if (limited) {
    if (!entry) {
      const resetsAt = parseReset(limited.resetsText, new Date(now));
      log(`${box.id} (${box.name}): stopped on the ${limited.kind} limit, resets ${limited.resetsText ?? 'unknown'} [${limited.via}]`);
      const info = { ...limited, resetsAt };
      const issue = await report(box, info);
      const primary = await modelOf(box.harnessId);
      if (FALLBACK) { await type(box.id, `/effort ${FALLBACK_EFFORT}`); await type(box.id, `/model ${FALLBACK}`); await type(box.id, 'continue'); }
      state.boxes[box.id] = { name: box.name, seenAt: now, kind: limited.kind, resetsText: limited.resetsText, resetsAt, issue, primary, switched: Boolean(FALLBACK), nudgedAt: 0 };
    } else {
      dbg(`${box.id}: still limited`);
    }
    continue;
  }

  if (entry && !entry.switched) {
    // A parked box no longer shows the limit text: it resumed, after our nudge or someone else's.
    log(`${box.id} (${box.name}): no longer shows the limit`);
    await comment(entry.issue, `**${entry.name}** (\`${box.id}\`) is working again.`);
    delete state.boxes[box.id];
  }
  // A switched box is expected to show no limit text (it is working on the fallback); only the reset time puts it back.
}

// Boxes we remember whose limit has reset: put a switched box back on its model, nudge a parked one.
// Unknown reset time, or a nudge that did not take: try again hourly.
for (const [id, entry] of Object.entries(state.boxes)) {
  if (!boxes.some((b) => b.id === id)) { delete state.boxes[id]; continue; }
  const due = entry.resetsAt ? now > entry.resetsAt + 2 * 60000 : now - entry.seenAt > 3600000;
  if (!due || now - entry.nudgedAt < 3600000) continue;
  if (entry.switched) {
    log(`${id} (${entry.name}): reset passed, back to ${entry.primary}`);
    await type(id, `/model ${entry.primary}`);
    await type(id, '/effort auto');
    await comment(entry.issue, `**${entry.name}** (\`${id}\`) is back on \`${entry.primary}\`.`);
    delete state.boxes[id];
    continue;
  }
  log(`${id} (${entry.name}): reset ${entry.resetsAt ? 'passed' : 'time unknown'}, typing continue`);
  await type(id, 'continue');
  entry.nudgedAt = now;
}

// Close the issue once no box is limited.
const open = Object.keys(state.boxes).length;
if (!open) {
  const num = dryRun ? null : await openIssueNumber();
  if (num) {
    const mine = await gh(['issue', 'view', String(num), '--repo', REPO, '--json', 'body', '--jq', '.body']);
    if (mine.includes(MARK)) {
      await gh(['issue', 'close', String(num), '--repo', REPO, '--comment', `${MARK}\nEvery box has resumed; closing.`]);
      log(`closed #${num}`);
    }
  }
}
await saveState(state);
