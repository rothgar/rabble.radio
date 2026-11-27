// src/app/api/csp-report/route.ts
//
// POST /api/csp-report -> log a Content-Security-Policy violation report
//   from the report-only header (src/lib/security-headers.ts, issue #180).
//   Browsers send one of two shapes, chosen by which CSP directive they
//   honour: the legacy `report-uri`, a single `{"csp-report": {...}}` object
//   with `application/csp-report+json` (some browsers send plain `application/json`); or the
//   Reporting API's `report-to`, a batched array of
//   `{type: 'csp-violation', url, body}` objects with
//   `application/reports+json`. No storage, no D1 table: the log line is
//   the record, same pipeline as src/app/api/crashes/route.ts.
//   Response: 204 always (a malformed body is still worth seeing in the
//   log), 400 only when the body isn't JSON at all.

import { NextResponse, type NextRequest } from 'next/server';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const FIELD_MAX = 1000;
// A Reporting API POST can batch arbitrarily many reports; cap how many of
// one request's entries become log lines so a single request can't fan out
// into unbounded logger.warn calls.
const MAX_VIOLATIONS_PER_REQUEST = 20;

interface NormalizedViolation {
  documentUri?: string;
  violatedDirective?: string;
  effectiveDirective?: string;
  blockedUri?: string;
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
  disposition?: string;
  statusCode?: number;
}

const str = (v: unknown): string | undefined =>
  typeof v === 'string' ? v.slice(0, FIELD_MAX) : undefined;
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

/**
 * Drops the query string and fragment from a reported URL before logging.
 * The CSP spec only strips the fragment before a browser reports a URL, not
 * the query string (CSP3 "serialize a violation"); this app's OAuth callback
 * carries its code/state as a query string, so logging these fields verbatim
 * would leak it if a violation ever fires on that page.
 */
function strippedUrl(v: unknown): string | undefined {
  const value = str(v);
  if (!value) return value;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value;
  }
}

/** Accepts either the legacy `report-uri` or the Reporting API's field names. */
function normalize(report: Record<string, unknown>): NormalizedViolation {
  return {
    documentUri: strippedUrl(report['document-uri'] ?? report.documentURL),
    violatedDirective: str(report['violated-directive'] ?? report.effectiveDirective),
    effectiveDirective: str(report['effective-directive'] ?? report.effectiveDirective),
    blockedUri: strippedUrl(report['blocked-uri'] ?? report.blockedURL),
    sourceFile: strippedUrl(report['source-file'] ?? report.sourceFile),
    lineNumber: num(report['line-number'] ?? report.lineNumber),
    columnNumber: num(report['column-number'] ?? report.columnNumber),
    disposition: str(report.disposition),
    statusCode: num(report['status-code'] ?? report.statusCode),
  };
}

function extractViolations(body: unknown): NormalizedViolation[] {
  // Reporting API: an array of { type: 'csp-violation', body: {...} }.
  if (Array.isArray(body)) {
    return body
      .slice(0, MAX_VIOLATIONS_PER_REQUEST)
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .filter((item) => item.type === 'csp-violation' || item.type === undefined)
      .map((item) => normalize((item.body as Record<string, unknown>) ?? item));
  }
  // Legacy report-uri: a single { "csp-report": {...} } object.
  if (body && typeof body === 'object' && 'csp-report' in (body as Record<string, unknown>)) {
    return [normalize((body as Record<string, unknown>)['csp-report'] as Record<string, unknown>)];
  }
  if (body && typeof body === 'object') {
    return [normalize(body as Record<string, unknown>)];
  }
  return [];
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'validation_error', message: 'Request body must be JSON.' }, { status: 400 });
  }

  for (const violation of extractViolations(body)) {
    logger.warn('csp.violation', { ...violation });
  }

  return new NextResponse(null, { status: 204 });
}
