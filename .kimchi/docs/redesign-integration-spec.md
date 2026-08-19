# Redesign Integration Spec: Nocturne Live Room

## Goal
Implement the live-room redesign from `redesign/design_handoff_live_room/` into the existing Next.js + Tailwind CSS codebase. Replace the current ad-hoc slate/sky styling with the Nocturne dark design system, restructure the joined-room layout, and add the new emoji-reaction feature.

## Constraints
- Do **not** copy markup or JS from `Live Room.dc.html` or `support.js`; recreate the design in React + Tailwind.
- Keep all existing backend behavior (stage actions, live banner, posts, recording, etc.).
- Maintain existing test coverage; update tests where UI behavior changes.
- Do not break local development or the Docker production build.
- `@phosphor-icons/react` may be added as a dependency for the Phosphor icons.
- Reactions are **local-only** for this iteration (no broadcast over LiveKit data channel).

## Design Tokens & Styling Strategy
Add Nocturne CSS custom properties to `src/app/globals.css` under a new `:root` block. Use Tailwind arbitrary values that reference these custom properties (e.g. `bg-[var(--color-surface)]`, `text-[var(--color-text)]`, `rounded-[var(--radius-md)]`). Do not create global component classes like `.card` or `.btn`; instead each React component composes Tailwind utilities directly.

The full token set to expose:

```css
:root {
  --color-bg: #161826;
  --color-surface: #232532;
  --color-text: #e9e9ed;
  --color-accent: #9184d9;
  --color-accent-2: #a7a1db;
  --color-divider: color-mix(in srgb, #e9e9ed 16%, transparent);

  --color-section: #262a60;
  --color-section-glow: #353b80;
  --color-section-ghost: #4c5397;

  --color-neutral-100: #f3f5fe;
  --color-neutral-200: #e4e7f5;
  --color-neutral-300: #cfd3e5;
  --color-neutral-400: #b2b6ca;
  --color-neutral-500: #9397ab;
  --color-neutral-600: #75798c;
  --color-neutral-700: #595d6c;
  --color-neutral-800: #3f424d;
  --color-neutral-900: #292b31;

  --color-accent-100: #f5f4ff;
  --color-accent-200: #e7e5fe;
  --color-accent-300: #d2cefd;
  --color-accent-400: #b5abfc;
  --color-accent-500: #968ae0;
  --color-accent-600: #796cbf;
  --color-accent-700: #5d5294;
  --color-accent-800: #423a6a;
  --color-accent-900: #2b2741;

  --color-accent-2-100: #f5f4ff;
  --color-accent-2-200: #e7e5fe;
  --color-accent-2-300: #d2cefd;
  --color-accent-2-400: #b5afe8;
  --color-accent-2-500: #9690c9;
  --color-accent-2-600: #7972a9;
  --color-accent-2-700: #5c5783;
  --color-accent-2-800: #423e5d;
  --color-accent-2-900: #2b293a;

  --font-heading: "Inter", system-ui, sans-serif;
  --font-heading-weight: 500;
  --font-body: "Inter", system-ui, sans-serif;

  --space-1: 2.8px;
  --space-2: 5.6px;
  --space-3: 8.4px;
  --space-4: 11.2px;
  --space-6: 16.8px;
  --space-8: 22.4px;

  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 14px;

  --shadow-sm: 0 0 0 1px #3f424d;
  --shadow-md: 0 0 0 1px #595d6c, 0 6px 18px rgba(0,0,0,0.55);
  --shadow-lg: 0 0 0 1px #9397ab, 0 16px 40px rgba(0,0,0,0.65);
}
```

Add the Inter font import to `src/app/layout.tsx` (Google Fonts) if not already present.

Add keyframe animations to `globals.css`:
```css
@keyframes pulse-live {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
@keyframes float-up {
  0% { transform: translateY(0); opacity: 1; }
  100% { transform: translateY(-60px); opacity: 0; }
}
```

