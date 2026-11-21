---
name: mobile-apps
description: The Android (Kotlin, Jetpack Compose) and iOS (SwiftUI) clients of rabble.radio — which screens they have, which flows they share with the web app and through which API routes and LiveKit messages, the screen conventions both apps follow (theme tokens, fonts, cards, section labels, touch targets, wide layouts), and how to build and verify each. Load before touching android/ or ios/, before changing a web flow the apps also implement (join, stage, raised hands, reactions, on-air, music, replay, reminders, feedback, theme), or when asked for mobile parity.
---

# The mobile apps

Two native clients with the same scope, talking to the same API as the web
app. Neither has its own backend: every screen is a view over
`GET /api/...` plus a LiveKit room. The API is the contract; a mobile change
that needs server data gets a field added to an existing response, never a
mobile-only route.

| | Android | iOS |
|---|---|---|
| Code | `android/app/src/main/java/radio/rabble/android/` | `ios/Rabble/` |
| UI | Jetpack Compose + Material 3, `ui/*.kt` | SwiftUI, `Views/*.swift` |
| Theme | `ui/Theme.kt` (`RabbleColors`, `RabbleFonts`, `ThemePreference`) | `Theme.swift` (`RabbleColors`, `RabbleFont`, `Appearance`) |
| Shared widgets | `ui/Common.kt` | bottom of `Theme.swift` |
| API client | `data/RabbleApi.kt` (org.json, no kotlinx-serialization) | `Data/RabbleAPI.swift` (Codable) |
| Models | `data/Models.kt` | `Data/Models.swift` |
| Room state | inside `ui/ShowScreen.kt` (`RoomState`) | `Views/ShowModel.swift` (`ShowModel`, `ConnectedRoom`) |
| Navigation | `MainActivity.kt` (`NavHost`, `Routes`) | `Views/Navigation.swift` (`Route`, `Navigator`) |
| Audio | LiveKit Android SDK | LiveKit Swift SDK; `Views/Players.swift` for music and replay |
| Reminders | `Reminders.kt` (WorkManager, every 15 min) | `Reminders.swift` (BGAppRefresh + foreground) |
| Feedback | `ui/FeedbackDialog.kt`, `data/Diagnostics.kt` | `Views/FeedbackView.swift`, `Data/Diagnostics.swift` |
| Sign-in | `ui/LoginScreen.kt` (WebView) | `Views/LoginView.swift` (WKWebView) |

Both apps are small (under 4,000 lines each). Read the matching file on the
other platform before changing one; they were written to mirror each other,
down to the strings.

## Screens

Routes: `home` → `station/<tag>`, `show/<id>?autoJoin`, `me`, `login`.
"Start a show" lands in the room with `autoJoin` set. iOS also accepts the
launch arguments `-showId <id> -autoJoin` so a headless simulator can open a
room for a screenshot.

- **Home** (`HomeScreen.kt`, `HomeView.swift`): title "Shows"; sections
  `FOR YOU` (signed in, shows whose host or room the user follows),
  `ON AIR NOW`, `STATIONS` ("Browse shows by topic."), then the "Go live from
  your phone" card (signed out: "Sign in to start a show"). Top bar: sign in
  or avatar → Me, and the appearance toggle. Data: `GET /api/spaces`,
  `GET /api/me`.
- **Station** (`StationScreen.kt`, `StationView.swift`): shows carrying one
  category tag, filtered on the device from `GET /api/spaces`. Empty: "No shows in this station yet."
- **Show** (`ShowScreen.kt`, `ShowView.swift` + `ShowModel.swift`): the room.
  Header with title, host, ON AIR badge and the `ON STAGE` seats (empty
  seats read "Open seat"); `THE ROOM` panel with the join controls; for hosts
  `RAISED HANDS · n` with Invite buttons; `LISTENING · n` audience grid;
  reaction bar; music card (pre-show mood, host only); replay panel when the
  show is off air with a recording ("This show is off air."); Edit (host)
  opens the show-details sheet (Title, "What's the show about?"). Leaving a
  live room asks "Leave the show?" with Leave / Stay.
- **Me** (`MeScreen.kt`, `MeView.swift`): "My shows": `SHOWS YOU HOST`,
  `SHOWS YOU JOINED` (`GET /api/me/shows`), Log out, and on iOS the
  `APPEARANCE` picker (Android has the toggle on the home bar instead).
- **Login**: the web app's `/login` Bluesky OAuth flow in a web view. When
  the callback sets the session cookie the view closes and the cookie is
  shared with the API client. Nothing else is native; do not build a native
  login.
