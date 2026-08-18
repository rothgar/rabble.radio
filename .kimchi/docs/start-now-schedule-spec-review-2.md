# Review: Start Now / Schedule for Later Spec (Revised)

**Verdict: APPROVED**

## Assessment against previous review issues

All 10 issues from the previous review are substantively resolved:

1. **Start-now token ordering** — Fixed. The spec now creates the space as `active`, generates the host token first, and only then transitions to `live`. Token-generation failure leaves the space `active` and returns `500`.
2. **Non-existent LiveKit helpers** — Fixed. Chunk 3 explicitly defines `createHostToken` using existing `createRoom`, `roomNameForSpace`, and `generateToken` helpers.
3. **ATProto best-effort inconsistency** — Fixed. The spec now treats `publishLiveStatus` as a hard requirement: failure rolls back `setSpaceLive(false)` and returns `502`, matching the existing `/api/spaces/[id]/live/route.ts` behavior.
4. **Missing API imports** — Fixed. Chunk 2 lists the required imports for `spaces`, `atproto`, `recording`, and `livekit` modules.
5. **Incomplete validation** — Fixed. The spec now covers `startNow` + `scheduledAt` conflict, type checks, future-date check, 30-day max, and 15-minute UTC boundary enforcement.
6. **Underspecified default schedule** — Fixed. Chunk 1 provides a concrete local-time algorithm for the next 15-minute slot clamped to 30 days.
7. **sessionStorage handoff handling** — Fixed. Chunk 5 requires validating required fields, removing the item after reading, and falling back to the join button on invalid/missing tokens.
8. **Missing test coverage** — Fixed. Chunk 6 enumerates tests for `CreateSpaceForm`, `SpacePageClient`, the API route, and the LiveKit helper.
9. **Scheduled response shape** — Fixed. Schedule mode now returns only `{ space }`; the client redirects to `/spaces` based on its own mode state.
10. **Form UX mismatch** — Resolved in substance. The revised spec fully describes the split button, dropdown, `mode` state, default schedule, token handoff, and navigation. The chunk remains labeled "simple" despite being a near-complete rewrite, which is noted below.

## Additional evaluation

- **Chunking**: Mostly small and buildable. The API work is sensibly split into validation (Chunk 2), helper extraction (Chunk 3), and orchestration (Chunk 4). Chunk 1 (`CreateSpaceForm`) is still a large rewrite; while the steps are now detailed enough to implement, it could optionally be split into UI and submit-logic sub-chunks as the previous review suggested.
- **API safety/ordering**: Correct. Token minting precedes the live transition, and all post-token side effects are wrapped with rollback on failure.
- **Client/server handoff**: Well-defined. The `rabble_join_{space.id}` `sessionStorage` contract, validation, cleanup, and immediate `SpaceRoom` mount are clear.
- **Test coverage**: Adequate for the spec. The plan calls for the missing component and API tests. One minor addition would be a test verifying the scheduled-mode redirect to `/spaces`, but this is implied by the form tests.

## Notes

- The form default algorithm uses local time for the picker while the server validates UTC 15-minute boundaries. This is sound because modern timezone offsets are all multiples of 15 minutes, so local 15-minute boundaries map cleanly to UTC 15-minute boundaries.
- Consider splitting Chunk 1 into two sub-chunks if the Builder assigned to it has limited frontend scope experience; the spec itself is clear enough to proceed as-is.
