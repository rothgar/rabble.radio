// src/lib/apps.ts
//
// Where the mobile apps live. iOS ships through a TestFlight public link
// (anyone with the link can install, no approval step); Android is the debug
// APK served by /downloads/[file] from R2. Both are safe to use in client
// components.

export const TESTFLIGHT_URL =
  process.env.NEXT_PUBLIC_TESTFLIGHT_URL || 'https://testflight.apple.com/join/nWFTbpJy';

export const ANDROID_APK_PATH = '/downloads/rabble-android.apk';

export type MobilePlatform = 'ios' | 'android';

/** Which phone platform a user agent belongs to, if any. iPadOS reports as a Mac with touch. */
export function detectMobilePlatform(userAgent: string, maxTouchPoints = 0): MobilePlatform | null {
  const ua = userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return null;
}

export function appLinkFor(platform: MobilePlatform): string {
  return platform === 'ios' ? TESTFLIGHT_URL : ANDROID_APK_PATH;
}
