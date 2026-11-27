// src/lib/format.ts
//
// Shared date and size formatters. Each one renders a distinct style, so a
// caller picks the function whose output it needs rather than passing options.

/** `YYYY-MM-DD HH:MM UTC` for admin tables; empty for an invalid date. */
export function formatUtcDateTime(d: Date): string {
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

/** Viewer-locale medium date with short time; empty for null or an invalid date. */
export function formatLocalDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** `512 KB` under a megabyte, `1.5 MB` above; empty for null, zero or non-finite. */
export function formatSize(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}
