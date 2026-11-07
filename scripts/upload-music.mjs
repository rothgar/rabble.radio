// scripts/upload-music.mjs
//
// Upload pre-show music tracks to the recordings bucket under music/<file>,
// where GET /music/<file> serves them. Only files in the src/lib/music.ts
// catalog are accepted. Reads the R2 token from .env, never prints it.
//
//   node scripts/upload-music.mjs <dir-with-mp3s>

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const dir = process.argv[2];
if (!dir) throw new Error('usage: node scripts/upload-music.mjs <dir>');

const catalog = readFileSync('src/lib/music.ts', 'utf8');
const known = new Set([...catalog.matchAll(/file: '([^']+\.mp3)'/g)].map((m) => m[1]));

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    })
);
for (const k of ['R2_RABBLE_DEV_S3_ENDPOINT', 'R2_RABBLE_DEV_ACCESS_TOKEN', 'R2_RABBLE_DEV_SECRET_ACCESS_KEY']) {
  if (!env[k]) throw new Error(`${k} missing from .env`);
}
const client = new S3Client({
  region: 'auto',
  endpoint: env.R2_RABBLE_DEV_S3_ENDPOINT,
  credentials: { accessKeyId: env.R2_RABBLE_DEV_ACCESS_TOKEN, secretAccessKey: env.R2_RABBLE_DEV_SECRET_ACCESS_KEY },
  forcePathStyle: true,
});
const Bucket = process.env.RECORDING_BUCKET ?? 'rabble-dev-recordings';

let total = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith('.mp3')).sort()) {
  if (!known.has(file)) {
    console.log(`skip ${file}: not in src/lib/music.ts`);
    continue;
  }
  const Body = readFileSync(join(dir, file));
  await client.send(new PutObjectCommand({ Bucket, Key: `music/${file}`, Body, ContentType: 'audio/mpeg' }));
  total += Body.length;
  console.log(`uploaded music/${file} (${(Body.length / 1024 / 1024).toFixed(1)} MB)`);
}
console.log(`done, ${(total / 1024 / 1024).toFixed(1)} MB`);