## Layout Restructure

### Joined state (`SpaceRoom` becomes the page shell)
After the user joins, replace the current `SpacePageClient` two-column layout with a full-viewport Nocturne layout rendered inside `SpaceRoom`:

```
┌─ sticky nav bar ─────────────────────────────────────────────┐
│  brand (broadcast icon + "Rabble Radio")      [you avatar]   │
└──────────────────────────────────────────────────────────────┘
┌─ main content (max-width 1180px, 2-col grid) ──────────────┐
│  ┌─ left column (minmax(0,1fr)) ──────────┐ ┌─ right sidebar ─┐
│  │ room header                              │ │ Space controls  │
│  │ stage invite toast (conditional)         │ │ Pinned posts    │
│  │ On stage (speaker grid)                  │ │ Recording (host)│
│  │ Listening (audience)                     │ │                 │
│  └──────────────────────────────────────────┘ └─────────────────┘
└──────────────────────────────────────────────────────────────┘
┌─ sticky bottom control bar ──────────────────────────────────┐
│  reactions | role-specific actions                           │
└──────────────────────────────────────────────────────────────┘
```

`SpacePageClient` stops rendering the joined-state layout; it passes space metadata (`title`, `host`, `shareableUrl`) and state (`posts`, `postsError`, `live`, `onLiveChange`) down to `SpaceRoom`, which owns the layout. The sidebar is rendered inside `SpaceRoom` via `RoomSidebar`.

The host avatar in the nav bar is the local user's avatar; if unavailable, show "YOU" initials.

### Unjoined state
Keep the current unjoined card layout but restyle it with Nocturne tokens. The page-level `main` wrapper may keep `max-w-3xl` for this state; once joined, `SpaceRoom` renders its own full-viewport shell.

## Participant Classification
Use LiveKit participant permissions to determine stage membership:
- A participant is a **speaker** if `participant.permissions.canPublish === true`.
- The local participant is a speaker when `role === 'host'` (existing `SpaceRoom` prop) or when the server has promoted them (`joined.role === 'host'` or token role `speaker`).
- Everyone else is **audience**.

This replaces the old mute-state-based classification.

## New Components

### 1. `src/components/NocturneShell.tsx` (new)
Layout shell for the joined room:
- sticky nav bar with brand and `navAvatar` slot
- centered two-column grid (`minmax(0,1fr) minmax(260px,320px)`)
- sticky bottom bar slot

Props:
```ts
interface NocturneShellProps {
  navAvatar?: ReactNode;
  header: ReactNode;
  main: ReactNode;
  sidebar: ReactNode;
  bottomBar: ReactNode;
}
```

### 2. `src/components/ReactionBar.tsx` (new)
Five emoji reaction buttons: 👍 ❤️ 😂 🎉 👏. Props:
```ts
interface ReactionBarProps {
  onReact: (emoji: string) => void;
}
```
Style: row of 36px icon buttons, separated from role actions by a vertical divider.

### 3. `src/components/FloatingReaction.tsx` (new)
Renders a short-lived fixed-position emoji that floats up and fades out. Props:
```ts
interface FloatingReactionProps {
  id: string;
  emoji: string;
  x: number;
  y: number;
  onDone: (id: string) => void;
}
```
Animation: 1.6s ease-out, `transform: translateY(-60px)`, `opacity: 0`.

### 4. `src/components/RoomHeader.tsx` (new)
The redesigned room header:
- LIVE tag with pulsing dot + optional category tag (category tag omitted for this iteration since there is no category data model)
- H1 title (42px/500)
- host avatar (26px) + "Hosted by @handle" + "· N listening"
- Share / Copy link button row

Props:
```ts
interface RoomHeaderProps {
  title: string;
  host: { handle: string; displayName?: string | null; avatarUrl?: string | null };
  listenerCount: number;
  shareableUrl: string;
}
```

