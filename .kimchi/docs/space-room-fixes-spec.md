# Space room participant fixes spec

## Goal
Fix the space room so joining stays connected, participants are shown with Bluesky handles/avatars, and hosts can manage users through profile menus.

## Chunks

### Chunk 1: Fix join returning to join button
**Files changed:**
- `src/components/SpaceRoom.tsx`
- `src/components/SpacePageClient.tsx`

**Goal:** When a user clicks Join Space, the room should stay mounted and not immediately reset to the join prompt.

**Detailed changes:**
1. In `src/components/SpaceRoom.tsx`:
   - Remove or guard the `onDisconnected` handler so an initial disconnect does not immediately call `onLeave`. Keep it for explicit user-initiated leave only.
   - Add `onError` handler to `LiveKitRoom` that logs the error and optionally shows it in the UI instead of unmounting.
   - Add a `useEffect` that logs connection state changes to help diagnose future issues.
2. In `src/components/SpacePageClient.tsx`:
   - Pass an explicit `onLeave` callback that only fires when the user clicks Leave or the room truly closes. If LiveKit emits a transient disconnect during setup, do not call `setJoined(null)` automatically.
   - Add a local `connectionError` state and display it inside the room card.

**Acceptance criteria:**
- After joining, the room stays mounted and shows the participant grid / stage controls.
- A connection failure shows an error message instead of silently returning to the join prompt.

### Chunk 2: Show AT Protocol handles and avatars
**Files changed:**
- `src/components/AudioParticipant.tsx`
- `src/components/SpaceRoom.tsx`
- `src/components/RoomGrid.tsx` (new)
- `src/lib/users.ts` (new or extend)
- `src/app/api/users/route.ts` or `src/app/api/spaces/[id]/participants/route.ts` (new)

**Goal:** Display participants with their Bluesky handle and avatar instead of raw DID/identity.

**Detailed changes:**
1. Create `src/lib/users.ts` with a helper `getUserByDid(did: string): Promise<{ did: string; handle: string; avatarUrl?: string | null } | null>` using Prisma.
2. Create a new API route `src/app/api/spaces/[id]/participants/route.ts`:
   - POST body: `{ identities: string[] }`
   - Returns `{ participants: { did, handle, avatarUrl }[] }`
   - Only requires the user to be authenticated.
3. Create `src/components/RoomGrid.tsx`:
   - Client component that fetches participant profiles from the new API route when the participant list changes.
   - Renders `AudioParticipant` for each participant with resolved handle/avatar.
4. Update `src/components/AudioParticipant.tsx`:
   - Accept `avatarUrl?: string | null`.
   - Render an `<img>` avatar when available; otherwise keep the fallback initials.
5. Update `src/components/SpaceRoom.tsx`:
   - Use the new `RoomGrid` component.
   - Pass display names/avatars from resolved profiles.

**Acceptance criteria:**
- Participant tiles show Bluesky handles (`@handle`) when available.
- Avatars are rendered when available.
- Unknown/unresolved identities still fall back to initials.

### Chunk 3: Clickable avatars → Bluesky profile
**Files changed:**
- `src/components/AudioParticipant.tsx`

**Goal:** Clicking a participant's avatar/name opens their Bluesky profile.

**Detailed changes:**
1. Add `did?: string` prop to `AudioParticipantProps`.
2. Wrap the avatar and name area in an anchor tag (`<a>`) when `did` is provided:
   - `href={\`https://bsky.app/profile/${did}\`}`
   - `target="_blank" rel="noopener noreferrer"`
   - Use `onClick={(e) => e.stopPropagation()}` so clicking does not trigger other actions.
3. Keep the layout visually unchanged; only make the avatar/name interactive.

**Acceptance criteria:**
- Clicking avatar/name opens the user's Bluesky profile in a new tab.
- Other interactions (mute indicator, host actions) are not blocked.

### Chunk 4: Host user action menu (audience)
**Files changed:**
- `src/components/AudioParticipant.tsx`
- `src/components/HostActionMenu.tsx` (new)
- `src/components/SpaceRoom.tsx`
- `src/hooks/useSpaceState.ts`

