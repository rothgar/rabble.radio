// src/app/api/health/route.ts
//
// GET /api/health
//
// Returns overall service status plus per-dependency health checks. Used by
// the Kubernetes readiness/liveness probes and by humans/automation to verify
// the deployment is healthy.
//
// Body:
//   {
//     status: 'ok' | 'degraded' | 'down',
//     timestamp: string,
//     uptime: number,
//     service: string,
//     checks: { db: boolean, livekit: boolean },
//   }
//
// Behaviour:
//   - `db` is checked via a lightweight Prisma `$queryRaw` (`SELECT 1`).
//   - `livekit` is checked by attempting to reach the LiveKit HTTP signalling
//     endpoint at `${LIVEKIT_URL}/rtc` (Node fetch). A 200/400/404 all count
//     as "reachable"; only network errors fail the check.
//   - Status is 'down' only when both checks fail; 'degraded' if any single
//     check fails; 'ok' otherwise.

import { NextResponse, type NextRequest } from 'next/server';
import type { HealthStatus } from '@/types';
import { prisma } from '@/lib/db';
import { createLogger, correlationIdFromRequest } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const STARTED_AT = Date.now();

interface HealthCheckBody extends HealthStatus {
  checks: {
    db: boolean;
    livekit: boolean;
  };
}

async function checkDb(): Promise<boolean> {
  try {
    // $queryRaw works even when the generated Prisma client is missing, as
    // long as the runtime can reach Postgres.
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function checkLiveKit(url: string): Promise<boolean> {
  // Derive http(s) URL from the LiveKit ws(s) URL.
  let httpUrl: URL;
  try {
    const wsUrl = new URL(url);
    const protocol = wsUrl.protocol === 'wss:' ? 'https:' : 'http:';
    httpUrl = new URL(`${protocol}//${wsUrl.host}/rtc`);
  } catch {
    return false;
  }
  // Abort after a short timeout so a stuck LiveKit does not stall /api/health.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(httpUrl.toString(), {
      method: 'GET',
      signal: controller.signal,
    });
    // Any HTTP response means the server is reachable. 400/404 are common
    // when the path doesn't exist but the host is up.
    return res.status > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = correlationIdFromRequest(request);
  const log = createLogger({ correlationId });

  const livekitUrl = process.env.LIVEKIT_URL?.trim() ?? '';
  const [dbOk, livekitOk] = await Promise.all([
    checkDb(),
    livekitUrl ? checkLiveKit(livekitUrl) : Promise.resolve(false),
  ]);

  let status: HealthStatus['status'];
  if (!dbOk && !livekitOk) {
    status = 'down';
  } else if (!dbOk || !livekitOk) {
    status = 'degraded';
  } else {
    status = 'ok';
  }

  const body: HealthCheckBody = {
    status,
    timestamp: new Date().toISOString(),
    uptime: Math.round((Date.now() - STARTED_AT) / 1000),
    service: 'rabble',
    checks: { db: dbOk, livekit: livekitOk },
  };

  if (status === 'down') {
    log.error('health.down', { ...body });
    return NextResponse.json(body, { status: 503 });
  }
  if (status === 'degraded') {
    log.warn('health.degraded', { ...body });
  } else {
    log.debug('health.ok', { ...body });
  }
  return NextResponse.json(body, { status: 200 });
}
