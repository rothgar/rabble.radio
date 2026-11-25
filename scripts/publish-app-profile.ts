#!/usr/bin/env -S npx tsx
//
// scripts/publish-app-profile.ts
//
// Publishes (or updates) the `community.lexicon.app.profile#self` record
// that represents rabble.radio itself in the AT Protocol network —
// https://lexicon.garden/nsid/community.lexicon.app.profile. This is a
// one-off authenticated call, not a flow a user ever triggers, so it's run
// once by the owner rather than wired to a route or scheduled job.
//
// See docs/APP_PROFILE.md for which account holds the record and how to
// re-run this after editing PROFILE below.
//
// Usage:
//   ATPROTO_APP_PROFILE_IDENTIFIER=rabble.radio.bsky.social \
//   ATPROTO_APP_PROFILE_PASSWORD=xxxx-xxxx-xxxx-xxxx \
//     pnpm tsx scripts/publish-app-profile.ts

import {
  APP_PROFILE_PLATFORM,
  PDS_SERVICE_URL,
  createAppPasswordSession,
  publishAppProfile,
  type AppProfileInput,
} from '../src/lib/atproto';

const PROFILE: AppProfileInput = {
  name: 'Rabble',
  description: 'Live audio spaces for Bluesky.',
  links: [
    { uri: 'https://rabble.radio', label: 'Website' },
    { uri: 'https://github.com/rothgar/rabble.radio', label: 'GitHub' },
  ],
  platforms: [APP_PROFILE_PLATFORM.web],
};

async function main(): Promise<void> {
  const identifier = process.env.ATPROTO_APP_PROFILE_IDENTIFIER;
  const password = process.env.ATPROTO_APP_PROFILE_PASSWORD;
  const service = process.env.ATPROTO_APP_PROFILE_SERVICE || PDS_SERVICE_URL;
  if (!identifier || !password) {
    throw new Error(
      'Set ATPROTO_APP_PROFILE_IDENTIFIER (handle or DID) and ' +
        'ATPROTO_APP_PROFILE_PASSWORD (an app password, not the account ' +
        'password) for the account rabble.radio publishes as.'
    );
  }

  const session = await createAppPasswordSession({
    identifier,
    password,
    service,
  });
  const result = await publishAppProfile({ session, profile: PROFILE });
  if (!result.ok) {
    throw new Error(result.error ?? 'Failed to publish app profile record.');
  }

  // eslint-disable-next-line no-console
  console.log(`Published ${result.uri} for ${session.handle ?? session.did}.`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
