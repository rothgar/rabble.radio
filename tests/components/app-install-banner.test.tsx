// tests/components/app-install-banner.test.tsx

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { APP_BANNER_DISMISSED_KEY, AppInstallBanner } from '@/components/AppInstallBanner';

function setUserAgent(ua: string): void {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('AppInstallBanner', () => {
  it('stays hidden on desktop browsers', async () => {
    setUserAgent('Mozilla/5.0 (X11; Linux x86_64)');
    await act(async () => { render(<AppInstallBanner />); });
    expect(screen.queryByTestId('app-install-banner')).toBeNull();
  });

  it('offers TestFlight on iPhone and remembers a dismissal', async () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
    await act(async () => { render(<AppInstallBanner />); });
    const banner = screen.getByTestId('app-install-banner');
    expect(banner.getAttribute('data-platform')).toBe('ios');
    expect(screen.getByTestId('app-install-cta').getAttribute('href')).toContain('testflight.apple.com');
    await act(async () => { fireEvent.click(screen.getByTestId('app-install-dismiss')); });
    expect(screen.queryByTestId('app-install-banner')).toBeNull();
    expect(window.localStorage.getItem(APP_BANNER_DISMISSED_KEY)).toBe('1');
    cleanup();
    await act(async () => { render(<AppInstallBanner />); });
    expect(screen.queryByTestId('app-install-banner')).toBeNull();
  });

  it('offers the APK on Android', async () => {
    setUserAgent('Mozilla/5.0 (Linux; Android 15; SM-F956U)');
    await act(async () => { render(<AppInstallBanner />); });
    expect(screen.getByTestId('app-install-cta').getAttribute('href')).toBe('/downloads/rabble-android.apk');
  });
});
