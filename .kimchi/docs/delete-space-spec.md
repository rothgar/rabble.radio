# Delete Space Feature Spec

## Goal
Allow hosts to permanently delete a space from the web UI. Deletion is host-only, stops any active live state and recording, cleans up stored recording objects, and removes the space row and its cascade children.

## Constraints
- Only the host may delete a space.
- Deleting a live space must end the live state and remove the Bluesky live banner.
- Any in-progress or available recording must be stopped and its S3 object deleted.
- DB cascade handles `Recording` and `SpacePost` rows, but S3/LiveKit cleanup must run first.
- Keep existing patterns from `/api/spaces/[id]/live` (auth, error shape, host check).

## Chunks

### Chunk 1: DELETE /api/spaces/[id] endpoint
**Files changed:**
- `src/app/api/spaces/[id]/route.ts` — add `DELETE` handler.
- `src/lib/recording.ts` — add `getRecordingsForSpace(spaceId: string): Promise<RecordingRow[]>` helper.

**Goal:** Implement a host-only delete endpoint that performs safe cleanup and then removes the space row.

**Behavior:**
1. `getCurrentUser()` → 401 if null.
2. `{ id } = await context.params`. If `!id`, return 404 `{ ok: false, error: 'not_found' }`.
3. `resolveSpaceForUser(id, user.did)` → 404 if null, 403 if `!isHost`.
4. Fetch all recordings for the space via `getRecordingsForSpace(space.id)`.
5. If `space.isLive`:
   - `await setSpaceLive(space.id, false)`.
   - `await deleteLiveStatus({ session: user })` (best-effort; log warning on failure, do not fail delete).
6. For each recording where `status === 'starting'` or `'available'`:
   - If `egressId` exists, `await stopRecording(egressId)` (best-effort, log warning).
   - If `status === 'starting'`, `await failRecording(recording.egressId)`.
   - If `status === 'available'`, wrap `completeRecording(recording.egressId, { endedAt: new Date() })` in try/catch (best-effort, log warning), then delete the S3 object via `deleteObject(recording.s3Key, recording.s3Bucket)` if `s3Key`/`s3Bucket` are present.
7. For any recording with `status === 'failed'` or `'available'` and an `s3Key`, delete the S3 object.
8. `await prisma.space.delete({ where: { id: space.id } })`.
9. Return `{ ok: true }` with 200.

**Error responses (same shape as live route):**
- 400 with `{ ok: false, error: 'validation_error', message?: string }` for unexpected cases.
- 401, 403, 404 as above.
- 500 with `{ ok: false, error: 'internal_error', message: ... }` if deletion throws.

**Complexity:** complex (auth, multiple sequential cleanup steps, best-effort external calls).

**Acceptance criteria:**
- Non-authenticated request → 401.
- Non-host request → 403.
- Unknown space → 404.
- Empty `id` route param → 404.
- Host deletes an offline space with no recording → space row removed, 200.
- Host deletes a live space → live state ended, banner removed, space row removed.
- Host deletes a space with active recording → `stopRecording`, `failRecording`/`completeRecording`, `deleteObject`, then `prisma.space.delete`.
- Tests in `tests/api/space-delete.test.ts` pass.

---

### Chunk 2: Host "Delete space" UI
**Files changed:**
- `src/components/DeleteSpaceButton.tsx` — new client component with confirmation.
- `src/components/SpacePageClient.tsx` — import and render for hosts.

**Goal:** Add a destructive host action that calls the new endpoint and redirects on success.

**Behavior:**
1. Accept props `{ spaceId: string }`.
2. Render a red/destructive styled button labelled "Delete space".
3. On click, show a browser `confirm()`:
   - Message: "Delete this space permanently? This cannot be undone and any recording will be removed."
4. If confirmed:
   - `await fetch(\`/api/spaces/\${spaceId}\`, { method: 'DELETE' })`.
   - If response.ok, redirect to `/spaces` via `window.location.href = '/spaces'`.
   - If not ok, show `alert(\`Failed to delete space: \${json.error ?? 'unknown'}\`)`.
5. Disable the button while the request is in flight.

**Complexity:** simple (button + fetch + confirm).

**Acceptance criteria:**
- Button visible only when `isHost` is true on the space page.
- Clicking prompts for confirmation.
- Successful delete navigates to `/spaces`.
- Failed delete shows an alert.

---

### Chunk 3: Tests
**Files changed:**
- `tests/api/space-delete.test.ts` — new test file.

**Goal:** Cover auth, host check, cleanup, and successful deletion.

**Test cases:**
1. `DELETE /api/spaces/[id]` without session → 401.
2. Empty id route param → 404.
3. Non-host request → 403.
4. Unknown space → 404.
5. Host deletes offline space with no recordings → `prisma.space.delete` called, returns `{ ok: true }`.
6. Host deletes live space → `setSpaceLive(false)`, `deleteLiveStatus`, then `prisma.space.delete` called.
7. Host deletes space with active recording → `stopRecording`, `failRecording`/`completeRecording`, `deleteObject`, then `prisma.space.delete`.

**Mocking pattern:** follow `tests/api/live.test.ts`: hoist `mockGetCurrentUser`, `mockResolveSpaceForUser`, `mockSetSpaceLive`, `mockDeleteLiveStatus`, and add `mockGetRecordingsForSpace`, `mockFailRecording`, `mockCompleteRecording`, `mockStopRecording`, `mockDeleteObject`, and `mockPrismaSpaceDelete`.

**Complexity:** simple (table-driven tests with mocks).

**Acceptance criteria:**
- All 7 tests pass.
- 100% of new branch paths in Chunk 1 are exercised.

## Verification strategy
1. Run focused test file `tests/api/space-delete.test.ts`.
2. Run `pnpm typecheck`.
3. Build Docker image on remote host.
4. Run migration (no new migration needed — delete uses existing schema).
5. Deploy and health-check.
6. Manual browser check: create a test space, verify "Delete space" button appears for host, confirm deletion, verify redirect and that space no longer appears in list.

## Decision log
- **Use DELETE HTTP method** instead of a POST `action=delete` sub-resource for REST consistency.
- **Cascade cleanup order:** external state first (LiveKit egress, S3 objects, ATProto banner), then DB row. If external cleanup fails, log and continue so the user isn't stuck with an undeletable space.
- **Use browser `confirm()`** rather than a custom modal to keep the MVP minimal.
- **Recording statuses:** Only `starting`, `available`, `failed`, and `expired` exist in the schema. There is no `completed` status. `completeRecording` flips the row to `available`.
- **Helper signatures:** `completeRecording(egressId, options?)` and `failRecording(egressId)` both key off `egressId`, not `recording.id`.
- **New helper:** `getRecordingsForSpace` returns every recording row for a space so the route can enumerate and clean up all S3 objects.
