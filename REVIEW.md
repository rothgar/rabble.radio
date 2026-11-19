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
