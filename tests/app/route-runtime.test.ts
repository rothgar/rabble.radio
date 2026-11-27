// tests/app/route-runtime.test.ts
//
// The site is deployed to Cloudflare Workers through @opennextjs/cloudflare
// (custom-worker.ts), which does not support Next's `edge` runtime: a route
// that declares `export const runtime = 'edge'` builds a separate edge
// function bundle that custom-worker.ts's component loader cannot load,
// throwing an uncaught `interopDefault` exception in production the first
// time the route is requested (issue #176 — /.well-known/security.txt).
// Every route must declare `nodejs`, the only runtime OpenNext's Cloudflare
// adapter runs.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const appDir = join(__dirname, '..', '..', 'src', 'app');

const routeFiles = (readdirSync(appDir, { recursive: true }) as string[]).filter((f) =>
  f.endsWith('route.ts')
);

describe('route runtime declarations', () => {
  it('found route.ts files to check', () => {
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  it.each(routeFiles)('%s does not declare the edge runtime', (file) => {
    const source = readFileSync(join(appDir, file), 'utf8');
    expect(source).not.toMatch(/export const runtime\s*=\s*['"]edge['"]/);
  });
});
