# Redesign Integration Spec Review

## Verdict: NEEDS_REVISION

The spec captures the broad redesign intent and most of the new components, but it has several concrete gaps and ambiguities that will block implementation or cause mismatches with the handoff. These should be resolved before work starts.

## Gaps and Issues

### 1. `category` tag has no backing data model
- **Spec section:** `src/components/SpacePageClient.tsx` / `RoomHeader` props / Layout Restructure.
- **Problem:** The spec requires `SpacePageClient` to accept and forward a `category` prop, and `RoomHeader` to render a category tag. The current `PublicSpace` type (`src/types/index.ts`) has no `category` field, and `CreateSpaceForm.tsx` does not collect one. The handoff README says copy is placeholder, but it does not say the category itself is placeholder.
- **Suggested fix:** Either (a) add `category` to the space model, API, and create form; (b) remove the category tag from `RoomHeader` for this iteration; or (c) explicitly state that it should be hard-coded/derived and from where. Do not leave an unresolvable prop in the spec.

### 2. `listenerCount` source is ambiguous
- **Spec section:** `SpaceRoom` props / `RoomHeader` props.
- **Problem:** The spec lists `listenerCount` as metadata passed from `SpacePageClient` to `SpaceRoom`. But listener count is dynamic: before joining the page does not know it, and after joining it must reflect LiveKit participants. The handoff shows `{{ listenerCount }}` driven by `audience.length`. Passing a static prop from the page will give a stale or zero value.
- **Suggested fix:** Remove `listenerCount` from the `SpaceRoom` metadata props; derive it inside `SpaceRoom` from `useParticipants()` / audience size and pass it to `RoomHeader` so the "N listening" label stays live.

### 3. `RecordingDownload` component is not accounted for
- **Spec section:** surrounding component rewrites / `SpacePageClient`.
- **Problem:** `src/app/space/[id]/page.tsx` currently renders `<RecordingDownload spaceId={view.id} initial={state.recording} />` below `SpacePageClient`. The new full-viewport `SpaceRoom` layout will obscure or visually conflict with it. The handoff does not show a recording download element.
- **Suggested fix:** State where `RecordingDownload` should live in the new design — e.g. inside `RoomSidebar` for hosts, hidden until the space ends, or redesigned as a small link inside the Space controls card.

### 4. End-space confirm dialog inconsistency
- **Spec section:** `src/components/DeleteSpaceButton.tsx` rewrite.
- **Problem:** The spec says "It must open the existing confirm dialog before calling DELETE /api/spaces/[id]". The existing implementation uses `window.confirm`, but the HTML prototype shows a styled Nocturne dialog (`.dialog-backdrop` / `.dialog`). The requirement is therefore contradictory: "existing confirm dialog" does not exist as a styled component.
- **Suggested fix:** Decide whether to keep the browser `confirm` for this iteration or create a new `ConfirmDialog` presentational component matching the prototype. If keeping `window.confirm`, remove the styled-dialog implication.

### 5. Nocturne token list is incomplete
- **Spec section:** Design Tokens.
- **Problem:** The spec lists a subset of `nocturne/styles.css` tokens. Missing tokens that appear in the source sheet and may be needed for faithful recreation include:
  - `--color-section`, `--color-section-glow`, `--color-section-ghost`
  - Full `--color-accent-2-*` ramp (only `--color-accent-2` is listed)
  - `--font-heading-weight`
- **Suggested fix:** Either explicitly exclude these with a rationale or add them to the `globals.css` token block so the implementation does not invent ad-hoc values.

### 6. Component-system primitives (.btn, .card, .tag, .dialog) are not specified
- **Spec section:** New Components / Component Rewrites.
- **Problem:** The handoff references Nocturne classes such as `.btn`, `.card`, `.tag`, `.dialog`, `.field`, `.input`. The spec correctly says not to copy the CSS, but it does not say how to recreate them — whether each new component should inline Tailwind utilities, whether to create small presentational helpers (e.g. `NocturneButton`, `NocturneCard`), or whether to map the tokens into Tailwind `theme.extend`. Without this, developers will produce inconsistent styling.
- **Suggested fix:** Add a brief styling strategy section: e.g. "use Tailwind arbitrary values referencing CSS custom properties directly (e.g. `bg-[var(--color-surface)]`) and prefer explicit component props over global CSS classes."

