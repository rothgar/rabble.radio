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

## Bottom-fixed UI (PersistentShowBar, ReminderToasts)

- `ActiveRoomProvider` exposes a single `barVisible` flag (session connected,
  not on the session's own `/show/[id]` page) that both `PersistentShowBar`
  and `ReminderToasts` read, and that also drives the bottom padding
  reserved around `children` in `ActiveRoomProvider`. Any new fixed-bottom
  UI must read `barVisible` too — either to reposition itself above the bar
  (as `ReminderToasts` does) or to stay out from under it — rather than
  assuming it has the bottom of the viewport to itself.
