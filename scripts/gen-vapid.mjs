#!/usr/bin/env node
// scripts/gen-vapid.mjs
//
// Generate a Web Push (VAPID) key pair in the form src/lib/push.ts expects:
// the public key as the base64url raw P-256 point (what the browser gets
// from /api/push/vapid) and the private key as the base64url JWK `d`.
//
//   node scripts/gen-vapid.mjs
//
// Prints the two values; nothing is written to disk. Put VAPID_PUBLIC_KEY in
// the environment's `vars` (wrangler.jsonc) and VAPID_PRIVATE_KEY in its
// secrets (`wrangler secret put VAPID_PRIVATE_KEY --env production`).

const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const raw = Buffer.from(await crypto.subtle.exportKey('raw', key.publicKey));
const jwk = await crypto.subtle.exportKey('jwk', key.privateKey);

console.log(`VAPID_PUBLIC_KEY=${raw.toString('base64url')}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
