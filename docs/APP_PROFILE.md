# App profile record

rabble.radio publishes a `community.lexicon.app.profile#self` record
([schema](https://lexicon.garden/nsid/community.lexicon.app.profile)) on an
atproto account the owner controls, the same way a host's live banner is a
`app.bsky.actor.status#self` record on theirs. It's how the service itself
becomes discoverable through the AT Protocol network.

**Account:** `rabble.radio` (`did:plc:dmauvltgdhhn3w6d3zjbbkyc`, the
service's own Bluesky account, not a listener's or host's). The handle is
verified by the `_atproto.rabble.radio` TXT record in the Cloudflare zone.
First published 2026-11-27; check it with:

```bash
curl -s 'https://panus.us-west.host.bsky.network/xrpc/com.atproto.repo.getRecord?repo=did:plc:dmauvltgdhhn3w6d3zjbbkyc&collection=community.lexicon.app.profile&rkey=self'
```

(`public.api.bsky.app` does not serve this collection; ask the PDS.)

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
