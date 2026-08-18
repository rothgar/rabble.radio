// src/lib/logger.ts
//
// Tiny structured JSON logger for Rabble.
//
// Goals:
//   - Zero external dependencies (avoids adding pino/winston to the bundle).
//   - Single-line JSON output for easy ingestion by Loki, CloudWatch, etc.
//   - Correlation IDs flow through requests so OAuth, LiveKit, and ATProto
//     failures can be traced end-to-end.
//   - Dev-friendly pretty output when stdout is a TTY and the env is not
//     "production".
//
// API:
//   const log = createLogger({ service: 'rabble' });
//   log.info('oauth.callback.success', { did });
//   log.error('oauth.callback.failed', { err, correlationId });
//
// Correlation IDs:
//   const correlationId = newCorrelationId();
//   const log = createLogger({ correlationId });

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  [key: string]: unknown;
}

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function envLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

const SERVICE_NAME = process.env.APP_NAME?.trim() || 'rabble';

/**
 * Generate a request-scoped correlation ID. Prefixed with `req_` so it is
 * trivially greppable in production logs.
 */
export function newCorrelationId(): string {
  // randomUUID is available in Node 19+ and the runtime we target.
  const id = (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(
    /-/g,
    ''
  );
  return `req_${id.slice(0, 16)}`;
}

/**
 * Extract a correlation ID from an incoming Next request. Honours the
 * `x-request-id` / `x-correlation-id` headers if the upstream proxy set them.
 * Otherwise mints a new one.
 */
export function correlationIdFromRequest(request: Request): string {
  const fromHeader =
    request.headers.get('x-request-id') ??
    request.headers.get('x-correlation-id');
  if (fromHeader && /^[A-Za-z0-9_.-]{4,64}$/.test(fromHeader)) {
    return fromHeader;
  }
  return newCorrelationId();
}

function shouldEmit(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[envLevel()];
}

function emit(level: LogLevel, event: string, fields: LogFields): void {
  if (!shouldEmit(level)) return;
  const record: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    service: SERVICE_NAME,
    event,
    ...fields,
  };
  // Convert Error objects to a serializable shape.
  if (record.err instanceof Error) {
    const e = record.err as Error & { code?: string };
    record.err = {
      name: e.name,
      message: e.message,
      stack: e.stack,
      code: e.code,
    };
  }
  const line = JSON.stringify(record);
  if (process.env.NODE_ENV === 'production') {
    if (level === 'error' || level === 'warn') {
      // eslint-disable-next-line no-console
      console.error(line);
    } else {
      // eslint-disable-next-line no-console
      console.log(line);
    }
  } else if (process.stdout.isTTY) {
    const color =
      level === 'error'
        ? '\x1b[31m'
        : level === 'warn'
        ? '\x1b[33m'
        : level === 'info'
        ? '\x1b[36m'
        : '\x1b[90m';
    // eslint-disable-next-line no-console
    console.log(
      `${color}${level.toUpperCase().padEnd(5)}\x1b[0m ${event} ${JSON.stringify(
        fields
      )}`
    );
  } else if (level === 'error' || level === 'warn') {
    // eslint-disable-next-line no-console
    console.error(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

export interface CreateLoggerOptions {
  /** Per-logger correlation/request ID included in every record. */
  correlationId?: string;
  /** Optional pre-bound context fields (e.g. user.did, space.id). */
  base?: LogFields;
}

export function createLogger(opts: CreateLoggerOptions = {}): Logger {
  const bound: LogFields = { ...(opts.base ?? {}) };
  if (opts.correlationId) {
    bound.correlationId = opts.correlationId;
  }
  const build = (base: LogFields): Logger => ({
    debug: (event, fields) => emit('debug', event, { ...base, ...fields }),
    info: (event, fields) => emit('info', event, { ...base, ...fields }),
    warn: (event, fields) => emit('warn', event, { ...base, ...fields }),
    error: (event, fields) => emit('error', event, { ...base, ...fields }),
    child: (fields) => build({ ...base, ...fields }),
  });
  return build(bound);
}

/** Default shared logger. */
export const logger = createLogger();