**Goal:** Hosts can open a menu on any participant tile to invite to stage, remove from space, or block.

**Detailed changes:**
1. Create `src/components/HostActionMenu.tsx`:
   - Props: `mode: 'audience' | 'speaker'`, `identity: string`, `did?: string`, `isLocal: boolean`, `isMuted?: boolean`, `onInvite?: () => void`, `onRemoveFromStage?: () => void`, `onRemoveFromSpace?: () => void`, `onBlock?: () => void`, `onMuteToggle?: () => void`
   - Render a small dropdown or inline row of buttons.
   - Do not render for `isLocal === true`.
2. Update `src/components/AudioParticipant.tsx`:
   - Accept `isHost?: boolean`, `mode?: 'audience' | 'speaker'`, and the action callbacks.
   - Render `HostActionMenu` in the tile when `isHost` is true and the participant is not local.
3. Update `src/components/SpaceRoom.tsx`:
   - Pass `isHost={role === 'host'}` to `RoomGrid`.
   - For audience tiles, wire `onInvite` to stage invite action.
   - For speaker tiles, wire `onMuteToggle` and `onRemoveFromStage`.
   - Wire `onRemoveFromSpace` to a new action `kick` and `onBlock` to a new action `block`.
4. Extend `useSpaceState.dispatchStageAction` to support `'kick'` and `'block'` actions.

**Acceptance criteria:**
- Host sees action buttons on remote participant tiles.
- Audience member: Add to stage, Remove from space, Block.
- Speaker: Mute/Unmute, Remove from stage, Block.

### Chunk 5: Host stage action menu (speaker)
**Files changed:**
- Same as Chunk 4; the `HostActionMenu` covers both modes.
- `src/components/StageManager.tsx`

**Goal:** Stage manager list also exposes mute/remove-from-stage/block actions.

**Detailed changes:**
1. Update `src/components/StageManager.tsx`:
   - Add optional action callbacks: `onMuteSpeaker`, `onBlockSpeaker`.
   - Render the same `HostActionMenu` for each speaker row.
2. Wire callbacks in `src/components/StageControls.tsx`.

**Acceptance criteria:**
- Stage manager list shows action menu for each speaker.

### Chunk 6: Server-side stage actions (kick / block / mute)
**Files changed:**
- `src/app/api/spaces/[id]/stage/route.ts`
- `src/lib/livekit.ts`

**Goal:** Implement the new host actions on the server.

**Detailed changes:**
1. In `src/app/api/spaces/[id]/stage/route.ts`:
   - Accept `action: 'kick' | 'block' | 'mute' | 'unmute'` in addition to existing actions.
   - `kick`: remove the participant from the LiveKit room (use RoomServiceClient to remove participant).
   - `block`: record the blocked DID in a new `BlockedUser` table or in-memory set for the space; also kick them.
   - `mute`/`unmute`: use RoomServiceClient to mute/unmute the participant's microphone.
2. In `src/lib/livekit.ts`:
   - Add helpers: `removeParticipant(roomName, identity)`, `muteParticipant(roomName, identity, muted)`.
3. For MVP, blocking can be stored in memory (a Set on the space) or in the database. Use the simplest approach: a `Set<string>` of blocked DIDs per space in a module-level Map. Document that it is single-replica only.

**Acceptance criteria:**
- Kick removes the user from the room immediately.
- Mute toggles the user's microphone.
- Block kicks the user and prevents rejoin (for this process lifetime).

### Chunk 7: Build, test, and deploy
**Files changed:**
- None (verification)

**Goal:** Build the image, deploy, and verify health.

**Detailed changes:**
1. Run `pnpm typecheck` and relevant tests locally.
2. Build Docker image on `rabble.exe.xyz`.
3. Run `docker compose up -d`.
4. Verify `/api/health`.

**Acceptance criteria:**
- Build succeeds.
- Tests pass.
- App deploys and is healthy.

## Notes
- Use existing Prisma `User` table to resolve handles/avatars.
- Keep the UI changes minimal; reuse existing Tailwind classes.
- Do not implement persistence for blocks beyond single-replica in-memory Set.
