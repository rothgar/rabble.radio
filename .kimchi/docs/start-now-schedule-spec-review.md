# Review: Start Now / Schedule for Later Spec

**Verdict: NEEDS_REVISION**

The spec captures the headline UX but has correctness, safety, and completeness gaps that need to be fixed before a Builder implements it.

## Issues

### 1. Start-now flow can leave a live space without a host token
**File/chunk:** `src/app/api/spaces/route.ts` — "When `startNow === true`" section

The spec orders operations as:
1. `createSpace({ ..., scheduledAt: null })`
2. `setSpaceLive(space.id, true)`
3. `publishLiveStatus(...)`
4. `startRecording(...)`
5. Generate host token
6. Return token

If step 5 fails, the space has already been marked live, the banner may have been published, and recording may have started, but the host has no token and cannot join. This violates the spec's own requirement: "the space should not be left live without a token."

**Suggested fix:** Reorder so the space is created in `active` status first, the LiveKit token is generated next, and only then transition to `live`, publish the banner, and start recording. If token generation fails, return `500` and leave the space `active` (or clean it up). Wrap the live transition + side effects in a try/catch and roll back to `active` on failure.

### 2. Spec references non-existent LiveKit helpers
**File/chunk:** `src/lib/livekit.ts` and `src/app/api/spaces/route.ts`

The spec says to use `createHostToken`/`createSpaceToken` from `src/lib/livekit.ts`. Those functions do not exist; the existing module exports `generateToken`, `createRoom`, `roomNameForSpace`, etc.

**Suggested fix:** Replace the helper references with concrete existing functions:
- Use `createRoom(space.id)` before minting the token.
- Use `generateToken({ room: roomNameForSpace(space.id), identity: user.did, role: 'host', name: user.handle })` to mint the host token.
If a wrapper helper is desired, define it explicitly in `src/lib/livekit.ts` (e.g., `createHostToken(spaceId, user)`) and ensure it reuses the same `identity: user.did` convention used by `/api/spaces/[id]/join/route.ts`.

### 3. ATProto publish described as "best-effort" contradicts existing behavior
**File/chunk:** `src/app/api/spaces/route.ts` — "Best-effort publish ATProto live banner"

The existing `/api/spaces/[id]/live/route.ts` rolls the space back to non-live if `publishLiveStatus` fails. Treating it as best-effort in the create flow would mean a space can be `live` without a banner, which is inconsistent and likely not the intended UX.

**Suggested fix:** Decide on one policy. Either:
- Make banner publish a hard requirement and roll back `setSpaceLive(false)` on failure (consistent with the live route), or
- Document explicitly why the create flow should differ and add a remediation path for hosts.

### 4. API route imports are not specified
**File/chunk:** `src/app/api/spaces/route.ts`

The spec describes calling `publishLiveStatus`, `startRecording`, `createRecording`, etc., but never lists the required imports. The current route only imports `createSpace`, `getSpacesForUser`, `toPublicSpace`, `tryExpireStaleSpaces`, and `getCurrentUser`.

**Suggested fix:** Add an explicit imports section to the spec, e.g.:
- `import { publishLiveStatus } from '@/lib/atproto';`
- `import { createRecording, findActiveRecordingForSpace, buildRecordingKey } from '@/lib/recording';`
- `import { createRoom, generateToken, roomNameForSpace } from '@/lib/livekit';`
- `import { setSpaceLive } from '@/lib/spaces';`

### 5. Validation rules are incomplete
**File/chunk:** `src/app/api/spaces/route.ts` — validation section

The spec lists three validation errors but omits several needed checks:
- `scheduledAt` must be in the future (currently `createSpace` silently treats past dates as immediate active spaces).
- The 15-minute boundary check must specify whether seconds/milliseconds are ignored or rounded, and what reference timezone is used (the spec says ISO UTC strings are sent).
- The 30-day maximum needs a reference point ("more than 30 days from now").
- There is no explicit rule for `startNow: true` with a present-but-empty `scheduledAt` string vs. absent `scheduledAt`.

