# Start Now / Schedule for Later Spec (Revised)

## Goal
Change the space-creation UX so that **Start now** is the default action and **Schedule for later** is an option in a dropdown attached to the primary button.

When the host chooses **Start now**, the space is created, immediately marked live, and the host is dropped straight into the room (no extra join click). When **Schedule for later** is chosen, the host picks a date/time and the space is created in `scheduled` status.

Scheduling constraints:
- 15-minute increments only.
- Up to 30 days in the future.
- Default selection is the next 15-minute slot.

## Chunks

### Chunk 1: CreateSpaceForm UI
**Files changed:** `src/components/CreateSpaceForm.tsx`
**Complexity:** simple

- Replace the single "Create space" submit button with a split button:
  - Primary action label: **Start now**.
  - A caret button opens a dropdown menu with one item: **Schedule for later**.
- Maintain `title`, `description`, and internal `mode: 'now' | 'schedule'`.
- When `mode === 'schedule'`:
  - Show a `datetime-local` input with `step="900"`.
  - Set its default value to the next local 15-minute boundary, clamped to 30 days from now.
  - Default algorithm:
    1. `const now = new Date();`
    2. `const max = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);`
    3. Compute `candidate` by rounding `now` up to the next 15-minute boundary using local time.
    4. If `candidate > max`, set `candidate` to `max` rounded down to the nearest 15-minute boundary.
    5. Format as `YYYY-MM-DDTHH:mm` and assign to the input.
- On submit:
  - `mode === 'now'`: POST `{ title, description, startNow: true }`.
  - `mode === 'schedule'`: POST `{ title, description, scheduledAt: isoString }` where `isoString` is `new Date(scheduledInput).toISOString()`.
- If the API returns `{ startNow: true, token, wsUrl, role, roomName, identity }`:
  - Store the object as JSON in `sessionStorage` under key `rabble_join_{space.id}`.
  - Navigate to `/space/{space.id}`.
- If the API returns a scheduled space, navigate to `/spaces`.
- The dropdown must be keyboard-accessible and close on outside click.

### Chunk 2: API Validation and Create Branching
**Files changed:** `src/app/api/spaces/route.ts`
**Complexity:** simple

Add validation and branching to the existing POST handler. Imports added to the route:
```ts
import { setSpaceLive, toPublicSpace, tryExpireStaleSpaces } from '@/lib/spaces';
import { publishLiveStatus } from '@/lib/atproto';
import { createRecording, findActiveRecordingForSpace, buildRecordingKey } from '@/lib/recording';
import { createRoom, generateToken, roomNameForSpace } from '@/lib/livekit';
```

Validation rules:
1. If `body.startNow === true` and `body.scheduledAt` is a non-null/non-empty string → `400` with `error: 'validation_error'`.
2. If `body.startNow` is provided and not a boolean → `400`.
3. If `body.scheduledAt` is provided:
   - Must be a string; otherwise `400`.
   - Parse with `new Date()`. If invalid → `400`.
   - Must be strictly greater than `new Date()`; otherwise `400`.
   - Must be `<= now + 30 days`; otherwise `400`.
   - Must be on a 15-minute boundary (minutes `% 15 === 0`, seconds `=== 0`, ms `=== 0`) using UTC; otherwise `400`.
4. If `body.startNow === false` and no `scheduledAt` → existing immediate active behavior.

Response shape:
- Start-now mode: `{ space, startNow: true, token, wsUrl, role, roomName, identity }`.
- Schedule mode: `{ space }`.
- Immediate mode (no startNow, no scheduledAt): `{ space }`.

### Chunk 3: LiveKit Helper
**Files changed:** `src/lib/livekit.ts`
**Complexity:** simple

Add a thin, explicit helper:
```ts
export async function createHostToken(
  spaceId: string,
  user: { did: string; handle: string }
): Promise<{ token: string; wsUrl: string; roomName: string; identity: string }> {
  const roomName = roomNameForSpace(spaceId);
  await createRoom(spaceId);
  const token = generateToken({
    room: roomName,
    identity: user.did,
    name: user.handle,
    role: 'host',
  });
  return { token, wsUrl: getLiveKitWsUrl(), roomName, identity: user.did };
}
```
Ensure `getLiveKitWsUrl` and `createRoom` are exported and return the expected shapes. No changes to `generateToken` signature.

### Chunk 4: Start-Now Side-Effect Orchestration
**Files changed:** `src/app/api/spaces/route.ts`
**Complexity:** complex

When `startNow === true`:
1. Create the space with `scheduledAt: null` (status will be `active`).
2. Generate the host token via `createHostToken(space.id, user)`.
   - If this fails, return `500` and leave the space `active` (do not transition to live).
