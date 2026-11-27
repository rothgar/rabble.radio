import { describe, expect, it } from 'vitest';
import { formatLocalDateTime, formatSize, formatUtcDateTime } from '@/lib/format';

describe('formatUtcDateTime', () => {
  it('renders minute precision in UTC', () => {
    expect(formatUtcDateTime(new Date('2026-11-27T01:06:07.123Z'))).toBe('2026-11-27 01:06 UTC');
  });

  it('is empty for an invalid date', () => {
    expect(formatUtcDateTime(new Date('nope'))).toBe('');
  });
});

describe('formatLocalDateTime', () => {
  it('matches the medium date / short time locale style', () => {
    const iso = '2026-11-27T01:06:07.000Z';
    expect(formatLocalDateTime(iso)).toBe(
      new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    );
  });

  it('is empty for null, empty or invalid input', () => {
    expect(formatLocalDateTime(null)).toBe('');
    expect(formatLocalDateTime('')).toBe('');
    expect(formatLocalDateTime('nope')).toBe('');
  });
});

describe('formatSize', () => {
  it('renders KB under a megabyte and MB above', () => {
    expect(formatSize(512 * 1024)).toBe('512 KB');
    expect(formatSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });

  it('is empty for null, zero or non-finite', () => {
    expect(formatSize(null)).toBe('');
    expect(formatSize(0)).toBe('');
    expect(formatSize(Number.NaN)).toBe('');
  });
});
