# Space scheduling and expiration spec

## Goal
Allow spaces to be scheduled for the future, automatically expire spaces that are unscheduled and empty, and update the spaces list to show only relevant spaces plus the current user's hosted spaces.

## Chunks

### Chunk 1: Schema migration for scheduling and expiration
**Files changed:**
- `prisma/schema.prisma`
- `prisma/migrations/20240817000001_add_space_scheduling/migration.sql` (new)

**Goal:** Add fields to track when a space is scheduled and when it expires.

**Detailed changes:**
1. In `prisma/schema.prisma`, extend the `Space` model:
   - `scheduledAt DateTime?` — when the space is scheduled to go live. Null means "now/immediate".
   - `expiresAt DateTime?` — when an unscheduled empty space should be considered expired. Set on creation if `scheduledAt` is null.
   - `status String @default("active")` — one of `active`, `live`, `ended`, `expired`. `isLive` can remain but `status` becomes the source of truth over time.
   - Keep `isLive` for backwards compatibility; update it together with `status`.
2. Create a new migration SQL file `prisma/migrations/20240817000001_add_space_scheduling/migration.sql` that adds the three columns to the `Space` table.
3. Update `prisma/migrations/migration_lock.toml` if needed (provider stays `postgresql`).

**Acceptance criteria:**
- `pnpm prisma migrate deploy` applies the new migration without errors.
- `prisma generate` produces a client with the new fields.

### Chunk 2: Backend service updates
**Files changed:**
- `src/lib/spaces.ts`
- `src/lib/types.ts` or `src/types.ts` (PublicSpace type)
- `src/app/api/spaces/route.ts`
- `src/app/api/spaces/[id]/live/route.ts`

**Goal:** Use the new fields when creating, listing, and transitioning spaces.

**Detailed changes:**
1. In `src/lib/spaces.ts`:
   - Extend `SpaceModel` to include `scheduledAt`, `expiresAt`, `status`.
   - Extend `CreateSpaceInput` with optional `scheduledAt?: Date | string`.
   - In `createSpace`:
     - Normalize `scheduledAt` to a Date or null.
     - If `scheduledAt` is in the future, set `status: 'scheduled'` and `isLive: false`.
     - If `scheduledAt` is null/now, set `status: 'active'` and `isLive: false`.
     - Set `expiresAt` to `Date.now() + 24 hours` when `scheduledAt` is null (i.e. immediate spaces expire after 24h if empty). For scheduled spaces, leave `expiresAt` null until after the scheduled time passes.
   - Add helper `isSpaceVisible(space, now)` returning true if:
     - `status === 'scheduled'` and `scheduledAt >= now - 1 hour` (show scheduled spaces up to 1 hour after start time), OR
     - `status === 'active'` and `expiresAt > now`, OR
     - `status === 'live'`, OR
     - the viewer is the host.
   - Add `getSpacesForUser(userDid: string)`:
     - Return all spaces where the user is the host, ordered by `scheduledAt`/`createdAt` desc.
     - Also return non-hosted spaces that are visible per `isSpaceVisible`.
     - Use a single Prisma query with an OR condition: `(hostId = userDid) OR (status IN ('scheduled','active','live') AND scheduledAt/expiresAt rules)`.
   - Update `setSpaceLive` to also set `status = 'live'` when going live and `status = 'active'` when ending. Clear `expiresAt` when going live.
   - Add `expireSpace(id)` helper that sets `status = 'expired'` and `isLive = false`.
2. In `src/types.ts` (or wherever `PublicSpace` lives):
   - Add `scheduledAt?: string | null`, `expiresAt?: string | null`, `status: string` to `PublicSpace`.
3. In `src/app/api/spaces/route.ts`:
   - Update POST handler to accept `scheduledAt` body field (ISO string), validate it, and pass to `createSpace`.
   - Update GET handler to pass current user DID to `getSpacesForUser`.
