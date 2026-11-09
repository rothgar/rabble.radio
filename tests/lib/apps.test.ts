// tests/lib/apps.test.ts

import { describe, expect, it } from 'vitest';
import { ANDROID_APK_PATH, TESTFLIGHT_URL, appLinkFor, detectMobilePlatform } from '@/lib/apps';

describe('detectMobilePlatform', () => {
  it('spots iPhones, iPads, touch Macs (iPadOS) and Android phones', () => {
    expect(detectMobilePlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('ios');
    expect(detectMobilePlatform('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)')).toBe('ios');
    expect(detectMobilePlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios');
    expect(detectMobilePlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBeNull();
    expect(detectMobilePlatform('Mozilla/5.0 (Linux; Android 15; SM-F956U)')).toBe('android');
    expect(detectMobilePlatform('Mozilla/5.0 (X11; Linux x86_64)')).toBeNull();
    expect(detectMobilePlatform('')).toBeNull();
  });

  it('links each platform to its install path', () => {
    expect(appLinkFor('ios')).toBe(TESTFLIGHT_URL);
    expect(TESTFLIGHT_URL).toMatch(/^https:\/\/testflight\.apple\.com\/join\//);
    expect(appLinkFor('android')).toBe(ANDROID_APK_PATH);
  });
});
