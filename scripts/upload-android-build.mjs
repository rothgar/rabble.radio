// scripts/upload-android-build.mjs
//
// Upload the current Android debug APK to the recordings bucket under
// builds/rabble-android.apk, where GET /downloads/rabble-android.apk serves
// it. Reads the R2 token from .env (R2_RABBLE_DEV_*), never prints it.
//
//   cd android && nix-shell --run './gradlew assembleDebug' && cd .. \
//     && node scripts/upload-android-build.mjs

import { readFileSync } from 'node:fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

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
  credentials: {
    accessKeyId: env.R2_RABBLE_DEV_ACCESS_TOKEN,
    secretAccessKey: env.R2_RABBLE_DEV_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});
const apk = process.argv[2] ?? 'android/app/build/outputs/apk/debug/app-debug.apk';
const Body = readFileSync(apk);
await client.send(
  new PutObjectCommand({
    Bucket: process.env.RECORDING_BUCKET ?? 'rabble-dev-recordings',
    Key: 'builds/rabble-android.apk',
    Body,
    ContentType: 'application/vnd.android.package-archive',
  })
);
console.log(`uploaded ${apk} (${(Body.length / 1024 / 1024).toFixed(1)} MB) -> builds/rabble-android.apk`);