### 5. `src/components/SpeakerCard.tsx` (new)
Redesigned participant card for the stage grid:
- 56px avatar circle, accent-700 bg for fallback initials
- speaking ring: `box-shadow: 0 0 0 2px var(--color-accent)`
- idle ring: `box-shadow: 0 0 0 1px var(--color-neutral-800)`
- muted badge: 20px filled circle with microphone-slash icon
- name (14px/500) + optional "Host" tag inline
- handle below in accent-300, 12px
- whole block is a link to `https://bsky.app/profile/{handle}` when handle is known
- for host cards on non-host speakers: a "⋯" menu button top-right that expands an inline row of Mute/Unmute, Remove from stage, Block

Props:
```ts
interface SpeakerCardProps {
  identity: string;
  name: string;
  handle?: string;
  avatarUrl?: string | null;
  isHostCard?: boolean;
  isHost?: boolean;
  isLocal?: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  onMuteToggle?: () => void;
  onRemoveFromStage?: () => void;
  onBlock?: () => void;
  avatarRef?: RefObject<HTMLDivElement | null>;
}
```

### 6. `src/components/AudienceBubbles.tsx` (new)
Listener-view audience cluster: 52px circular avatar bubbles, wrapping, including a "YOU" bubble for the local user. Each bubble links to the Bluesky profile. Props:
```ts
interface AudienceBubblesProps {
  audience: Array<{ identity: string; name: string; handle?: string; avatarUrl?: string | null }>;
  localIdentity: string;
  localName: string;
  localHandle?: string;
  localAvatarUrl?: string | null;
  localAvatarRef?: RefObject<HTMLDivElement | null>;
}
```

### 7. `src/components/AudienceRows.tsx` (new)
Host-view audience grid: 2-column rows with 36px avatar, name, handle, and an "Invite" button (or "Invited" tag). Props:
```ts
interface AudienceRowsProps {
  audience: Array<{ identity: string; name: string; handle?: string; avatarUrl?: string | null }>;
  invitedSet: Set<string>;
  onInvite: (identity: string) => void;
}
```

### 8. `src/components/RoomSidebar.tsx` (new)
Sidebar for the joined view:
- Host only: Space controls card (live status dot + label, Pause/Resume broadcast button, End space button)
- Host only: Recording download card (uses `RecordingDownload`)
- Pinned from Bluesky card with compose row (host only, uses `AddPostForm`) + post list (uses redesigned `PostCarousel`)

Props:
```ts
interface RoomSidebarProps {
  spaceId: string;
  isHost: boolean;
  isLive: boolean;
  onLiveChange: (next: boolean) => void;
  posts: PublicSpacePost[];
  postsError: string | null;
  onPostAdded: () => void;
  recording: PublicRecording | null;
}
```

### 9. `src/components/BottomControlBar.tsx` (new)
Sticky bottom bar:
- ReactionBar on the left
- Role-specific actions on the right:
  - Listener (audience): "Raise hand to speak" (toggles handRaised label/state, min-width 190px) + "Leave" (secondary)
  - Promoted speaker: mic toggle (primary) + "Step down" (secondary) + "Leave" (secondary)
  - Host: mic toggle (primary) + "Leave" (secondary)

Props:
```ts
interface BottomControlBarProps {
  role: 'host' | 'speaker' | 'audience';
  micOn: boolean;
  onMicToggle: () => void;
  onLeave: () => void;
  onStepDown?: () => void;
  onReact: (emoji: string) => void;
}
```

### 10. `src/components/StageInviteToast.tsx` (new or rework existing)
Redesigned invite toast: accent-bordered card, hand-wave icon, host name, Decline/Accept buttons. Replace the existing `StageRequestToast` usage with this styled version.

Props reuse existing `StageRequestToastProps`:
```ts
interface StageInviteToastProps {
  hostName?: string;
  onAccept: () => void;
  onDecline: () => void;
  busy?: boolean;
}
```

