# Space page fixes spec

## Goal
Fix the space detail page UI/layout issues and host stage behavior reported after deploying to `rabble.exe.xyz`.

## Chunks

### Chunk 1: Space detail page layout and share UI
**Files changed:**
- `src/app/spaces/[id]/page.tsx`
- `src/components/LiveBannerButton.tsx`
- `src/components/SpacePageClient.tsx`

**Goal:** Fix visual alignment and add a share action.

**Detailed changes:**
1. In `src/app/spaces/[id]/page.tsx`:
   - Keep the shareable URL block, but add a row of action buttons under the URL.
   - Add a "Copy" button that copies `view.shareableUrl` to the clipboard.
   - Add a "Post to Bluesky" button that opens `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}` where `text` is `"Join my space on Rabble: ${view.title}\n${view.shareableUrl}"`.
   - Wrap the URL + buttons in a flex layout so the buttons stay inside the bordered box and don't overflow.
2. In `src/components/LiveBannerButton.tsx`:
   - Prevent the "Go Live" / "End Live" button from being squished on narrow screens. Use `shrink-0` and `whitespace-nowrap` on the button, and allow the text description block to wrap.
3. In `src/components/SpacePageClient.tsx`:
   - Reduce the size/prominence of the join prompt box. Remove `md:col-span-2` so it shares the two-column layout, and reduce padding from `p-6` to `p-4`.

**Acceptance criteria:**
- Share buttons are inside the shareable URL box.
- "Go Live" button text never wraps and is not compressed.
- Join prompt box is smaller and visually balanced with the sidebar.

### Chunk 2: Host is always on stage and unmuted
**Files changed:**
- `src/components/SpacePageClient.tsx`
- `src/components/SpaceRoom.tsx`
- `src/components/StageControls.tsx`
- `src/components/StageManager.tsx`

**Goal:** When the host joins their own space, they should appear as a speaker immediately, be unmuted, and never see "No speakers on stage yet."

**Detailed changes:**
1. In `src/components/SpacePageClient.tsx`:
   - When `isHost` is true and the join response returns `role === 'host'`, pass `role='host'` to `SpaceRoom` and `StageControls`.
   - The `stageRole` derived for `StageControls` should be `'host'` when the user is the host, not `'audience'`.
2. In `src/components/SpaceRoom.tsx`:
   - When `role === 'host'`, the local participant should publish audio and start unmuted.
   - Use the `useLocalParticipant` hook (or `room.localParticipant`) to call `setMicrophoneEnabled(true)` once after connecting when the user is the host.
   - Keep the existing `audio={role === 'host'}` prop on `LiveKitRoom`.
3. In `src/components/StageControls.tsx`:
   - For `role === 'host'`, the local host should appear in the speakers list passed to `StageManager`.
   - Filter out the local identity only for the audience list, not the speakers list.
4. In `src/components/StageManager.tsx`:
   - When the only participant is the host (i.e. `speakers.length === 1 && speakers[0].identity === currentHostIdentity`), show the stage list with the host instead of the empty state.
   - The empty state should only be shown when there are truly no speakers.
   - Add an optional `hostIdentity` prop so the component can tell when the host is present.

**Acceptance criteria:**
- Host joining a space sees themselves in the speakers list.
- Host's mic is enabled by default.
- "No speakers on stage yet" is not shown for the host.

### Chunk 3: Build, test, and deploy
**Files changed:**
- None (verification step)

**Goal:** Build the image, push/deploy to `rabble.exe.xyz`, and verify.

**Detailed changes:**
1. Run `pnpm typecheck` and `pnpm test` locally.
2. Build the Docker image on `rabble.exe.xyz`.
3. Run `docker compose up -d`.
4. Verify `/api/health` returns ok.
5. Verify the space page renders the share buttons correctly.

**Acceptance criteria:**
- Build succeeds.
- Tests pass.
- App deploys and is healthy.

## Notes
- Use `navigator.clipboard.writeText` for copy. No fallback needed for MVP.
- Use Bluesky intent URL for the "Post to Bluesky" button; do not add a server-side post creation endpoint.
- Keep changes minimal; do not refactor unrelated components.