**Suggested fix:** Add the following validation requirements:
1. `startNow === true` and `scheduledAt` is non-null/non-empty string → `400`.
2. `scheduledAt` parses to a date strictly greater than `new Date()` → `400` if not.
3. `scheduledAt.getTime() <= now.getTime() + 30 * 24 * 60 * 60 * 1000` → `400` if exceeded.
4. `scheduledAt.getUTCMinutes() % 15 === 0` and `scheduledAt.getUTCSeconds() === 0` and `scheduledAt.getUTCMilliseconds() === 0` → `400` if not.

### 6. Default schedule computation is underspecified
**File/chunk:** `src/components/CreateSpaceForm.tsx`

The spec says "Compute default scheduled value: next 15-minute boundary, clamped to 30 days max" but does not say how to round or what timezone to use.

**Suggested fix:** Specify the algorithm, e.g.:
- Use the user's local time.
- Round up to the next 15-minute boundary (`00`, `15`, `30`, `45`).
- If that exceeds 30 days from now, clamp to exactly 30 days from now rounded down to the nearest 15-minute boundary.
- Format as `YYYY-MM-DDTHH:mm` for `datetime-local`.

### 7. sessionStorage handoff lacks failure handling
**File/chunk:** `src/components/SpacePageClient.tsx`

The spec says to consume the token from `sessionStorage` and "Ignore missing/invalid tokens silently (fall back to the join button)." It does not define what makes a token "valid" or how to handle a stale/used token.

**Suggested fix:** Define validation in `SpacePageClient` before calling `setJoined`, e.g.:
- Parse the stored JSON and verify it contains non-empty `token`, `wsUrl`, `role`, `roomName`, and `identity`.
- Verify `roomName` matches `roomNameForSpace(spaceId)` (or omit this check and rely on the token's own grants).
- If validation fails, remove the item and show the join button.
- Always remove the item after reading it to prevent replay.

### 8. Missing test coverage
**File/chunk:** `Tests` section

The test plan is incomplete:
- No test for `SpacePageClient` consuming/removing the `sessionStorage` token.
- No test for the form computing and displaying the default 15-minute schedule value.
- No test for the API route's token-generation failure path (space must not be live).
- No test for ATProto banner failure / rollback behavior.
- No test for the LiveKit helper wrapper (if one is added) or the integration between the route and `generateToken`/`createRoom`.

**Suggested fix:** Add these test cases to the spec, with file paths:
- `tests/components/space-page-client.test.tsx`
- Updated `tests/api/spaces.test.ts` covering the new validation rules and start-now responses.
- Updated `tests/lib/livekit.test.ts` for any new helper.

### 9. API response shape for scheduled mode omits navigation hint
**File/chunk:** `src/app/api/spaces/route.ts` — response section

The spec returns `{ space, startNow: false }` for scheduled creation. The client then navigates to `/spaces`. This is fine, but the spec does not explain why `startNow` is returned at all in the scheduled case or how the client uses it.

**Suggested fix:** Either remove `startNow` from the scheduled response (since the client already knows the mode it submitted) or document that the client uses it to decide the redirect target. Keep the API contract minimal and explicit.

### 10. Existing `CreateSpaceForm.tsx` does not match the planned UX
**File/chunk:** `src/components/CreateSpaceForm.tsx`

The current form shows a single "Create space" button and an always-visible schedule input. The spec requires a split button with "Start now" as the primary action and "Schedule for later" in a dropdown. The current file will need a near-complete rewrite, which is larger than the spec suggests.

**Suggested fix:** Split the form work into two sub-chunks:
1. UI: replace the button group with a split button + dropdown and add the `mode` state.
2. Submit logic: branch on `mode`, compute default schedule, handle the start-now token response, and navigate.

## Chunk size assessment

The `src/app/api/spaces/route.ts` chunk mixes validation, space creation, LiveKit token minting, ATProto banner publishing, and recording setup. That is too large for one independent Builder task. Split it into:
1. Validation + `createSpace` branching.
2. LiveKit token generation helpers.
3. Start-now side-effect orchestration (live transition, banner, recording).

The `src/components/CreateSpaceForm.tsx` chunk is also large; split as noted above.