## Component Rewrites

### `src/components/SpaceRoom.tsx`
- Change from a card wrapper to the full Nocturne layout shell.
- Accept new props: `title`, `host`, `shareableUrl`, `posts`, `postsError`, `onPostAdded`, `isLive`, `onLiveChange`, `spaceId`, `recording`.
- Inside `LiveKitRoom`, render `NocturneShell` with `RoomHeader`, optional `StageInviteToast`, speaker grid, audience section, `RoomSidebar`, `BottomControlBar`.
- Remove the old "You are the host" header and old `RoomGrid` mapping directly to `AudioParticipant`.
- Keep `useResolvedProfiles` but feed `SpeakerCard`, `AudienceBubbles`, and `AudienceRows`.
- Track `handRaised` local state for the raise-hand button.
- Track `floatingReactions` state. Register a ref to the local user's avatar node (speaker card if on stage, otherwise the "YOU" audience bubble). On reaction, read `getBoundingClientRect()` and spawn a `FloatingReaction`.
- Keep `HostAutoUnmute` behavior.
- Render page-level errors in an alert below `RoomHeader`.

### `src/components/AudioParticipant.tsx`
- Delete this file and its tests; functionality is replaced by `SpeakerCard` and `AudienceBubbles`.

### `src/components/StageManager.tsx`
- Delete this file and its tests; replaced by the speaker grid in `SpaceRoom`.

### `src/components/AudienceList.tsx`
- Delete this file and its tests; replaced by `AudienceBubbles` and `AudienceRows`.

### `src/components/StageControls.tsx`
- Keep as the bridge for `useSpaceState` and token refresh.
- Change rendered output: render nothing visible, but expose callbacks to the parent.
- New prop interface:
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
- `SpaceRoom` renders `StageControls` inside `LiveKitRoom` so it can use `useSpaceState`, but it produces no DOM.

### `src/components/LocalAudioControls.tsx`
- Deprecated by `BottomControlBar`. Delete this file and its tests.

### `src/components/HostActionMenu.tsx`
- Inline its actions into `SpeakerCard`. Delete this file and its tests.

### `src/components/LiveBannerButton.tsx`
- Keep functionality but restyle as the "Pause/Resume broadcast" full-width button inside `RoomSidebar` > Space controls card.
- Add a live-status dot + label above it.
- The button label should read "Pause broadcast" when live, "Resume broadcast" when not live.

### `src/components/DeleteSpaceButton.tsx`
- Keep functionality but restyle as the "End space" full-width button inside `RoomSidebar` > Space controls card.
- Keep the existing browser `window.confirm` confirm dialog for this iteration.

### `src/components/AddPostForm.tsx`
- Restyle to the sidebar compose row: text input + "Share to room" button.
- Place inside the Pinned from Bluesky card.

### `src/components/PostCarousel.tsx`
- Restyle shared-post rows to the new design: 30px avatar + author/handle/time line + post text below.
- Replace the carousel/stack visual treatment with a vertical list inside the sidebar.

### `src/app/space/[id]/page.tsx`
- Pass space metadata (`title`, `host`, `shareableUrl`) down to `SpacePageClient`.
- Keep rendering `RecordingDownload` below `SpacePageClient` for now, but also pass the recording to `SpacePageClient` so it can forward it to `SpaceRoom`'s sidebar. The page-level `RecordingDownload` can be removed once `SpaceRoom` renders it internally.

### `src/components/SpacePageClient.tsx`
- Accept new props from the page: `title`, `host`, `shareableUrl`, `recording`.
- Forward these plus `posts`, `postsError`, `refreshPosts`, `live` state to `SpaceRoom`.
- In the joined state, render `SpaceRoom` only.
- In the unjoined state, render the redesigned join card (keep current layout, swap colors/type).

