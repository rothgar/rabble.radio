# Handoff: Live Room redesign (listener view + host controls)

## Overview
Redesign of the Rabble Radio live-room experience — the screen a listener lands on when they open a Space, and the same screen with host/speaker-management controls — using the **Nocturne** dark design system. It consolidates the visual language currently spread across `SpaceRoom.tsx`, `SpacePageClient.tsx`, `StageControls.tsx`, `StageManager.tsx`, `AudienceList.tsx`, `AudioParticipant.tsx`, `HostActionMenu.tsx` and `LocalAudioControls.tsx`, and adds one new feature: preset emoji reactions.

## About the design files
`Live Room.dc.html` is a **design reference/prototype**, not production code — it's built on this design tool's own templating runtime (`support.js`), not React/Next.js. Do not copy its markup or JS into the app. The task is to **recreate this design in the existing Next.js + Tailwind CSS codebase**, replacing the current ad hoc Tailwind slate/sky utility classes in the components listed above with the Nocturne token values below, and wiring the new reaction feature into the existing LiveKit room/stage logic.

To view the prototype: open `Live Room.dc.html` via a local static server (not `file://`, since it loads a script module) — e.g. `npx serve design_handoff_live_room`. There is no in-page role switch — the nav only ever shows the brand and the local user's avatar, since a real user is always either a host or a listener in a given space, never both. To preview the other state in this design tool, a `viewMode` control lives outside the page (in the tool's own tweaks panel); it has no equivalent in production and isn't part of the design.

## Fidelity
**High-fidelity.** Colors, type, spacing and radii below are exact and come straight from the Nocturne token sheet (`nocturne/styles.css`, included in this bundle). Copy is placeholder ("Banned Books We Love", sample names/handles) — swap for real data, keep the layout and styling.

## Screens / Views
Both views are the same room screen; the host view is what a host additionally sees/can do.

### 1. Live Room — Listener view
Maps to: `SpacePageClient` (joined, `isHost=false`) → `SpaceRoom` → `AudienceList`/`StageControls` (audience branch).

