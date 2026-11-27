// tests/helpers/request.ts
//
// One NextRequest builder for the ~100 call sites that each repeat the same
// method/content-type/JSON-body construction.

import { NextRequest } from 'next/server';

export function jsonRequest(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    ...(body !== undefined
      ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  });
}
