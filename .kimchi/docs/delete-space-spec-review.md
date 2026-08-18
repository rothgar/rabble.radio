# Delete Space Feature Spec Review

**Spec file:** `/home/jgarr/src/343/.kimchi/docs/delete-space-spec.md`

## Verdict

NEEDS_REVISION

The cleanup order and auth flow are sound, but the spec contains concrete helper call signatures that do not match the existing codebase. A Builder following the spec literally would produce code that fails typecheck and misses orphaned S3 objects. The issues below must be resolved before implementation.

## Issues

1. **`failRecording` call signature is wrong.**
   - **Spec reference:** `/home/jgarr/src/343/.kimchi/docs/delete-space-spec.md`, line 31.
   - **Problem:** The spec calls `failRecording(recording.id, 'Space deleted')`, but the existing helper is `failRecording(egressId: string)` and accepts no reason argument (see `/home/jgarr/src/343/src/lib/recording.ts`, line 270).
   - **Suggested fix:** Change the spec to `failRecording(recording.egressId)`. If a reason string is required for observability, first extend `failRecording` to accept an optional `reason?: string` parameter, then call `failRecording(recording.egressId, 'Space deleted')`.

2. **`completeRecording` call signature is wrong.**
   - **Spec reference:** `/home/jgarr/src/343/.kimchi/docs/delete-space-spec.md`, line 32.
   - **Problem:** The spec calls `completeRecording(recording.id, recording.egressId ?? '')`, but the existing helper is `completeRecording(egressId: string, options?: { endedAt?: Date; sizeBytes?: number | null })` (see `/home/jgarr/src/343/src/lib/recording.ts`, line 195). Passing `recording.id` as the first argument will fail to find the row because the helper queries by `egressId`.
   - **Suggested fix:** Change the spec to `completeRecording(recording.egressId)` or `completeRecording(recording.egressId, { endedAt: new Date() })`.

3. **Recording status `'completed'` does not exist.**
   - **Spec reference:** `/home/jgarr/src/343/.kimchi/docs/delete-space-spec.md`, line 33.
   - **Problem:** The `Recording.status` enum in the schema is `"starting" | "available" | "failed" | "expired"` (see `/home/jgarr/src/343/prisma/schema.prisma`, line 67). There is no `"completed"` status. The spec also omits cleanup for `"failed"` recordings, which may still have an S3 object.
   - **Suggested fix:** Remove `"completed"` from the spec. Add cleanup for any recording with `status === 'failed'` and a present `s3Key`, or explicitly document that failed recordings are intentionally left for the existing expiration sweep.

4. **No helper exists to fetch all recordings for a space.**
   - **Spec reference:** `/home/jgarr/src/343/.kimchi/docs/delete-space-spec.md`, lines 25, 29-33.
   - **Problem:** The spec says to "fetch the space row including `recordings` relation," but `SpaceModel` and `getSpaceById` in `/home/jgarr/src/343/src/lib/spaces.ts` do not expose recordings. `findActiveRecordingForSpace` only returns the single most recent active recording (see `/home/jgarr/src/343/src/lib/recording.ts`, line 158), so the route cannot enumerate every recording whose S3 object must be deleted.
   - **Suggested fix:** Add either `getRecordingsForSpace(spaceId: string)` in `/home/jgarr/src/343/src/lib/recording.ts` or `getSpaceWithRecordings(id: string)` in `/home/jgarr/src/343/src/lib/spaces.ts`, and update the route to iterate over that list.

5. **Test mock list is incomplete.**
   - **Spec reference:** `/home/jgarr/src/343/.kimchi/docs/delete-space-spec.md`, line 96.
   - **Problem:** The mocking pattern lists `mockStopRecording` and `mockDeleteObject` but omits `mockCompleteRecording` and `mockFailRecording`, even though test case 6 explicitly asserts `completeRecording`/`failRecording` are called.
   - **Suggested fix:** Add `mockCompleteRecording` and `mockFailRecording` to the hoisted mocks. If issue #4 is resolved with a new "list all recordings" helper, add its mock as well.

6. **`completeRecording` is not safely best-effort.**
   - **Spec reference:** `/home/jgarr/src/343/.kimchi/docs/delete-space-spec.md`, line 32.
   - **Problem:** `completeRecording` calls S3 `getObjectSize` and `getSignedDownloadUrl`, which throw if storage is misconfigured or the object is absent. The spec labels the cleanup "best-effort" but does not wrap `completeRecording` in a try/catch, so a single missing recording could abort the entire delete operation.
   - **Suggested fix:** Wrap the `completeRecording` call in a `try/catch` that logs a warning and continues. If `completeRecording` throws, still attempt `deleteObject(recording.s3Key, recording.s3Bucket)` before moving on.

7. **400 error code deviates from the existing live route pattern.**
   - **Spec reference:** `/home/jgarr/src/343/.kimchi/docs/delete-space-spec.md`, line 38.
   - **Problem:** The constraint says to "keep existing patterns from `/api/spaces/[id]/live` (auth, error shape, host check)." The live route returns `error: 'validation_error'` for invalid actions and `error: 'invalid_json'` for malformed bodies (see `/home/jgarr/src/343/src/app/api/spaces/[id]/live/route.ts`, lines 52 and 67). The spec instead proposes `error: 'invalid_request'` for unexpected 400s.
   - **Suggested fix:** Align the 400 error code with the live route (`'validation_error'`) or explicitly note the intentional deviation in the decision log.

8. **Missing handling for an empty `id` route parameter.**
   - **Spec reference:** `/home/jgarr/src/343/.kimchi/docs/delete-space-spec.md`, Chunk 1 behavior.
   - **Problem:** The spec does not define behavior when `context.params.id` is missing or empty. The existing `GET /api/spaces/[id]` handler returns 404 in that case (see `/home/jgarr/src/343/src/app/api/spaces/[id]/route.ts`, line 24). A Builder may invent a different response.
   - **Suggested fix:** Add an explicit step: if `!id`, return 404 `{ ok: false, error: 'not_found' }`.

## Verification run

- `pnpm typecheck`: fails with pre-existing errors unrelated to this spec (`src/lib/oauth-session-store.ts`, `tests/lib/oauth-session-store.test.ts`, `tests/lib/auth.test.ts`).
- `pnpm lint`: fails with one pre-existing error in `next.config.js` and several warnings unrelated to this spec.
- `pnpm test`: 155 tests pass, 29 fail due to pre-existing issues (`@prisma/client` not initialized, `page.test.tsx` assertions, OAuth callback undefined session). No `space-delete` tests exist yet because the feature is not implemented.

None of the failures are caused by the delete-space spec, but the spec cannot be approved until the signature and enumeration gaps above are fixed.