3. Transition the space to live via `setSpaceLive(space.id, true)`.
4. Publish the ATProto live banner via `publishLiveStatus({ session, spaceUrl, title, thumb })`.
   - If this fails, roll back by calling `setSpaceLive(space.id, false)` and return `502` with `error: 'atproto_failed'`.
5. Start recording best-effort:
   - Check `findActiveRecordingForSpace(space.id)`.
   - If none, call `startRecording(roomName, { filepath: buildRecordingKey(roomName, new Date()) })`.
   - If an egress starts, call `createRecording({ ... })`.
   - If recording fails, log it and include `recordingError` in the response, but do not fail the request.
6. Return `{ space: toPublicSpace(updated, origin), startNow: true, token, wsUrl, role: 'host', roomName, identity }`.

All side effects after token generation are wrapped in a single try/catch. On any unexpected error, roll back `setSpaceLive(space.id, false)` and return `500`.

### Chunk 5: SpacePageClient Auto-Join Handoff
**Files changed:** `src/components/SpacePageClient.tsx`
**Complexity:** simple

- On mount, read `sessionStorage.getItem(`rabble_join_${spaceId}`)`.
- If present, parse JSON and validate it has non-empty `token`, `wsUrl`, `role`, `roomName`, `identity`.
- If valid, call `setJoined(parsed)` immediately and remove the item from `sessionStorage`.
- If invalid or missing, remove the item and fall back to the join button.
- Add tests in `tests/components/space-page-client.test.tsx` covering valid consumption and invalid cleanup.

### Chunk 6: Tests and Deployment
**Files changed:**
- `tests/components/create-space-form.test.tsx`
- `tests/components/space-page-client.test.tsx`
- `tests/api/spaces.test.ts`
- `tests/lib/livekit.test.ts` (if new helper tests are needed)

**Complexity:** simple

Test coverage:
- CreateSpaceForm:
  - Default mode is "Start now".
  - Dropdown switches to schedule mode and shows date input.
  - Default schedule value is the next 15-minute boundary.
  - Date input `step` attribute is `900`.
  - Submit payload includes `startNow: true` for now mode.
  - Submit payload includes `scheduledAt` for schedule mode.
- SpacePageClient:
  - Consumes a valid `sessionStorage` token on mount and removes it.
  - Removes an invalid token and shows the join button.
- API:
  - `startNow: true` creates a space with status `live`, returns host token fields.
  - `startNow: true` with `scheduledAt` returns `400`.
  - `scheduledAt` not on 15-minute boundary returns `400`.
  - `scheduledAt` in the past returns `400`.
  - `scheduledAt` more than 30 days future returns `400`.
  - Token-generation failure leaves the space `active` and returns `500`.
- LiveKit helper:
  - `createHostToken` returns a JWT and room metadata.

After tests pass locally, run `make sync`, `make remote-build`, `make remote-deploy`, and verify on `rabble.exe.xyz`.

## Client Flow

### Start now
1. Form POSTs `/api/spaces` with `startNow: true`.
2. API creates space, generates host token, transitions to live, publishes banner, starts recording.
3. API returns token + room metadata.
4. Form stores token in `sessionStorage`.
5. Form navigates to `/space/{id}`.
6. `SpacePageClient` consumes token and mounts `SpaceRoom` immediately.

### Schedule
1. Form POSTs `/api/spaces` with `scheduledAt`.
2. API creates scheduled space.
3. Form navigates to `/spaces`.

## API Changes

### POST `/api/spaces`

Request body (start now):
```json
{
  "title": "My Space",
  "description": "optional",
  "startNow": true
}
```

Response:
```json
{
  "space": { "id": "...", "status": "live", ... },
  "startNow": true,
  "token": "livekit-jwt",
  "wsUrl": "wss://...",
  "role": "host",
  "roomName": "...",
  "identity": "..."
}
```

Request body (schedule):
```json
{
  "title": "My Space",
  "description": "optional",
  "scheduledAt": "2026-08-19T12:00:00.000Z"
}
```

Response:
```json
{
  "space": { "id": "...", "status": "scheduled", ... }
}
```

Validation errors:
- `startNow` and `scheduledAt` together → `400`.
- `scheduledAt` in the past → `400`.
- `scheduledAt` more than 30 days future → `400`.
- `scheduledAt` not on 15-minute UTC boundary → `400`.
- Token generation failure during start-now → `500`, space remains `active`.
- ATProto banner failure during start-now → `502`, space rolled back to `active`.
