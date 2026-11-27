// src/app/.well-known/security.txt/route.ts
//
// GET /.well-known/security.txt
// Serves a static RFC 9116 security.txt document so a researcher who finds
// a vulnerability has a documented channel instead of a public issue.

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const EXPIRES = '2027-11-26T00:00:00.000Z';

const BODY = [
  'Contact: mailto:security@rabble.radio',
  `Expires: ${EXPIRES}`,
  'Canonical: https://rabble.radio/.well-known/security.txt',
  '',
].join('\r\n');

export async function GET(): Promise<NextResponse> {
  return new NextResponse(BODY, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=86400',
    },
  });
}
