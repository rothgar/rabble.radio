// tests/lib/tags.test.ts
//
// Exercises the tag normalization helpers.

import { describe, it, expect } from 'vitest';
import {
  MAX_TAGS_PER_SHOW,
  normalizeTags,
  isValidTag,
  primaryTagOf,
  YOUTUBE_CATEGORIES,
} from '@/lib/tags';

describe('normalizeTags', () => {
  it('keeps valid categories, de-duplicates, and caps at 3', () => {
    expect(
      normalizeTags(['Music', 'Music', 'Gaming', 'Education', 'Comedy'])
    ).toEqual(['Music', 'Gaming', 'Education']);
  });

  it('returns [] for non-array input', () => {
    expect(normalizeTags(undefined)).toEqual([]);
    expect(normalizeTags('Music')).toEqual([]);
    expect(normalizeTags(null)).toEqual([]);
  });

  it('drops unknown categories and blank strings', () => {
    expect(normalizeTags(['Music', '', '  ', 'NotARealCategory'])).toEqual([
      'Music',
    ]);
  });

  it('trims whitespace before validating', () => {
    expect(normalizeTags(['  Music  '])).toEqual(['Music']);
  });
});

describe('isValidTag', () => {
  it('accepts only known YouTube categories', () => {
    expect(isValidTag('Music')).toBe(true);
    expect(isValidTag('Gaming')).toBe(true);
    expect(isValidTag('Bogus')).toBe(false);
  });
});

describe('YOUTUBE_CATEGORIES', () => {
  it('contains the expected categories and honors the max tag count', () => {
    expect(YOUTUBE_CATEGORIES).toContain('Music');
    expect(YOUTUBE_CATEGORIES).toContain('Science & Technology');
    expect(MAX_TAGS_PER_SHOW).toBe(3);
  });
});

describe('primaryTagOf', () => {
  it('returns the tag earliest in canonical order', () => {
    expect(primaryTagOf(['Gaming', 'Music'])).toBe('Gaming'); // Gaming is earlier
    expect(primaryTagOf(['Comedy', 'Gaming'])).toBe('Comedy');
  });

  it('returns null when there are no valid tags', () => {
    expect(primaryTagOf([])).toBeNull();
    expect(primaryTagOf(['Bogus'])).toBeNull();
  });
});
