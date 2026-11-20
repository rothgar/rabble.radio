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

## src/lib/host-follows.ts and src/lib/push.ts (host-follow due/push race)

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
- `takeDueHostFollows` (src/lib/host-follows.ts) picks one live space per
  followed host with no ordering when a host is live on two spaces at once,
  and marks the `HostFollow` row notified regardless — so the follower never
  hears about the second room until the host's next go-live resets things.
  Space selection is now ordered (`createdAt` ascending) so which one wins
  is at least deterministic; the second-room gap itself is still open if a
  multi-show host going live twice at once turns out to be reachable.
- `acceptStageInvite` (src/lib/stage.ts) is a second call site into the same
  `pushHostFollowersOnAir` read-then-write race described above: it now
  fires on a stage-accept while the show is already live (`space.isLive`
  gates it — not on every accept, e.g. not during the pre-show hold), for a
  guest going on-air as a speaker, not only on a host's own go-live. The same
  `GET /api/me/reminders?due=1` poll can land between `markSpeaker` and the
  push path's `resetHostFollowNotifications`/query/`updateMany` cycle and
  double-notify the guest's own follower. Any future caller of
  `pushHostFollowersOnAir` (host-live or guest-accept) shares this window —
  don't assume the push and poll paths for `HostFollow` are mutually
  exclusive from either call site.

## Bottom-fixed UI (PersistentShowBar, ReminderToasts)

- `ActiveRoomProvider` exposes a single `barVisible` flag (session connected,
  not on the session's own `/show/[id]` page) that both `PersistentShowBar`
  and `ReminderToasts` read, and that also drives the bottom padding
  reserved around `children` in `ActiveRoomProvider`. Any new fixed-bottom
  UI must read `barVisible` too — either to reposition itself above the bar
  (as `ReminderToasts` does) or to stay out from under it — rather than
  assuming it has the bottom of the viewport to itself.
