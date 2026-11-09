// tests/app/downloads-page.test.tsx

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import DownloadsPage from '@/app/downloads/page';

vi.mock('@/components/SiteHeader', () => ({ SiteHeader: () => null }));

afterEach(cleanup);

describe('/downloads', () => {
  it('links the TestFlight public link and the APK', () => {
    render(<DownloadsPage />);
    expect(screen.getByTestId('download-ios-link').getAttribute('href')).toContain('testflight.apple.com/join/');
    expect(screen.getByTestId('download-android-link').getAttribute('href')).toBe('/downloads/rabble-android.apk');
  });
});
