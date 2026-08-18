#!/usr/bin/env node
// scripts/verify-prisma-standalone.mjs
//
// Regression test for the Prisma + Next.js standalone runtime issue.
// Next.js `output: 'standalone'` can drop the generated Prisma client if we
// don't copy it explicitly. Model queries then fail at runtime with:
//   TypeError: Cannot read properties of undefined (reading '_createPrismaPromise')
//
// We use the default Prisma client output path (`node_modules/.prisma/client`
// plus `node_modules/@prisma/client`) with the
// `@prisma/nextjs-monorepo-workaround-plugin` webpack plugin. This script
// checks that the generated client is present in the runner image and that
// model methods are available on a PrismaClient instance.

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`PASS: ${message}`);
}

const candidatePaths = [
  '/app/node_modules/.prisma/client/index.js',
  '/app/node_modules/@prisma/client/index.js',
  '/app/.next/standalone/node_modules/.prisma/client/index.js',
];

const generatedClientPath = candidatePaths.find((p) => existsSync(p));
if (!generatedClientPath) {
  fail(
    'Generated Prisma client not found in any expected location. ' +
      `Searched: ${candidatePaths.join(', ')}`
  );
}
pass(`Generated Prisma client found at ${generatedClientPath}`);

// The generated client is a CommonJS module that exports PrismaClient.
const prismaModule = require(generatedClientPath);
if (typeof prismaModule.PrismaClient !== 'function') {
  fail('PrismaClient is not exported by the generated client');
}
pass('Generated client exports PrismaClient');

// Instantiating PrismaClient without connecting is enough to inspect model
// methods; no database connection is required for this check.
const client = new prismaModule.PrismaClient();
if (typeof client.space !== 'object' || client.space === null) {
  fail('PrismaClient does not have model methods (client.space is missing)');
}
pass('PrismaClient has model methods (client.space is available)');

console.log('All Prisma standalone checks passed.');
