#!/usr/bin/env node
// scripts/seed-demo.mjs
//
// Seed (or remove) demo hosts and shows so the apps have something to browse
// and join. The hosts are invented accounts with `did:plc:demo…` DIDs and
// `*.demo.rabble.rodeo` handles, so they are easy to recognise and to wipe.
//
//   node scripts/seed-demo.mjs            # seed the remote D1 (rabble.rodeo)
//   node scripts/seed-demo.mjs --local    # seed the local D1 used by next dev
//   node scripts/seed-demo.mjs --remove   # delete every demo row
//
// Demo shows are kept alive by setting `emptySince` far in the future so the
// empty-room sweep never expires them, and `expiresAt` a year out. Nobody is
// in their LiveKit rooms, so joining shows an empty stage with no audio; the
// sweep also resets listener/speaker counts to the real (zero) occupancy.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = new Set(process.argv.slice(2));
const target = args.has('--local') ? '--local' : '--remote';
const removeOnly = args.has('--remove');

const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const iso = (d) => d.toISOString().replace('Z', '+00:00');
const now = new Date();
const plus = (ms) => new Date(now.getTime() + ms);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const FAR_FUTURE = iso(new Date('2100-01-01T00:00:00Z'));
const NEXT_YEAR = iso(plus(365 * DAY));

const avatar = (seed) => `https://api.dicebear.com/9.x/adventurer/png?size=160&seed=${encodeURIComponent(seed)}`;

const HOSTS = [
  { n: 1, handle: 'marisol.demo.rabble.rodeo', displayName: 'Marisol Vega' },
  { n: 2, handle: 'theo.demo.rabble.rodeo', displayName: 'Theo Okafor' },
  { n: 3, handle: 'priya.demo.rabble.rodeo', displayName: 'Priya Natarajan' },
  { n: 4, handle: 'lars.demo.rabble.rodeo', displayName: 'Lars Lindqvist' },
  { n: 5, handle: 'amara.demo.rabble.rodeo', displayName: 'Amara Diallo' },
  { n: 6, handle: 'kenji.demo.rabble.rodeo', displayName: 'Kenji Morita' },
].map((h) => ({ ...h, did: `did:plc:demo${String(h.n).padStart(20, '0')}`, id: `demo_user_${h.n}` }));

const SHOWS = [
  {
    host: 1, slug: 'demo-morning-news-roundup', title: 'Morning News Roundup',
    description: 'Three stories you need before coffee, with call-ins from the audience.',
    status: 'live', musicMood: 'focus', tags: ['News & Politics'], listeners: 42, speakers: 2, reactions: 318, startedAgo: 25 * MIN,
  },
  {
    host: 2, slug: 'demo-late-night-synths', title: 'Late Night Synths',
    description: 'Live modular jam and listener requests. Bring headphones.',
    status: 'live', musicMood: 'groove', tags: ['Music', 'Entertainment'], listeners: 128, speakers: 1, reactions: 2041, startedAgo: 70 * MIN,
  },
  {
    host: 3, slug: 'demo-ship-it-friday', title: 'Ship It Friday: what we broke this week',
    description: 'Engineers swap postmortems. Guests welcome on stage.',
    status: 'live', musicMood: 'upbeat', tags: ['Science & Technology', 'Education'], listeners: 17, speakers: 3, reactions: 96, startedAgo: 8 * MIN,
  },
  {
    host: 4, slug: 'demo-fjord-to-table', title: 'Fjord to Table',
    description: 'Cooking the Nordic pantry, one ingredient at a time. Starting shortly.',
    status: 'active', musicMood: 'lounge', tags: ['Howto & Style'], listeners: 0, speakers: 0, reactions: 12,
  },
  {
    host: 5, slug: 'demo-the-long-game', title: 'The Long Game',
    description: 'Football tactics for people who like spreadsheets.',
    status: 'active', musicMood: 'upbeat', tags: ['Sports'], listeners: 0, speakers: 0, reactions: 54,
  },
  {
    host: 6, slug: 'demo-roguelike-radio', title: 'Roguelike Radio',
    description: 'Permadeath, procedural generation and the games that got it right.',
    status: 'active', musicMood: 'groove', tags: ['Gaming', 'Entertainment'], listeners: 0, speakers: 0, reactions: 7,
  },
  {
    host: 1, slug: 'demo-the-weekend-desk', title: 'The Weekend Desk',
    description: 'A slower look at the week. Scheduled, starts in a moment.',
    status: 'scheduled', tags: ['News & Politics', 'People & Blogs'], listeners: 0, speakers: 0, reactions: 0, scheduledAgo: 10 * MIN,
  },
].map((s, i) => ({ ...s, id: `demo_space_${i + 1}` }));

const sql = [];
sql.push(`DELETE FROM "SpaceTag" WHERE "spaceId" IN (SELECT "id" FROM "Space" WHERE "hostId" LIKE 'did:plc:demo%');`);
sql.push(`DELETE FROM "Space" WHERE "hostId" LIKE 'did:plc:demo%';`);
sql.push(`DELETE FROM "User" WHERE "did" LIKE 'did:plc:demo%';`);

if (!removeOnly) {
  for (const h of HOSTS) {
    sql.push(
      `INSERT INTO "User" ("id","did","handle","displayName","avatarUrl","createdAt","updatedAt") VALUES (${q(h.id)},${q(h.did)},${q(h.handle)},${q(h.displayName)},${q(avatar(h.handle))},${q(iso(plus(-30 * DAY)))},${q(iso(now))});`
    );
  }
  for (const s of SHOWS) {
    const host = HOSTS.find((h) => h.n === s.host);
    const isLive = s.status === 'live';
    const createdAt = iso(plus(-(s.startedAgo ?? s.scheduledAgo ?? 2 * HOUR) - 5 * MIN));
    const scheduledAt = s.status === 'scheduled' ? iso(plus(-s.scheduledAgo)) : null;
    const lastLiveAt = isLive ? iso(plus(-s.startedAgo)) : null;
    sql.push(
      `INSERT INTO "Space" ("id","slug","title","description","hostId","isLive","scheduledAt","expiresAt","emptySince","status","listenerCount","speakerCount","reactionCount","likeCount","sessionCount","totalListeners","hostedSeconds","lastLiveAt","musicMood","createdAt","updatedAt") VALUES (` +
        [
          q(s.id), q(s.slug), q(s.title), q(s.description), q(host.did), isLive ? 1 : 0, q(scheduledAt),
          q(s.status === 'scheduled' ? null : NEXT_YEAR), q(FAR_FUTURE), q(s.status),
          s.listeners, s.speakers, s.reactions, Math.round(s.reactions / 9), isLive ? 4 : 3,
          s.listeners * 6 + 40, (isLive ? 4 : 3) * 55 * 60, q(lastLiveAt), q(s.musicMood ?? null), q(createdAt), q(iso(now)),
        ].join(',') +
        `);`
    );
    for (const tag of s.tags) {
      sql.push(`INSERT INTO "SpaceTag" ("spaceId","tag") VALUES (${q(s.id)},${q(tag)});`);
    }
  }
}

const dir = mkdtempSync(join(tmpdir(), 'rabble-seed-'));
const file = join(dir, 'seed.sql');
writeFileSync(file, sql.join('\n') + '\n');
execFileSync('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'rabble-dev', target, '--file', file], { stdio: 'inherit' });
console.log(removeOnly ? 'removed demo hosts and shows' : `seeded ${HOSTS.length} demo hosts and ${SHOWS.length} shows (${target})`);