- **Feedback**: dialog with category (problem / idea / other) and message,
  `POST /api/feedback` with the captured context (screen, app version and
  build, base URL, room state: showId, role, connected, onAir, micOn,
  members, anonymousListeners, invitePending, recent errors).

Web-only: `/stations` index page, `/hosts`, `/downloads`, admin pages,
scheduling a show for later, recording management.

## Shared flows and their wire contract

Every flow below exists on web, Android and iOS. A change to one of them
lands on all three in the same PR, or the PR names the gap and files a
follow-up issue labelled for the other platforms (repository rule).

| Flow | Request | Realtime signal | Notes |
|---|---|---|---|
| Listen / join | `POST /api/spaces/<id>/join` → `token`, `wsUrl`, `iceServers`, `role` (`host`/`speaker`/`audience`), `onStage`, `anonymous` | – | Signed-out users may join as anonymous listeners. Pass `iceServers` to the SDK; off the LAN audio only works through those TURN servers. Button reads "Listen" (signed out) or "Join" (signed in), "Connecting…" while joining. |
| Mic | LiveKit local track | participant `isSpeaking` / mute | Only on stage. Ask for the permission at the moment of unmuting, never on launch. |
| Raise hand | LiveKit participant attribute `hand` = `"1"`, cleared with `""` | attributes changed | Listener-only; hidden for anonymous and on-stage users. Everyone sees a ✋ on that listener; hosts get the `RAISED HANDS` group. The hand drops when the person reaches the stage. |
| Stage | `POST /api/spaces/<id>/stage` with `action`: `invite` (+ `targetIdentity`), `leave`, `remove` (`accept` is still accepted but dormant — see `src/lib/stage.ts`); `GET …/stage` for status | data messages `stage_role_changed`, `stage_removed` | An invite brings the listener on stage immediately, muted — no Accept/Decline step. Each client derives `onStage` reactively from the participant's own LiveKit `canPublish` permission (refreshed on a permissions-changed event), never from a data message or the button pressed. Speakers get "Step down". |
| Reactions | `POST /api/spaces/<id>/reactions` `{emoji}` | data message `reaction` `{emoji, sender profile}` | Emoji set `👍 ❤️ 😂 🎉 👏` (server `REACTION_EMOJI`). Float the bare emoji from the sender's avatar for ~3.2 s; the sender floats their own locally without waiting. Signed-in only. |
| On air | `POST /api/spaces/<id>/live` `{action: "start" | "end"}` (host) | data message `on_air_changed` | Drives the ON AIR badge, listener counts on Home and the reminder fan-out. |
| Music | `PATCH /api/spaces/<id>` `{musicMood}` (host) | show refresh | Pre-show mood picker (host, off air). Each phone plays the mood's tracks (`/music/<file>`, list in `Music.kt` / `Music.swift`) locally and yields when someone publishes audio; nothing enters the room or the recording. |
| Show details | `PATCH /api/spaces/<id>` `{title, description, tags}` (host) | show refresh | Tags are the fixed category list in `src/lib/tags.ts`, mirrored in `Tags.kt` / `Tags` in `Theme.swift`. |
| Replay | `GET /api/spaces/<id>` → `replay.audioUrl` | – | Native audio player with the clock format `m:ss` / `h:mm:ss`. |
| Notify me | `POST /api/spaces/<id>/remind` `{on}`; `GET /api/me/reminders?due=1` | polled | The server keeps reminders. The app polls on a 15-minute floor plus on foreground, posts a local notification per due show, tapping it opens the room. A `🔔` suffix on the card pill marks reminded shows. |
| Feedback | `POST /api/feedback` | – | Context shape above. Keep the keys stable: the feedback-intake skill and the admin page read them. |
| Theme | local preference | – | System / Light / Dark cycling in that order. Keys: web `rabble-theme`, Android prefs `theme`, iOS `@AppStorage("appearance")`. |
| Profiles | `GET /api/users?identities=` | – | Resolve LiveKit identities to names and avatars in one batch per membership change; never per tile. |

Participant identity is the Bluesky DID for signed-in users and
`anon:<uuid>` otherwise; the host is the participant whose identity
equals `show.host.did`.

## Screen conventions

Both apps implement the brand in `docs/brand.md` (tokens and rationale in
`DESIGN.md`); the web tokens in `src/app/globals.css` are the source and the
two theme files mirror them.

- **Colours** only through `RabbleColors.X` (same names on both platforms:
  `bg`, `surface`, `surfaceRaised`, `ink`, `text`, `textSecondary`,
  `textTertiary`, `textOnInk`, `accent`, `accent2`, `highlight`, `border`,
  `divider`, `live`, `success`, `warning`, `error`, plus the `Muted`
  variants). No literal hex in a screen file; a new colour is added to both
  theme files and `globals.css` in one change. Material's `colorScheme` on
  Android is derived from the palette and is for Material widgets only.
