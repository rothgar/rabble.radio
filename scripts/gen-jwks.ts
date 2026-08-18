#!/usr/bin/env -S npx tsx
//
// scripts/gen-jwks.ts
//
// Generates an ES256 keypair and writes:
//   - jwks.json   (public, suitable for serving at /api/auth/bluesky/jwks.json)
//   - private-key.pem (PKCS#8 PEM, used by the production OAuth client)
//
// Usage:
//   pnpm tsx scripts/gen-jwks.ts [output-dir]
//
// Defaults to writing ./jwks.json and ./private-key.pem in the project root.

import { generateKeyPair, exportJWK, exportPKCS8 } from 'jose';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const outputDir = resolve(here, '..', process.argv[2] ?? '.');
  await mkdir(outputDir, { recursive: true });

  const { publicKey, privateKey } = await generateKeyPair('ES256', {
    extractable: true,
  });

  const publicJwk = await exportJWK(publicKey);
  publicJwk.alg = 'ES256';
  publicJwk.use = 'sig';
  if (!publicJwk.kid) {
    publicJwk.kid = crypto.randomUUID();
  }

  const privatePem = await exportPKCS8(privateKey);
  const publicPem = await exportPKCS8(publicKey).catch(() => '');

  const jwks = { keys: [publicJwk] };

  await writeFile(
    join(outputDir, 'jwks.json'),
    JSON.stringify(jwks, null, 2) + '\n',
    'utf8'
  );
  await writeFile(
    join(outputDir, 'private-key.pem'),
    privatePem + '\n',
    { encoding: 'utf8', mode: 0o600 }
  );
  if (publicPem) {
    await writeFile(
      join(outputDir, 'public-key.pem'),
      publicPem + '\n',
      'utf8'
    );
  }

  // eslint-disable-next-line no-console
  console.log(
    `Wrote ${join(outputDir, 'jwks.json')} and ${join(outputDir, 'private-key.pem')} (kid=${publicJwk.kid}).`
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