**Layout**: Sticky nav bar → centered content column (max-width 1180px) as a 2-column CSS grid (`minmax(0,1fr) minmax(260px,320px)`) → a full-width sticky control bar pinned to the viewport bottom.
- **Nav bar** (`padding: 8.4px 11.2px`, bottom border 1px `--color-divider`): brand mark (Phosphor `broadcast` icon + "Rabble Radio", 18px/500) on the left, a 36px circular "you" avatar pinned to the far right. Nothing in the nav indicates role — a user is always either a host or a listener, never shown a choice.
- **Room header** (main column, top): a `LIVE` tag (accent-tinted pill, 6px pulsing dot, 1.6s ease-in-out opacity animation 1↔0.35) next to a neutral category tag ("Books & Reading"); H1 room title (42px/500); host line — 26px avatar + "Hosted by @handle" (14px, muted) + "· N listening" (13px, muted); a Share / Copy link button row below.
- **Stage-invite toast** (conditional, only when the host has invited this listener to speak): an accent-bordered card, hand-wave icon, "{Host name} invited you to speak" (14px/500) + helper line (12px, muted), Decline (secondary) / Accept (primary) buttons on the right.
- **"On stage" section**: `h6` label (11px, uppercase, 60% opacity) + a responsive grid of speaker cards (`repeat(auto-fill, minmax(230px,1fr))`, 8.4px gap). See Components below for the card.
- **"Listening · N" section**: `h6` label, then a wrapping row of 52px circular avatar bubbles (12px gap) for every listener — **do not truncate this into a "+N more" summary**. Bubbles wrap onto additional rows as the room grows. This matters beyond density: any future per-listener indicator (e.g. showing who's reacting) needs every listener actually present in the DOM, not summarized away.
- **Sidebar**: a single card, "Pinned from Bluesky" kicker (icon + text), then a list of shared-post rows (see Components).
- **Bottom control bar**: sticky, blurred translucent background (`color-mix(in srgb, var(--color-bg) 90%, transparent)`, `backdrop-filter: blur(8px)`), top border, centered row: 5 emoji-reaction icon buttons + divider, then role-specific action buttons — "Raise hand to speak" (primary) + "Leave" (secondary) when only listening; once promoted, mic toggle (primary) + "Step down" (secondary) + "Leave" (secondary).

### 2. Live Room — Host view
Same shell as above with `isHost=true`. Differences:
- Nav/header identical to the listener view.
- **"On stage" section**: same speaker-card grid, but non-host speaker cards get a "⋯" icon button (top right of the card) that expands an inline row of 3 actions: Mute/Unmute, Remove from stage, Block (maps to `HostActionMenu`, trimmed from its original 4 actions to 3 — "remove from space" and "block" felt redundant at card scale).
- **"Listening · N" section** renders as a **2-column grid** of rows instead of the bubble cluster — each row: 36px avatar (linked), name (13px/500, truncates) + handle (11px, accent-300), and an "Invite to stage" button (or an "Invited" outline tag once sent). Maps to `AudienceList` with `isHost`.
- **Sidebar** gains a "Space controls" card above the posts card: a live-status dot + label ("Live to your followers" / "Broadcast paused" / "Space ended"), a full-width "Pause/Resume broadcast" button (maps to `LiveBannerButton`), and a full-width "End space" button that opens a confirm dialog (maps to `DeleteSpaceButton`) before actually ending the space.
- **Posts card** gains a compose row at the top: a text input ("Paste a Bluesky post URL to share...") + "Share to room" button (maps to `AddPostForm`), above the existing pinned-post list.
- **Bottom control bar**: mic toggle (primary) + "Leave" (secondary) — no raise-hand/step-down states.

## Components (shared)

**Speaker card** (`.card.elev-sm`, 14px padding):
- Avatar: 56px circle, `background: var(--color-accent-700)`, `color: var(--color-accent-100)`, initials, 16px/500. Speaking state: `box-shadow: 0 0 0 2px var(--color-accent)`. Not speaking/idle: `box-shadow: 0 0 0 1px var(--color-neutral-800)`.
- Muted indicator: a 20px filled circle badge (`background: var(--color-neutral-700)`, 2px `--color-surface` border) at the avatar's bottom-right corner, containing a Phosphor `microphone-slash` (filled) icon — **replaces the old "Muted/Live" text pill**.
- Name (14px/500) + optional "Host" tag (`.tag.tag-accent-2`) inline; handle below in `--color-accent-300`, 12px.
- The whole avatar+name block is an `<a>` to `https://bsky.app/profile/{handle}` (`target="_blank"`) — **new**, was previously only on the avatar/name in `AudioParticipant` for participants with a `did`; now applied consistently including in the host's audience list.

**Audience bubble** (listener view): 52px circle, `background: var(--color-neutral-800)`, `color: var(--color-neutral-200)`, initials, 14px/500; `title` attribute carries name + handle; links out to the Bluesky profile; hover: `background: var(--color-neutral-700)` + `box-shadow: 0 0 0 2px var(--color-accent-600)`.

**Shared-post row**: 30px avatar circle + author (13px/500) + "@handle · time" (11px, muted) on one line, post text below (13px, 90% opacity).

## Interactions & Behavior

- **Speaker action menu**: click the "⋯" icon button on a non-host speaker card (host view only) to expand Mute/Remove-from-stage/Block inline. One menu open at a time.
- **Profile links**: every avatar+name element (speaker cards, both audience layouts) is a real anchor to `https://bsky.app/profile/{handle}`, opened in a new tab.
- **Emoji reactions** (new feature): 5 preset reactions — 👍 ❤️ 😂 🎉 👏 — as icon buttons in the bottom control bar. Clicking one spawns a floating emoji that rises from and fades out at **the local user's own avatar** — the host/speaker tile on stage if the local user is a host or has been promoted, or the "YOU" bubble in the listening cluster otherwise. Implementation notes for the real app:
  - Keep a ref to whichever DOM node currently represents the local user's avatar (it moves between the stage grid and the listening cluster depending on role/promotion).
  - On click, read that node's `getBoundingClientRect()` to get a screen position, then render a short-lived (~1.6s) fixed-position emoji element at that position animating upward (`translateY(-60px)`) while fading to `opacity: 0`.
  - **This prototype only shows the reaction locally.** For real use, broadcast the reaction (LiveKit data channel or a lightweight pub/sub keyed by space ID) so everyone in the room sees who reacted and with what.
- **Raise hand**: toggles a local "hand raised" state and swaps the button label ("Raise hand to speak" ↔ "Hand raised"). The button has a fixed `min-width: 190px` so this label swap never resizes/shifts the button — keep an explicit min-width sized to the longer label on any button whose text changes with state. There's currently no backend concept of an audience member requesting to speak (today the flow is host-initiated invite only via `StageManager`/`AudienceList`) — closing this loop (listener raises hand → host sees a request → host invites) is a product decision, not just a UI one.
- **Stage invite toast**: Accept promotes the local participant (maps to `StageControls`'s accept flow, existing `useSpaceState` hook); Decline just dismisses it.
- **Pause/Resume broadcast**: maps to the existing `LiveBannerButton` toggle.
- **End space**: opens a confirm dialog (`.dialog-backdrop`/`.dialog`) before calling the existing delete/end-space endpoint (`DeleteSpaceButton`).
- **Invite to stage** (host, audience row): maps to `AudienceList`'s existing invite call; button becomes a disabled "Invited" tag once sent.

## State Management
- `viewMode` (listener/host): in production this is derived from the join response's `role` / `isHost`. It is never a user-facing choice — there is no UI for it in the design; it only exists as a design-tool preview control outside the page.
- `promoted`: whether the local participant currently has publish permission — maps to the existing accept-invite → token-refresh flow.
- `micOn`: maps to LiveKit's `isMicrophoneEnabled` / `setMicrophoneEnabled`.
- `handRaised`: new local (or to-be-added backend) state — see note above.
- Per-card `openMenuId`: local UI-only state, one open menu at a time.
- `floatingReactions`: ephemeral local render state, array of `{id, emoji, x, y}`, each removed via timeout after ~1.6s. Should be driven by incoming broadcast events in production, not just local clicks.

## Design Tokens (Nocturne)
- Ground: `--color-bg #161826`; surface: `--color-surface #232532`; text: `--color-text #e9e9ed`.
- Accent (single accent, mono scheme): `--color-accent #9184d9`, ramp 100→900 from `#f5f4ff` to `#2b2741` (`--color-accent-100…900`). `--color-accent-2-*` is a near-identical machine-derived stand-in — treat as the same role.
- Neutral ramp: `--color-neutral-100 #f3f5fe` → `--color-neutral-900 #292b31`.
- Divider: `color-mix(in srgb, #e9e9ed 16%, transparent)`.
- Font: Inter for both heading and body (`--font-heading`/`--font-body`), heading weight 500 max — never bolder.
- Spacing scale (0.70× density): `--space-1 2.8px` … `--space-8 22.4px`.
- Radius: `--radius-sm 4px`, `--radius-md 8px`, `--radius-lg 14px`.
- Shadows: `--shadow-sm/md/lg` — hairline edge + ambient darkness, tuned for this dark ground; don't invent ad hoc box-shadows.
- Full token list and component classes (`.btn`, `.card`, `.tag`, `.nav`, `.dialog`, `.seg`, `.field`/`.input`): `nocturne/styles.css` in this bundle.

## Assets
- No photographs — all avatars are colored-initial placeholders (`background: var(--color-accent-700)` for speakers, `--color-neutral-800` for audience). Swap in real Bluesky avatar URLs where available, falling back to initials (existing `AudioParticipant` fallback pattern).
- Icons: Phosphor (https://phosphoricons.com). The prototype loads the Phosphor web-font bundle via CDN for quick preview (`<script src="https://unpkg.com/@phosphor-icons/web">`, class-based `<i class="ph ph-microphone">`) — in the React app, use `@phosphor-icons/react` instead for tree-shaking and proper JSX usage.

## Files
- `Live Room.dc.html` — the interactive prototype (both listener and host states, toggle top-right).
- `nocturne/styles.css` — the Nocturne token sheet and component classes referenced throughout this doc.
- `support.js` — this tool's template runtime, required only to preview the `.dc.html` file; not relevant to the Next.js implementation.
