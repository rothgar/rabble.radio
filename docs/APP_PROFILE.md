# App profile record

rabble.radio publishes a `community.lexicon.app.profile#self` record
([schema](https://lexicon.garden/nsid/community.lexicon.app.profile)) on an
atproto account the owner controls, the same way a host's live banner is a
`app.bsky.actor.status#self` record on theirs. It's how the service itself
becomes discoverable through the AT Protocol network.

**Account:** the owner names which account holds the record once it's
created (not a listener's or host's account). Record that handle/DID here
once it's decided.

## Updating the record

Edit `PROFILE` in `scripts/publish-app-profile.ts`, then re-run it with an
app password for that account (**Settings → App passwords** on Bluesky, not
the account password):

```bash
ATPROTO_APP_PROFILE_IDENTIFIER=<handle-or-did> \
ATPROTO_APP_PROFILE_PASSWORD=<app-password> \
  pnpm tsx scripts/publish-app-profile.ts
```

`putRecord` overwrites the existing `self` record, so re-running it after an
edit is the whole update — there's no separate delete step.
