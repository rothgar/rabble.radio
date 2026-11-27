# REVIEW.md

Review notes earlier reviews and fixes left behind: what to check in this
code, and mistakes already made there.

## tests/components/space-room.test.tsx

- Before trusting a green run against a mocked LiveKit boundary, check
  every mocked context hook is actually wired: `useLocalParticipant` here
  must hand out the room's local participant (through `RoomContext`, as the
  real SDK does). It once read a module variable that nothing ever set, so
  it always returned `null` — `HostAutoUnmute` was inert under the mock,
  and any later test of local-participant behaviour (mic toggle,
  `isMicrophoneEnabled` state) would have passed vacuously.
- Assert the contract the issue states, not a stricter shape the real
  system cannot produce: the real `useRoom` hook always calls
  `setMicrophoneEnabled(!!audio)` on `SignalConnected`, so a listener join
  records one *disable* call (which never captures the microphone). "No mic
  request on join" is "no call *enables* the microphone"
  (`not.toContain(true)`), not "no call at all".

## src/components (fixed-position dialogs)

- A `fixed inset-0` dialog resolves against the nearest ancestor with
  `backdrop-filter`/`filter`/`transform` (CSS gives that ancestor a
  containing block for fixed descendants), not the viewport. Check every
  `fixed inset-0` dialog against its actual ancestors, not just where it
  looks like it sits in the JSX; render it through `createPortal` to
  `document.body` when a `backdrop-blur` (or `filter`/`transform`) ancestor
  is in the way. `BottomControlBar`'s leave dialog hit this nested inside
  `NocturneShell`'s `backdrop-blur` footer (issue #6); `FeedbackButton`'s
  dialog had the same bug nested inside `SiteHeader`'s `backdrop-blur`
  header, fixed the same way (issue #8).
- A confirmation dialog's action buttons should compose
  `src/components/ui/Button.tsx` (it already has `secondary` and `danger`
  variants, 44px touch targets, and the design system's 8px-corner
  `rounded-sm`), not hand-roll Tailwind classes. `BottomControlBar`'s leave
  dialog hand-rolled its own `ACTION_BTN`/`ACTION_BTN_SECONDARY` constants
  (including `rounded-full`, which the design system does not use for
  dialogs) before `Button` covered this case; a second hand-rolled dialog
  (`SpeakerCard`'s report dialog) repeated the same drift until issue #11's
  review caught it. Check a new dialog's buttons against `Button` first.

## src/components/SpaceRoom.tsx

- `HostAutoUnmute` guards its once-only `setMicrophoneEnabled(true)` call
  against the `Room` instance (`autoUnmutedRooms`, a `WeakSet<object>`), not
  a component-local ref. The LiveKit `Room` lives in `ActiveRoomProvider` and
  survives SpaceRoom unmounting when the host leaves the studio page and
  comes back through `PersistentShowBar`; a per-mount ref would re-fire on
  every such remount and silently override a host's own mute. Any future
  "do this once per connection" effect in this file needs to key off the
  room, not the component's mount lifecycle.

## src/lib/livekit.ts (participant permission defaults)

- A LiveKit `ParticipantInfo.permission` can be missing or omit
  `canPublish` right after a participant joins (not yet synced), and the
  two helpers that read it must not share one default for that case.
  `getRoomParticipantSummary` only reports a count, so it defaults unclear
  permission to listener (`canPublish === true` ⇒ speaker, else listener) —
  a brief undercount self-corrects on the next sweep. `setAudienceSubscriptions`
  *mutates* the participant (it force-sets `canPublish: false` on anyone it
  doesn't skip), so it keeps the opposite, more conservative default
  (`canPublish !== false` ⇒ skip/leave alone): defaulting unclear permission
  to listener there risks audibly muting a host or co-host still mid-connect,
  which is worse than the display bug it would have avoided (issue #3).
  Check any new reader of `permission.canPublish` against which failure mode
  it can cause before picking a default.
- `getRoomParticipantSummary`'s documented undercount was only ever safe
  because its one caller at the time, the metrics sweep, self-corrects on
  the next pass. `src/app/api/livekit/webhook/route.ts`'s auto-end-show path
  (issue #21) is a caller that cannot tolerate that: acting on a false
  zero-speakers reading ends the show, deletes the host's live bsky status,
  and stops recording for a host who never left. It re-checks once after
  `SPEAKER_RECHECK_DELAY_MS` and only acts if both readings agree. Any new
  caller of this function must decide for itself whether a brief undercount
  is tolerable, not assume the sweep's tolerance carries over.

## src/app/api/livekit/webhook/route.ts (participant_left ordering)

- `getRoomParticipantSummary` (`listParticipants`) called synchronously
  inside a `participant_left` handler does not race the departure it is
  reacting to: verified against a real LiveKit dev server (not the mocked
  unit tests) that `listParticipants` excludes a participant within one
  poll interval (~25ms) of that participant's own `disconnect()` resolving
  client-side — before any webhook notification about the departure could
  plausibly be dispatched, since a webhook is a side effect of the same
  internal state change. An ungraceful disconnect (network drop, no clean
  close) is detected by the server's own heartbeat timeout first, which
  delays the webhook and the room's participant list by the same amount —
  so this ordering holds for both disconnect paths, not just a clean leave.
  Any future code reacting to a `*_left`/`*_disconnected` webhook with an
  immediate room-state query can rely on this; it does not need to
  re-verify it.

## src/lib/spaces.ts (findDefaultHostedSpace)

- `findDefaultHostedSpace` identifies a host's "default" show by matching
  `Space.title` against the exact string `defaultShowTitle` would render
  today, not by any marker on the row itself. Issue #23 changed that
  rendered shape from handle-only (`"@alice's show"`) to display-name-first
  (`"The Alice show"`) and had to add a second `title: { in: [...] }` branch
  matching the old shape too, or every host with an existing default-titled
  show would have silently lost it to a duplicate on their next "Start a
  show". That branch only covers the one known prior shape: a host whose
  Bluesky display name changes between sessions can still stop matching
  their own default show, since `displayName` is captured at login
  (`src/app/api/auth/bluesky/callback/route.ts`) and the title text isn't
  re-synced after. Filed as issue #33 to replace text-matching with a
  dedicated marker on `Space`; any further change to `defaultShowTitle`'s
  shape needs the same "match the old shape too" treatment until that lands.

## src/lib/session.ts (getCurrentUser)

- `getCurrentUser` is the single enforcement point for a platform ban
  (`src/lib/admin.ts`): it reads the session cookie's DID, then checks the
  `User` row's `bannedAt` itself, so every caller gets `null` for a banned
  account without re-checking. That guarantee only holds for code that
  actually calls `getCurrentUser` — `src/app/api/me/route.ts` read
  `getSession()` directly and skipped it, so a banned user's still-valid
  cookie kept `/api/me` answering 200 until issue #10's review caught it.
  When adding a check inside `getCurrentUser`, grep every `getSession()`
  caller, not just the ones that already call `getCurrentUser` — a route
  can hold a valid session and still bypass it.

## src/components (split buttons)

- `Button`'s bordered variants (`primary`, `secondary`, `accent`, `danger`)
  each render a complete 1.5px outline on all four sides; two of them placed
  edge to edge (a main action plus a chevron, as in `StartShowMenu`) stack
  their touching borders into a ~3px seam instead of the brand's single
  1.5px/2px outline, and an explicit `border-l` on the second button doubles
  down on it rather than fixing it. Collapse the seam with `-ml-px` on the
  second button (standard adjoining-button trick: it overlaps the shared
  edge by one pixel, leaving one line) instead of adding a border class, and
  check it against every variant a caller can pass — `ghost` has no border
  at all, so an explicit added border there is also the odd one out, visible
  on one button and not its neighbour.

## src/lib/host-follows.ts, src/lib/show-follows.ts and src/lib/push.ts (host-follow / show-follow due/push race)

- `pushHostFollowersOnAir` and `takeDueHostFollows` both do a read-then-write
  over the same `HostFollow.notifiedAt` rows (query where `notifiedAt: null`,
  then mark the ones it handled), so a `GET /api/me/reminders?due=1` poll
  landing between the push path's query and its own `updateMany` can claim
  and return the same due item the push path is about to deliver —
  double-notifying a follower who has the site open (toast + push) on that
  go-live. `src/lib/reminders.ts`/`pushRemindersOnAir` has the identical
  shape for `ShowReminder`, but there it only matters once per reminder's
  lifetime since `notifiedAt` is never reset; `resetHostFollowNotifications`
  reopens this window on every single go-live (issue #19's review, round 1).
  Wrapping the read+mark in `prisma.$transaction` would not close this
  window: D1 has no real transactions (see the note at the top of
  `prisma/schema.prisma` — `$transaction` calls run statement by statement).
  Closing it for real needs a single atomic claim (e.g. a parameterized
  `UPDATE ... RETURNING`) shared by both call sites; until that lands, don't
  assume the push and poll paths for `HostFollow` are mutually exclusive.
  `pushShowFollowersOnAir`/`takeDueShowFollows` (`src/lib/show-follows.ts`,
  added for `ShowFollow` in issue #36) repeat this exact shape on a third
  table, `resetShowFollowNotifications` included — the eventual atomic-claim
  fix needs to cover `ShowFollow` too, not just `HostFollow`.
- `takeDueHostFollows` (src/lib/host-follows.ts) picks one live space per
  followed host with no ordering when a host is live on two spaces at once,
  and marks the `HostFollow` row notified regardless — so the follower never
  hears about the second room until the host's next go-live resets things.
  Space selection is now ordered (`createdAt` ascending) so which one wins
  is at least deterministic; the second-room gap itself is still open if a
  multi-show host going live twice at once turns out to be reachable.
- `inviteToStage` (src/lib/stage.ts) is a second call site into the same
  `pushHostFollowersOnAir` read-then-write race described above: it now
  fires when the host brings a guest on stage while the show is already live
  (`space.isLive` gates it — not during the pre-show hold), for a guest
  going on-air as a speaker, not only on a host's own go-live. The same
  `GET /api/me/reminders?due=1` poll can land between `markSpeaker` and the
  push path's `resetHostFollowNotifications`/query/`updateMany` cycle and
  double-notify the guest's own follower. Any future caller of
  `pushHostFollowersOnAir` (host-live or guest-promoted-to-stage) shares this
  window — don't assume the push and poll paths for `HostFollow` are
  mutually exclusive from either call site. `acceptStageInvite` carries the
  identical call (issue #37) but is now dormant: issue #55 moved stage
  promotion to `inviteToStage` (immediate, no accept step), and nothing in
  this codebase creates a pending invite for `acceptStageInvite` to consume
  anymore — it's kept only for a client that still calls `accept` on its
  own. If that path is ever exercised again, it hits this same race.

## src/lib/atproto-runtime.ts (resolveDidMigrationTarget)

- `resolveDidMigrationTarget` looks for a `did:`-prefixed entry in a PLC
  operation's `alsoKnownAs` array as proof a retired DID migrated to a new
  one. The real did:plc method has no such field: `alsoKnownAs` only ever
  holds `at://<handle>` URIs in practice (this file's own
  `handleFromDidDocument`, a few lines above, reads the same field that way),
  and no PLC operation type records "this identity continues as a different
  DID" — did:plc has no redirect/successor concept today. Against the real
  `plc.directory`, this function will never return non-null, so
  `findMigratedHostDid` (src/lib/users.ts) can never fire in production; it
  was built this way anyway; the only alternative weaker signal
  (handle-matching plus the old DID failing to resolve, tried first) is a
  forgeable host-takeover vector — see the issue #41 security review — and
  the owner chose shipping an inert-but-safe check over a working-but-forgeable
  one. If atproto ever adds a real cross-DID continuity mechanism, this is
  the function to update; until then, don't read a green test suite here as
  proof the feature does anything against the live PLC directory — the test
  fixtures invent a log shape the real service doesn't produce.

## src/components/RoomSidebar.tsx (host editing gated on isLive)

- A new `isHost && !isLive` gate on a web editing control (issue #53 hid
  `ShowDetailsForm` once the show goes live, following the `MusicCard`
  (then `PreShowMusic`) precedent in `SpaceRoom.tsx`) has no Android/iOS
  counterpart unless someone adds one: `ShowScreen.kt`'s and
  `ShowView.swift`'s `Edit` buttons gate on `isHost` alone, with no on-air
  check, since "show details" is a shared flow (`mobile-apps` skill) that
  predates this gate. Check both apps' gating whenever a host-only editing
  control on web picks up a new `!isLive`/on-air condition; filed as issue
  #56 for this one.

## src/components/MusicCard.tsx (host editing, on stage vs. audience while live)

- Issue #111 deliberately reversed the precedent this note used to
  describe: `MusicCard`'s host-only menu was gated `isHost && !isLive`
  (passed into its `isHost` prop from `SpaceRoom.tsx`) from issue #69 until
  #111, which opens it on air too so the host can pull music off stage
  while live. `SpaceRoom.tsx` now passes `isHost` unconditionally and an
  `isLive` prop (copy only, not gating). Before touching this call site,
  understand `musicOnStage` (schema field, `UpdateSpaceInput`,
  `PublicSpace`): it is a second, independent flag from `musicMood` —
  `musicMood` is which mood is chosen, `musicOnStage` is whether it is
  currently rendered on stage or has been removed to the audience/listening
  list while live. `showMusicCard`/`musicInAudience` in `SpaceRoom.tsx`'s
  `Inner` derive the tile's placement from both; `musicOnStage` is ignored
  off air (the tile is always on stage there once a mood is set, same as
  before #111).
- The stage tile's "Remove from stage" button always calls `onMoodChange`
  with `null` (unchanged in `MusicCard.tsx` itself). `SpaceRoom.tsx`'s
  `handleMusicMoodChange` wrapper is what gives that `null` a different
  meaning depending on `isLive`: off air it still clears `musicMood`
  outright (as issue #69 built it); on air it calls
  `onMusicOnStageChange(false)` instead, keeping `musicMood` so an "Invite"
  from the audience list (`AudienceRows`'s `musicGuest` prop,
  `AudienceBubbles`'s `musicGuest` prop) can restore the exact same mood
  automatically via `onMusicOnStageChange(true)`, with no picker. Any
  change to that wrapper that lets a live "remove" fall through to
  `onMusicMoodChange(null)` would silently lose the mood instead of parking
  it in the audience — check it is still intercepted whenever `isLive &&
  musicOnStage`.
- Android's `ShowScreen` and iOS's `ShowView.swift`
  (`canPick: model.isHostOfShow && !connected.onAir`) still gate their own
  music picker off-air only, and neither has the `musicOnStage` field or an
  audience-list placement for removed-while-live music: issue #111 only
  shipped on web. Filed as issue #119 for Android/iOS parity — check it
  before assuming this flow behaves the same on every platform.
- The two actions this issue added are asymmetric in how a failure reaches
  the host, and should stay in step: "Remove from stage" runs through
  `MusicCard`'s own `pick()`, which awaits `onMoodChange` and shows a failed
  save inline in the menu (`music-error`). "Invite" from the audience list
  (`SpaceRoom.tsx`'s `inviteMusicToStage`) has no such surface — the
  audience row is not inside `MusicCard` — so it only logs a failure to the
  console instead. If a later change gives the audience list its own error
  UI, move `inviteMusicToStage`'s handling there instead of leaving it
  console-only.

## src/components/AudienceRows.tsx (invite chip touch target)

- `MusicRow`'s "Invite" button (issue #111) is a second hand-rolled copy of
  `Row`'s own Invite chip (`rounded-full bg-[var(--color-accent)] px-3
  py-1 text-xs…`), which is itself under the 44px touch-target minimum
  (`DESIGN.md`: "at least 44px tall and wide … on every tappable thing,
  including chips and icon buttons"). `MusicRow`'s copy was fixed to add
  `min-h-touch min-w-touch` when review caught it; `Row`'s original was left
  as is, same as the `AddToCalendar.tsx` precedent above. Check both before
  a third Invite-chip copy appears — route all of them through
  `<Button size="sm">` rather than hand-rolling a fourth one.

## src/components/MusicCard.tsx (CC BY attribution visibility)

- The file's own header comment promises "Attribution is shown wherever a
  track plays." Issue #110 moved the full copyright/attribution string and
  licence link out of the always-visible `music-track` line and into the
  host-only mood-picker popup (`canPick = isHost && onMoodChange`), which
  would have left every non-host listener — the actual audience hearing a
  CC BY 4.0 track — with no attribution at all, since the popup only a host
  can ever open. Caught in round 1 of #110's review. Fixed by keeping a
  compact, always-visible licence link in `music-track` (everyone sees
  title+artist via the guest name, plus licence type+link) while the fuller
  `attribution()` string (title, full artist-with-site, licence) is
  additional detail in the host popup, not the only place attribution
  appears. Any future change to this file's attribution display must keep
  at least title, artist and licence visible to every viewer, not just the
  host.

## android/.../ui/ShowScreen.kt + ios/Rabble/Views/ShowView.swift (licence text missing from the music tile)

- The web rule above — every viewer sees at least title, artist and licence
  on the music tile, not just the host — was never carried to the apps.
  `MusicTrack` on both platforms already has `license`/`attribution`
  getters, but neither `MusicTile` composable/view renders them anywhere:
  not on the tile, not in the host's mood menu. Issue #114 (mood icon +
  guest name parity) added title+artist to both tiles without adding the
  licence, since that was outside its scope; caught in its review. Filed as
  #116 rather than fixed there. A future change to either app's music tile
  should close this gap, not just preserve it.

## src/components/ShowDetailsForm.tsx (unmount while dirty)

- `ShowDetailsForm` keeps its draft (title/description/tags) as local state
  with an explicit Save button (`dirty` check, `ShowDetailsForm.tsx`); it is
  not a controlled, always-synced field. Issue #53 made `RoomSidebar` unmount
  it the moment `isLive` flips true (driven by the independent "On air"
  toggle), which would have silently discarded an in-progress, unsaved edit
  on unmount with no warning. Fixed by flushing a dirty draft in the
  unmount-cleanup effect (`keepalive: true` PATCH, via a ref so the flush
  reads the latest values without re-running on every keystroke). Any future
  code that can unmount this form from outside the user's own save action
  (another new on-air-style gate, a route change) needs to go through this
  flush path too, not add a second ad hoc save-before-unmount.
- That flush effect has to tell "unmounted mid-edit" apart from "unmounted
  because its own save just succeeded": `RoomSidebar` keys `ShowDetailsForm`
  on `title|description|tags`, so a successful save changes the key and
  remounts a fresh instance — and the old instance's `dirty` (computed
  against its own frozen-at-mount `initialTitle` etc.) is still true at that
  point, since nothing ever resets its local state back to the saved values.
  Without the `justSavedRef` guard set at the end of a successful `onSubmit`,
  every normal explicit Save would fire a second, redundant PATCH (and a
  second `onSaved` call) from the remount it causes — caught in round 2 of
  issue #53's review because the standalone component test never triggers
  that key-driven remount. Any other "skip the flush" condition added here
  needs to be checked against this same key-remount path, not just the
  going-live path the issue was about.
- `justSavedRef` is a one-way latch (set `true` on a successful save, never
  reset) and is only safe because the one production caller, `RoomSidebar`,
  is guaranteed to remount a fresh `ShowDetailsForm` (a fresh, `false` ref)
  right after every successful save — `onSaved` feeds back into the
  `title|description|tags` key. Any future caller of `ShowDetailsForm` that
  wires `onSaved` to something that does *not* change that key (or renders
  it without `onSaved` at all) would let the same instance survive its own
  save with `justSavedRef` stuck at `true`, silently disabling the
  flush-on-unmount protection above for every edit made after that point.
  A new caller must either preserve the remount-on-save contract or make
  this guard reset itself (e.g. clear `justSavedRef.current` when the
  `title`/`description`/`tags` props actually change).

## src/app/hosts/page.tsx and src/app/page.tsx (blocked-host filter buffer)

- `getTopHosts`'s `blockedDids` option filters before ranking, but neither
  call site (issue #70) uses it that way: each passes only `excludeDid` and
  fetches `HOSTS_LIMIT`/`HOME_HOSTS_LIMIT` + `BLOCK_FILTER_BUFFER` (10) extra
  candidates, then filters `blockedDids` out of that fixed window afterward —
  so `getTopHosts`'s DB query and `getBlockedDids`'s OAuth-backed Bluesky call
  can run concurrently instead of the latter serializing ahead of the former.
  A viewer who has blocked more than `BLOCK_FILTER_BUFFER` of the current top
  `HOSTS_LIMIT + BLOCK_FILTER_BUFFER` hosts gets fewer than the intended count
  rather than a backfilled page/strip from further down the ranking — accepted
  as unlikely given realistic block-list sizes, not fixed. Raising either
  limit, or anything that could make a viewer's blocked-host overlap with the
  top ranks larger, should re-check whether the buffer is still big enough, or
  switch to passing `blockedDids` into `getTopHosts` directly (pre-ranking,
  always correct) and accept the serialization cost that brings back.

## src/app/station/[tag]/page.tsx (decoding the `tag` param)

- `decodeURIComponent` throws a `URIError` on a malformed percent sequence
  (e.g. a bare `%`) instead of returning an invalid string, so `isValidTag`
  never gets a chance to reject it — a crawler or link-preview bot hitting a
  stray-`%` station link would 500 the page and crash `generateMetadata`
  too. Issue #78 added `generateMetadata` and both it and the page body now
  decode through the shared `decodeTagParam` helper in this file, which
  catches that and treats an unparseable tag as just another invalid one.
  Any further decoding of this param (or a similar route param elsewhere)
  needs the same guard; `decodeURIComponent` is never safe to call directly
  on a value that came from the URL.

## src/components/AddToCalendar.tsx (trigger touch target)

- The "Add to calendar" trigger button had no `min-h-touch`/`min-w-touch`,
  under the design system's 44px touch-target requirement (`DESIGN.md`:
  "at least 44px tall and wide … on every tappable thing, including chips
  and icon buttons"). It went unnoticed while the component only rendered
  inside `HostCard.tsx`'s dense `/hosts` ranked-host list; issue #72 added a
  second call site on the show's own page (`SpacePageClient.tsx`), the
  primary per-show surface, which is what caught it. Check this component's
  interactive elements against `min-h-touch`/`min-w-touch` again before
  adding a third call site — the dropdown menu's own items
  (`calendar-google`, `calendar-ics`) have the same gap and were left as is
  this time since no new surface put them in front of more users.

## src/components/ui/PageLayout.tsx and src/components/Footer.tsx (sticky-footer composition)

- `Footer` has no `mt-auto` to pin itself and needs none: it only pins to
  the bottom of a short page because its page wraps `SiteHeader`,
  `PageLayout` and `Footer` in a `<div className="flex min-h-screen
  flex-col">` instead of a bare `<>` fragment, and `PageLayout`'s `<main>`
  is `flex-1` (not `min-h-screen`) so it fills exactly the remaining space
  in that column rather than forcing its own 100vh. Issue #95's first
  version skipped the wrapper and kept `main` at `min-h-screen`: with no
  flex ancestor, `mt-auto` resolved to nothing, and `main`'s own
  `min-h-screen` meant every short page (an empty state, a not-found
  branch) pushed the footer a full extra viewport below the fold — caught
  in round 1 of its review, independently, by both the general and the
  design-system reviewer. `PageLayout`'s `flex-1` is a no-op outside such a
  wrapper (today's six other callers — `me`, `admin`, `admin/reports`,
  `admin/feedback`, `stations/new`, `downloads` — none of which use
  `Footer`), so
  adding `Footer` to a page that doesn't compose this wrapper reintroduces
  the bug silently rather than visibly breaking; check for the wrapper, not
  just for the import, whenever a page gains a `Footer`.

## Bottom-fixed UI (PersistentShowBar, ReminderToasts)

- `ActiveRoomProvider` exposes a single `barVisible` flag (session connected,
  not on the session's own `/show/[id]` page) that both `PersistentShowBar`
  and `ReminderToasts` read, and that also drives the bottom padding
  reserved around `children` in `ActiveRoomProvider`. Any new fixed-bottom
  UI must read `barVisible` too — either to reposition itself above the bar
  (as `ReminderToasts` does) or to stay out from under it — rather than
  assuming it has the bottom of the viewport to itself.

## .github/workflows/deploy.yml (ios-tests needs a real LiveKit)

- The `ios-tests` job's own comment used to claim "not a real LiveKit: the
  join route only signs a token, it never has to reach LIVEKIT_URL" — false:
  `POST /api/spaces/[id]/join` calls `createRoom()` (`src/lib/livekit.ts`)
  before it mints anything, which reaches `LIVEKIT_URL` over HTTP and 503s
  if nothing is listening, and the app's own `lkRoom.connect()`
  (`ShowModel.swift`) then opens a real WebSocket to it. Nothing in this job
  ever started a LiveKit server, on the GitHub-hosted `macos-latest` path the
  job runs by default (confirmed from a real failing run's own
  `/api/health` log line: `"checks":{"db":true,"livekit":false}}`) — the
  job's `/api/health` retry loop only checks for HTTP 200, which `degraded`
  (one dependency down) still returns, so it never caught this. `RabbleUITests`
  and `ShowRoomUITests` happened to pass anyway because both only assert
  things with a non-LiveKit fallback (`ShowView.swift`'s `onAir = connected?.onAir
  ?? show.isLive`, `listening = room?.listening ?? show.listenerCount`);
  `LeaveConfirmationUITests` genuinely cannot pass without one, since the
  "Leave the show" button only renders inside `ReactionBar` once
  `model.room.connected` is set, which requires a real connection to
  succeed (issue #148). Fixed by adding a `livekit-server --dev` step (the
  job's existing `LIVEKIT_API_KEY=devkey`/`LIVEKIT_API_SECRET=secret` already
  matched `--dev`'s built-in keypair) before the dev server starts. Any
  future change to this job that asserts something gated on a real
  `connected` room needs this step to still run before it; don't trust a
  green `RabbleUITests`/`ShowRoomUITests` run alone as proof LiveKit is
  reachable here.

## src/app/.well-known/security.txt/route.ts (EXPIRES staleness)

- `EXPIRES` is a hardcoded literal (RFC 9116 requires it), refreshed by
  hand "a year out" on each edit, per issue #160. Nothing enforces that: if
  this file goes untouched past the date, the route keeps serving an
  expired `Expires` field indefinitely with no test, lint or CI failure to
  notice. `tests/app/security-txt-route.test.ts`'s `has not yet expired`
  test only catches it once CI runs against a stale `EXPIRES` — i.e. after
  the date has already passed — not before. Whoever next edits this file
  for any reason should push `EXPIRES` another year out while they're in
  it; don't assume a green test suite means the contact information is
  still current.

## src/app/show/[id]/opengraph-image.tsx (next/og / satori rendering)

- This is the repo's first use of `next/og`'s `ImageResponse`: it renders a
  tree with satori, which has no CSS engine. Tailwind `className` strings
  and `var(--color-*)` custom properties are silently ignored, not an
  error — a component built for the DOM (`src/components/ui/Logo.tsx`'s
  `Monogram`, which sizes itself with `className` and defaults its wave
  colour to `var(--color-accent)`) can't be dropped in here as-is. Pull
  shared *data* instead (`src/lib/brand-mark.ts`'s path constants, used by
  both `Monogram` and this file) rather than duplicating literals a third
  time or assuming a ui/ component "just works" in a satori tree; check any
  future ui/ import here the same way.
- satori fetches a custom `fonts[]` entry and every `<img src>` itself
  during rendering, and throws on failure — there is no Next error
  boundary for a route handler like this, so an uncaught throw here is a
  bare 500 with no image at all, worse than a graceful branding-only
  fallback. Every fetch this file makes (the font, each avatar) must
  degrade to a fallback rather than propagate — but satori also throws if
  `fonts` is passed as an empty array ("No fonts are loaded"); a failed
  font fetch must omit the `fonts` option entirely, which falls back to
  next/og's own bundled default face, not pass `fonts: []`. This file
  pre-fetches each avatar itself and inlines it as a data URI specifically
  so satori never makes its own avatar fetch to fail mid-render.
- `host.avatarUrl` is the one place in the app a Bluesky profile field is
  fetched by the server rather than rendered by a browser (satori needs
  the bytes to rasterize the PNG). It's allowlisted here to `*.bsky.app` /
  `*.bsky.network` hosts as defense in depth, independent of the deployed
  Worker's `global_fetch_strictly_public` compatibility flag
  (`wrangler.jsonc`) that's the other thing standing between an
  attacker-chosen `avatarUrl` and an outbound fetch from the Worker. Check
  both are still true — the flag present, the allowlist intact — before
  changing how this file handles avatars.
- `cdn.bsky.app`'s image proxy defaults to serving WebP, which next/og's
  bundled resvg rasterizer cannot decode — not an error, a silently blank
  circle where the avatar should be, caught only by fetching a real
  `cdn.bsky.app` URL and looking at the rendered PNG (the demo seed's
  avatars are dicebear PNGs, so no unit test surfaced this). Bluesky's CDN
  honours an explicit encode via an `@<ext>` path suffix; `fetchableAvatarUrl()`
  rewrites the request to `@jpeg` for a `bsky.app` hostname before
  fetching, replacing any format suffix already on the stored URL. A raw
  `*.bsky.network` PDS blob host has no such proxy or suffix convention and
  is fetched as stored. Before trusting a next/og avatar/image render as
  correct, open the actual output PNG — a failed decode does not throw.

## android/.../ui/Common.kt (grouping a Compose icon+label as one accessibility element)

- `Modifier.semantics(mergeDescendants = true) { ... }` is not the Compose
  equivalent of SwiftUI's `.accessibilityElement(children: .ignore)`:
  `mergeDescendants` *merges* descendant nodes' own semantics (a child
  `Text`'s content) into the parent rather than discarding them, so an
  explicit `contentDescription` set alongside it can still get announced
  together with the child's own text (a double announcement under
  TalkBack). To fully replace descendant semantics with one explicit
  label, the way the iOS counterpart does, use
  `Modifier.clearAndSetSemantics { contentDescription = "..." }`
  (`androidx.compose.ui.semantics.clearAndSetSemantics`) instead. Hit when
  porting iOS's `Wordmark` (icon + text, one accessibility element) to
  Android's `Wordmark` in `Common.kt` for issue #157.

## src/lib/admin.ts (getPlatformActivity week-bucket boundary)

- The 12-week series queries compute `week = floor((now - col) / 7days)` in
  SQL and only keep buckets 0..11 (`seriesFromBuckets`, `WEEKS_OF_SERIES`).
  Admitting rows with `col >= seriesStartIso` (the naive range) lets a row
  whose timestamp lands exactly on `seriesStartIso` compute `week = 12` —
  inside the WHERE clause but outside the array `seriesFromBuckets` ever
  reads, so it is silently dropped from the output instead of landing in the
  oldest bucket (issue #178's review, round 1). Fixed by admitting `col >
  seriesStartIso` (strictly exclusive) so every admitted row's week is
  provably in 0..11. Any future "N buckets of fixed width, bucketed in SQL,
  consumed as a dense 0..N-1 array in JS" query needs the same exclusive
  lower bound, or a clamp where the array is built — the WHERE clause and
  the array's index range must agree exactly, not just be "close enough".

## src/components/SiteHeader.tsx and src/components/NocturneShell.tsx (brand link touch target)

- A fix that adds `min-h-touch` to a tappable element without `min-w-touch`
  keeps recurring in this repo (`AudienceRows` invite chip, `AddToCalendar`
  trigger — both above), and the site-brand `Link` in both files hit it a
  third time: on phones, `Wordmark compact`'s text span is `hidden
  sm:inline` (`src/components/ui/Logo.tsx`), so the link renders as just
  the bare `Monogram` (40px since issue #157's size bump, 32px before it)
  with no horizontal padding of its own — under 44px wide either way.
  Check both classes together, every time, on anything that collapses to
  an icon on narrow screens — `DESIGN.md`: "Touch targets are at least
  44px tall and wide (`min-h-touch`, `min-w-touch`) on every tappable
  thing."