- **Dark mode** is the inverted palette, chosen per user. Never force a
  scheme in a view (no `.preferredColorScheme(...)`, no hardcoded
  `isSystemInDarkTheme()` branches); read the palette.
- **Type**: display face (Fraunces Black) only for the wordmark, large
  titles and hero buttons; Inter for everything else. Android:
  `MaterialTheme.typography` (display/headline styles carry the serif).
  iOS: `RabbleFont.style(.headline)` etc., never `.font(.system(...))`.
- **Section labels** are upper-case captions in `textSecondary`:
  `SectionLabel("ON AIR NOW")`; counts append ` · n`.
- **Cards**: 16 padding, 8 corner radius, 1.5 `border` outline, `surface`
  fill (`Card {}` / `.card()`); content column capped at 1040 wide.
- **Pills** for status: `LiveBadge` ("ON AIR", `live` on `accentMuted`),
  `Pill("Replay")`, `Pill("Scheduled")`, `Pill("Off air")`.
- **Avatars** are round, `ink` fill with two-letter initials when there is
  no picture; a 2-wide ring marks speaking.
- **Touch targets**: every button at least 44 high (48 for the primary
  room actions); full-width primary buttons in the room panel.
- **Layout**: single column on phones. Android treats ≥ 600 dp as wide
  (`isWideScreen()`) and switches the home list to a grid; iOS relies on
  `contentMaxWidth`. The room is a scrolling column on phones; keep the
  reaction bar reachable above the home indicator / navigation bar.
- **States**: `Loading` (accent spinner), `ErrorPanel("Something went
  wrong", message, Retry)`, and a plain sentence for empty lists ("No shows
  yet."). Network failures never crash a screen; they land in the error
  panel or a `notice` line in the room.
- **Strings** match across the three clients word for word (Listen, Join,
  Connecting…, Step down, Not now, Leave the show?, Notify me). Copy the
  web string when adding one.
- **Accessibility**: icon-only buttons carry a content description /
  accessibility label (the hand button reads "Raise hand to speak" /
  "Lower hand"); the wordmark is one accessibility element.

## Building and verifying

- **Android**: `cd android && nix-shell` then `./gradlew assembleDebug`
  (AGP 9.5, Gradle 9.8 via the wrapper, compileSdk 37; do not change these
  versions to fix a build). Emulator recipe in `android/README.md`; point a
  build at a dev server with `-PrabbleBaseUrl=http://10.0.2.2:3000`. In a
  discobox the SDK is usually absent: a compile may work with the `nix`
  feature and is slow; there is no emulator. Say in the PR what was built.
- **iOS**: macOS only (`ios/README.md`: sync to the Mac mini, `xcodebuild`
  against the iPhone 17 Pro simulator, `simctl` screenshots, the
  `-showId … -autoJoin` launch arguments). Unverifiable from a box or from
  Linux; say so rather than guessing. New Swift files under `ios/Rabble/`
  are picked up by the synchronized project; no project edit is needed.
- **Screenshots** for a PR or a design proposal: phone portrait, light and
  dark, home and the room with at least one speaker. Android:
  `adb exec-out screencap -p`; iOS: `xcrun simctl io booted screenshot`.
- **Web first**: when a flow changes, verify it on the web with the
  `verify-recipes` skill and the local LiveKit server, then mirror. The
  mobile apps can be pointed at the same dev server.
- **Tests**: Android has a JVM unit-test suite (`android/app/src/test/`),
  starting with `data/Models.kt`'s `fromJson` parsing; run it with
  `cd android && nix-shell --run './gradlew testDebugUnitTest'` (no emulator
  needed). iOS still has none. The server side of every shared flow is
  covered in `tests/api` and `tests/lib`; a wire change adds or updates
  those tests. Keep old response fields when adding new ones so older
  installed app builds keep working.

## Gotchas

- Android JSON parsing is hand-written in `Models.kt` (`fromJson`); a new
  field needs a parser line, and missing fields must default, not throw.
- iOS `Codable` models fail the whole decode on a missing non-optional
  field: new fields are optional.
- The LiveKit `audioswitch` dependency comes from JitPack (already in the
  Gradle repositories); do not remove that repository.
- The Android google_apis emulator image cannot remount `/system`; use
  `10.0.2.2` and port-forwarding to reach a local server.
- Music and replay are local players (`Players.swift`, `MusicCard` in
  `ShowScreen.kt`) that pause while the room has live audio; add playback
  there rather than a second player.
- TURN: without `iceServers` from the join response, devices off the LAN
  connect but hear nothing. Never drop that field from the join call.
