# Bluesky OAuth setup

Rabble speaks the [AT Protocol OAuth](https://atproto.com/guides/glossary#oauth)
flow via [`@atproto/oauth-client-node`](https://github.com/bluesky-social/atproto/tree/main/packages/oauth/oauth-client-node).

In dev (no `PUBLIC_URL` set) the app uses the **loopback** flow: a
short-lived local listener hosts the client metadata, the user pastes
their PDS-hosted redirect URL back into the browser, and the access
token is stored in the session.

In production (`PUBLIC_URL` set) the app needs to switch to
**`private_key_jwt`** against a hosted JWKS. This guide covers both
paths and the production migration.

## Dev: loopback flow

Nothing to configure. With `PUBLIC_URL` unset:

1. `pnpm dev`
2. Open `http://localhost:3000`.
3. Click "Sign in with Bluesky", enter a handle, follow the PDS-hosted
   auth page.
4. The PDS redirects back to a `127.0.0.1:<random>` URL; the app
   receives the callback and stores the session.

The loopback flow is fine for a single-developer local server. It does
**not** scale to a hosted deployment because the PDS expects to fetch
client metadata from a stable URL.

## Production: `private_key_jwt` flow

For production you publish two documents:

- `/.well-known/jwks.json` — your public keyset, fetched by the PDS to
  verify your signed client assertions.
- `/oauth-client-metadata.json` — your client metadata document,
  referenced by `client_id` in the authorization request.

The app signs each token request with the matching private key. The PDS
fetches `jwks.json` to verify the signature.

### 1. Generate a keypair

```bash
pnpm gen:jwks
```

This writes:

- `jwks.json` — the JSON Web Key Set you publish at
  `/.well-known/jwks.json`.
- `private-key.pem` — the PKCS#8 private key, **mode 0600**.
- `public-key.pem` — the matching public key (for reference).

Re-run any time you want to rotate; bump the `kid` and update both
documents.

### 2. Host the JWKS

The Next.js app exposes the JWKS at `GET /.well-known/jwks.json`. The
implementation lives in `src/app/.well-known/jwks.json/route.ts` (the
`.well-known` folder is a literal segment; Next.js serves it as a
route). The endpoint reads `JWKS_PUBLIC_KEY` from the Secret if set,
otherwise derives a JWKS from `JWKS_PRIVATE_KEY` at startup.

You can sanity-check it after deploy:

```bash
curl https://spaces.example.com/.well-known/jwks.json
```

### 3. Publish the client metadata

Create `/oauth-client-metadata.json` at the same public origin. A
minimal example:

```json
{
  "client_id": "https://spaces.example.com/oauth-client-metadata.json",
  "client_name": "Rabble",
  "client_uri": "https://spaces.example.com",
  "logo_uri": "https://spaces.example.com/logo.png",
  "redirect_uris": [
    "https://spaces.example.com/api/oauth/callback"
  ],
  "scope": "atproto transition:generic",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "private_key_jwt",
  "token_endpoint_auth_signing_alg": "ES256",
  "dpop_bound_access_tokens": true
}
```

Notes:

- `client_id` MUST be the URL of the metadata document itself.
- `redirect_uris` MUST exactly match the `redirect_uri` the app sends.
- `token_endpoint_auth_method: private_key_jwt` is what tells the PDS
  to expect a signed JWT assertion instead of a static client secret.
- `dpop_bound_access_tokens: true` keeps the access tokens tied to the
  DPoP key the client generates per session.

Host it at `https://spaces.example.com/oauth-client-metadata.json`.
You can do this as a Next.js route (`src/app/oauth-client-metadata.json/route.ts`)
or a static file mounted into the container.

### 4. Configure the app

Set the following environment variables (or Secret keys):

| Variable | Value |
| --- | --- |
| `PUBLIC_URL` | `https://spaces.example.com` |
| `JWKS_PRIVATE_KEY` | contents of `private-key.pem` |
| `JWKS_PUBLIC_KEY` | (optional) contents of `jwks.json` |
| `BLUESKY_OAUTH_CLIENT_ID` | (optional; defaults to `${PUBLIC_URL}/oauth-client-metadata.json`) |
| `BLUESKY_OAUTH_REDIRECT_URI` | (optional; defaults to `${PUBLIC_URL}/api/auth/bluesky/callback`) |

When `PUBLIC_URL` is set, `src/lib/auth.ts` switches from the loopback
metadata to the hosted metadata + `private_key_jwt`. The state and
session stores remain in-memory for the MVP; swap them for Redis before
scaling out.

### 5. Verify end-to-end

```bash
# 1. JWKS reachable:
curl https://rabble.town/.well-known/jwks.json | jq

# 2. Client metadata reachable:
curl https://rabble.town/oauth-client-metadata.json | jq

# 3. Initiate the flow:
open "https://rabble.town/api/auth/bluesky?handle=you.bsky.social"
```

You should land on the PDS-hosted auth page. After consent the PDS
redirects back to `/api/auth/bluesky/callback?code=...&state=...` and
the app stores the session in an iron-session cookie.

## Rotating keys

1. Generate a new keypair (`pnpm gen:jwks` in a temp dir).
2. Concatenate the new public key into `jwks.json` (keep the old one
   for a grace window; bump the `kid`).
3. Replace `JWKS_PRIVATE_KEY` in the Secret.
4. Roll the app pods.
5. After the grace window, drop the old public key from `jwks.json`
   and roll again.

## Why `private_key_jwt` and not a static secret?

`@atproto/oauth-client-node` supports both, but Bluesky's hosted PDS
recommends `private_key_jwt` for hosted clients because:

- No shared secret to leak — the PDS verifies a fresh JWT per request
  against the public key it fetches from your `jwks.json`.
- Rotation is a public-key swap, not a coordinated secret rotation.
- DPoP binds each access token to the device, so a stolen token alone
  is not enough to call the PDS.

The loopback flow used in dev is the same library, just with a
dynamically-generated metadata URL the PDS fetches from the local
listener. See
[`@atproto/oauth-client-node` README](https://github.com/bluesky-social/atproto/tree/main/packages/oauth/oauth-client-node)
for the full reference.
