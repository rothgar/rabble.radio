// src/lib/validation.ts
//
// One failure-first validator for routes that hand-roll field checks:
// `check(condition, message)` throws on the first false condition, and the
// route turns that into the `validation_error` JSON response with `check`'s
// own message.

import { NextResponse } from 'next/server';

export class ValidationError extends Error {}

export function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ValidationError(message);
}

/** `{ error: 'validation_error', message }` at 400. */
export function validationErrorResponse(err: ValidationError): NextResponse {
  return NextResponse.json({ error: 'validation_error', message: err.message }, { status: 400 });
}