### `src/components/ShareButtons.tsx`
- Restyle the "Share" and "Copy link" buttons to match the design. Keep the existing Bluesky intent behavior.

### `src/components/RecordingDownload.tsx`
- Accept an optional `compact?: boolean` prop. When compact, render as a small card suitable for the sidebar instead of the full card.
- Default behavior remains unchanged.

## Data Flow Changes
1. `SpacePage` fetches space metadata and passes it to `SpacePageClient`.
2. `SpacePageClient` fetches posts and join token.
3. After join, `SpacePageClient` passes metadata and state to `SpaceRoom`.
4. `SpaceRoom` owns the joined layout, participant rendering, bottom bar, and reactions.
5. `StageControls` remains inside `LiveKitRoom` but renders no DOM. It notifies `SpaceRoom` of pending invites via `onInvitePending` and resolution via `onInviteResolved`. It still handles token refresh via `onTokenRefresh`.
6. Host actions (mute/remove/block/invite) are passed from `SpacePageClient` to `SpaceRoom` and then to `SpeakerCard` / `AudienceRows`.

## Dependencies
Add `@phosphor-icons/react`:
```bash
pnpm add @phosphor-icons/react
```

Icon mapping:
- `Broadcast` for brand mark
- `Microphone`, `MicrophoneSlash` for mute states
- `HandWaving` for invite toast
- `DotsThreeVertical` for speaker menu
- `ShareNetwork`, `LinkSimple` for share/copy
- `Plus`, `UserMinus`, `Prohibit` for menu actions
- `StopCircle` for end space
- `ChatCircleText`, `PushPin` for posts card
- `Hand` for raise hand
- `SignOut` for leave

## Acceptance Criteria
- [ ] `pnpm install` succeeds with the new dependency.
- [ ] `pnpm typecheck` produces no new errors.
- [ ] Existing tests pass or are updated/removed if they cover deleted components.
- [ ] `pnpm build` succeeds.
- [ ] `make build` succeeds.
- [ ] `make sync && make remote-build && make remote-deploy` succeeds.
- [ ] `https://rabble.exe.xyz/api/health` returns 200 after deploy.
- [ ] Joined room renders the Nocturne layout with nav bar, two-column content, sticky bottom bar.
- [ ] Speaker cards show avatar, name, handle, host tag, muted badge, and speaking ring.
- [ ] Host can open the "⋯" menu on non-host speakers and run Mute/Unmute, Remove from stage, Block.
- [ ] Listener view audience renders as wrapping circular bubbles including "YOU".
- [ ] Host view audience renders as 2-column rows with Invite/Invited state.
- [ ] Reaction buttons spawn a floating emoji from the local user's avatar.
- [ ] Sidebar shows Space controls for hosts (live status, Pause/Resume, End space), Recording download, and Pinned posts.
- [ ] Bottom bar shows correct role-specific controls.

## Chunking
1. **Tokens + deps + layout shell** (simple): add Nocturne tokens to globals.css, add `@phosphor-icons/react`, create `NocturneShell`.
2. **New presentational components** (simple): `RoomHeader`, `SpeakerCard`, `AudienceBubbles`, `AudienceRows`, `ReactionBar`, `FloatingReaction`, `BottomControlBar`, `RoomSidebar`, `StageInviteToast`.
3. **Rewrite SpaceRoom + wiring** (complex): restructure layout, integrate new components, handle refs for reactions, wire `StageControls` callbacks, keep LiveKit connection.
4. **Update surrounding pages/components** (simple): `SpacePage`, `SpacePageClient`, `ShareButtons`, `AddPostForm`, `PostCarousel`, `LiveBannerButton`, `DeleteSpaceButton`, `RecordingDownload`.
5. **Cleanup + tests + deploy** (simple): delete `StageManager`, `AudienceList`, `HostActionMenu`, `AudioParticipant`, `LocalAudioControls`; update tests; run build and deploy.