4. In `src/app/api/spaces/[id]/live/route.ts`:
   - Update the live toggle to use `setSpaceLive` which also updates `status`.

**Acceptance criteria:**
- Creating a space with `scheduledAt` sets status to `scheduled`.
- Creating a space without `scheduledAt` sets status to `active` with an `expiresAt` 24h in the future.
- Listing spaces returns hosted spaces + visible non-hosted spaces.
- Toggling live updates `status` between `live` and `active`.

### Chunk 3: Expiration cleanup
**Files changed:**
- `src/lib/spaces.ts`
- `src/app/api/spaces/expire/route.ts` (new)
- `src/app/api/spaces/route.ts`

**Goal:** Clean up expired spaces.

**Detailed changes:**
1. Add `expireStaleSpaces()` to `src/lib/spaces.ts`:
   - Find spaces where `status = 'active'`, `scheduledAt IS NULL`, `expiresAt < now`, and `updatedAt < now - 5 minutes` (avoid race with very recent creation).
   - Update their `status` to `'expired'` and `isLive` to `false`.
   - Return the count of expired spaces.
2. Create `src/app/api/spaces/expire/route.ts`:
   - POST endpoint that calls `expireStaleSpaces()`.
   - Returns `{ expired: number }`.
   - No auth required (or require a simple token/env check if desired). For MVP, no auth is fine; it only mutates stale rows.
3. Optionally call `expireStaleSpaces()` inside GET `/api/spaces` before returning results (best-effort, do not fail the request if cleanup errors).

**Acceptance criteria:**
- Calling POST `/api/spaces/expire` expires spaces past their `expiresAt`.
- GET `/api/spaces` no longer returns expired spaces (unless hosted by the viewer).

### Chunk 4: Frontend UI updates
**Files changed:**
- `src/components/CreateSpaceForm.tsx`
- `src/app/spaces/page.tsx`
- `src/app/spaces/[id]/page.tsx`
- `src/components/SpaceCard.tsx`

**Goal:** Let users schedule spaces and see scheduling state in listings.

**Detailed changes:**
1. In `src/components/CreateSpaceForm.tsx`:
   - Add a date/time input for scheduling (optional).
   - Label: "Schedule for later (optional)".
   - If a value is provided, include `scheduledAt` in the POST body.
2. In `src/app/spaces/page.tsx`:
   - No changes needed if `getSpacesForUser` is used.
3. In `src/components/SpaceCard.tsx`:
   - Show a "Scheduled" badge with the date/time if `status === 'scheduled'`.
   - Show "Live" badge if `status === 'live'`.
   - Show "Active" badge if `status === 'active'`.
4. In `src/app/spaces/[id]/page.tsx`:
   - Show scheduled time if `status === 'scheduled'`.
   - If the viewer is the host and the space is scheduled, show a "Go Live" button that transitions to live before the scheduled time.

**Acceptance criteria:**
- Create form has an optional schedule input.
- Space cards show status badges correctly.
- Space detail page shows scheduled time for scheduled spaces.

### Chunk 5: Build, test, and deploy
**Files changed:**
- None (verification)

**Goal:** Build, run tests, deploy to `rabble.exe.xyz`, apply migration.

**Detailed changes:**
1. Run `pnpm typecheck` and `pnpm test`.
2. Copy source + migration to remote host.
3. On remote host:
   - Run `docker compose run --rm migrate npx prisma migrate deploy`.
   - Build image and `docker compose up -d`.
4. Verify `/api/health` and spot-check `/api/spaces`.

**Acceptance criteria:**
- Typecheck passes.
- Existing tests pass (or pre-existing failures are unchanged).
- Migration applies on remote.
- App is healthy.

## Notes
- Use `status` as the source of truth going forward; keep `isLive` updated for compatibility.
- The `expiresAt` cleanup is single-replica friendly. A cron/external scheduler calling `/api/spaces/expire` would be the production pattern.
- Keep changes backwards-compatible: existing active spaces without `scheduledAt` remain visible until they expire.
