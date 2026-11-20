// src/app/downloads/page.tsx
//
// Get the apps. iOS installs through TestFlight's public link; Android is a
// direct APK download. Linked from the home page and the phone banner.

import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { AndroidBetaSignup } from '@/components/AndroidBetaSignup';
import { Button, Card, PageLayout } from '@/components/ui';
import { ANDROID_APK_PATH, TESTFLIGHT_URL } from '@/lib/apps';

export const metadata: Metadata = {
  title: 'Get the Rabble app',
  description: 'Rabble Radio for iPhone (TestFlight) and Android (APK).',
};

export default function DownloadsPage(): ReactElement {
  return (
    <>
      <SiteHeader />
      <PageLayout className="max-w-xl">
        <header className="flex flex-col gap-2">
          <h1 className="text-display">Get the Rabble app</h1>
          <p className="text-body text-[var(--color-text-secondary)]">
            Listen, react and take the stage from your phone. Both apps are test
            builds right now, updated often.
          </p>
        </header>

        <Card data-testid="download-ios">
          <div className="flex flex-col gap-3">
            <h2 className="text-heading">iPhone</h2>
            <ol className="list-decimal space-y-1 pl-5 text-body text-[var(--color-text-secondary)]">
              <li>Install Apple&apos;s free TestFlight app from the App Store.</li>
              <li>Open the link below on your iPhone and tap Install.</li>
              <li>TestFlight updates the app whenever a new build lands.</li>
            </ol>
            <Button href={TESTFLIGHT_URL} size="lg" data-testid="download-ios-link">
              Join on TestFlight
            </Button>
          </div>
        </Card>

        <Card data-testid="download-android">
          <div className="flex flex-col gap-3">
            <h2 className="text-heading">Android</h2>
            <ol className="list-decimal space-y-1 pl-5 text-body text-[var(--color-text-secondary)]">
              <li>Download the APK below on your phone.</li>
              <li>Open it and allow installs from your browser if asked.</li>
              <li>Download again to update; it installs over the old build.</li>
            </ol>
            <Button href={ANDROID_APK_PATH} size="lg" variant="accent" data-testid="download-android-link">
              Download the APK
            </Button>
          </div>
        </Card>

        <Card data-testid="download-android-beta">
          <div className="flex flex-col gap-3">
            <h2 className="text-heading">Android on Google Play</h2>
            <p className="text-body text-[var(--color-text-secondary)]">
              We&apos;re setting up a closed beta on Google Play. Leave your email and
              we&apos;ll add you once it opens — no automatic enrollment, a person reviews
              every request.
            </p>
            <AndroidBetaSignup />
          </div>
        </Card>
      </PageLayout>
    </>
  );
}
