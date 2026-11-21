// src/app/privacy/page.tsx
//
// Stable, linkable privacy policy (#95). Required before Play Console's
// Data safety form or an App Store Connect listing can be submitted, so
// this URL is referenced from both once they're set up — keep it at
// `/privacy` and don't remove the section anchors without checking those
// listings.

import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { Footer } from '@/components/Footer';
import { Card, PageLayout } from '@/components/ui';
import { RECORDING_TTL_DAYS } from '@/lib/recording';

const PRIVACY_TITLE = 'Privacy policy — Rabble';
const PRIVACY_DESCRIPTION = 'What Rabble Radio collects, why, and how long it is kept.';
const LAST_UPDATED = 'November 21, 2026';
const CONTACT_EMAIL = 'admin@rabble.radio';

export const metadata: Metadata = {
  title: PRIVACY_TITLE,
  description: PRIVACY_DESCRIPTION,
};

export default function PrivacyPage(): ReactElement {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <PageLayout className="max-w-xl">
        <header className="flex flex-col gap-2">
          <h1 className="text-display">Privacy policy</h1>
          <p className="text-body text-[var(--color-text-secondary)]">
            Rabble Radio is run by Justin Garrison. This page describes what
            the site and apps collect, why, and how long it&apos;s kept. Last
            updated {LAST_UPDATED}.
          </p>
        </header>

        <Card data-testid="privacy-account">
          <div className="flex flex-col gap-2">
            <h2 className="text-heading">Your Bluesky account</h2>
            <p className="text-body text-[var(--color-text-secondary)]">
              Signing in uses Bluesky&apos;s OAuth: we store the resulting
              session (tied to your Bluesky DID), your handle and the public
              profile info Bluesky returns (display name, avatar). We never
              see or store your Bluesky password. Signing out ends the
              session; deleting your account removes it.
            </p>
          </div>
        </Card>

        <Card data-testid="privacy-audio">
          <div className="flex flex-col gap-2">
            <h2 className="text-heading">Live audio</h2>
            <p className="text-body text-[var(--color-text-secondary)]">
              While you&apos;re on stage, your microphone audio is carried
              live through LiveKit to other listeners in the room. It&apos;s
              not recorded unless the host starts a recording for that show;
              a recording is automatically deleted {RECORDING_TTL_DAYS} days
              after the show ends. Listening doesn&apos;t use your
              microphone.
            </p>
          </div>
        </Card>

        <Card data-testid="privacy-feedback">
          <div className="flex flex-col gap-2">
            <h2 className="text-heading">Feedback reports</h2>
            <p className="text-body text-[var(--color-text-secondary)]">
              Using the feedback button is optional. A report can include
              your message, an email address if you give one, and technical
              context (the page you were on, app version, device info) to
              help us fix the problem. Reports are kept indefinitely so we
              can track recurring issues; contact us to have one removed.
            </p>
          </div>
        </Card>

        <Card data-testid="privacy-notifications">
          <div className="flex flex-col gap-2">
            <h2 className="text-heading">Notifications and app permissions</h2>
            <p className="text-body text-[var(--color-text-secondary)]">
              The Android app asks for microphone access to speak on stage,
              network state to manage the audio connection, and notification
              permission to remind you when a show you follow goes on air.
              None of these are used to track you off the app.
            </p>
          </div>
        </Card>

        <Card data-testid="privacy-crashes">
          <div className="flex flex-col gap-2">
            <h2 className="text-heading">Crash reports</h2>
            <p className="text-body text-[var(--color-text-secondary)]">
              If the app crashes, it can send a report (what happened, the
              device and app version, a stack trace) to our server logs so
              we can fix it. These aren&apos;t stored in our database; they
              age out with our hosting provider&apos;s own log retention.
            </p>
          </div>
        </Card>

        <Card data-testid="privacy-contact">
          <div className="flex flex-col gap-2">
            <h2 className="text-heading">Contact</h2>
            <p className="text-body text-[var(--color-text-secondary)]">
              Questions about this policy, or a request to see or delete
              your data: email{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-[var(--color-accent)] hover:underline"
                data-testid="privacy-contact-email"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </div>
        </Card>
      </PageLayout>
      <Footer />
    </div>
  );
}