### 7. Speaker vs audience classification is unspecified
- **Spec section:** `SpaceRoom` rewrite / new speaker grid.
- **Problem:** The new layout needs to know which participants are on stage vs in the audience. The current `SpaceRoom.tsx` uses `resolveParticipantMode(participantIdentity, isLocal, !isMuted)`, which conflates mute state with publish permission. The README says "Speakers are participants who publish their microphone (publish perms enabled)".
- **Suggested fix:** Specify how to determine stage membership — e.g. use LiveKit `Participant.permissions.canPublish` and treat the local participant as a speaker when `role === 'host'` or when promoted.

### 8. `StageControls` callback contract is underspecified
- **Spec section:** Data Flow Changes.
- **Problem:** The spec recommends `onInvitePending` / `onInviteResolved` callbacks so `SpaceRoom` can render the toast. It does not state the exact signature, whether `StageControls` still owns `useSpaceState`, or how the host's `handleInvite` / `handleRemove` actions get wired to the new `SpeakerCard` and `AudienceRows`.
- **Suggested fix:** Provide an explicit `StageControls` prop interface for the new contract, e.g.:
  ```ts
  interface StageControlsProps {
    spaceId: string;
    identity: string;
    displayName?: string;
    role: StageRole;
    onTokenRefresh: (next: { token: string; wsUrl: string; role: StageRole; roomName: string; identity: string }) => void;
    onInvitePending: (hostName?: string) => void;
    onInviteResolved: () => void;
  }
  ```
  Also clarify that `SpaceRoom` will pass `hostActions` (mute/remove/block/invite) directly to the new child components, while `StageControls` only handles token refresh and invite state.

### 9. `SpacePageClient` error state and existing `error` prop collision
- **Spec section:** `SpacePageClient` rewrite.
- **Problem:** The current `SpacePageClient` uses an internal `error` state for join failures, and host action failures also call `setError`. The spec does not say where these errors should appear in the new layout (the old layout rendered them inline above the join button / inside the sidebar).
- **Suggested fix:** Specify an error placement — e.g. a dismissible alert below `RoomHeader` or inside `NocturneShell`'s main column.

### 10. Unjoined state redesign lacks detail
- **Spec section:** Layout Restructure / `SpacePageClient` rewrite.
- **Problem:** The spec says "Keep the existing unjoined card in `SpacePageClient` but restyle it with Nocturne tokens." It does not describe what the redesigned join card should look like. The handoff README focuses on the joined state and does not detail the unjoined card either, so this leaves the implementer guessing.
- **Suggested fix:** Either add a wireframe/description for the unjoined card or explicitly allow the implementer to keep the current card layout and only swap colors/type tokens.

## Watch-outs and Risks (non-blocking)

- **Full-viewport layout vs. existing page shell:** `src/app/space/[id]/page.tsx` currently wraps everything in `max-w-3xl` with slate colors. The new Nocturne layout is full-viewport dark. The spec should note that the page-level wrapper and `layout.tsx` body classes need to change so the joined room can fill the viewport without clashing with the unjoined/error states.
- **Animation scope:** The `float-up` and `pulse-live` keyframes are specified, but the spec should confirm whether the `float-up` animation runs on a containing `span` with `transform: translateY(-60px)` and `opacity: 0`, matching the prototype.
- **Reaction broadcast:** The spec notes that reactions are local-only for now. This is acceptable but should be explicitly accepted as a product limitation before deploy.
- **Test churn:** Deleting `StageManager`, `AudienceList`, and possibly `AudioParticipant` will break existing tests (`tests/components/space-page-client.test.tsx`, `tests/components/audio-participant.test.tsx`). The acceptance criteria already mention updating tests; consider budgeting extra time for this chunk.
- **Accessibility of speaker action menu:** The spec says "One menu open at a time" but does not specify focus trapping or `Escape` behavior. This can be deferred, but it is a minor a11y watch-out.
