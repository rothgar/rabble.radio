# Rabble for iOS

Native iOS client (SwiftUI, LiveKit Swift SDK) with the same scope as the
Android app: the home list of shows (for you, on air, popular, stations), the
account screen with hosted and joined shows, and the show screen with the
stage, audience, reactions, invites, on-air control, pre-show music, replays
and "Notify me" reminders (polled through BGAppRefresh and on foreground).
Sign-in reuses the web app's Bluesky OAuth flow in a WKWebView; the session
cookie it sets is synced into `HTTPCookieStorage` for the API client.
Signed-out users can listen anonymously.

`Rabble.xcodeproj` is committed (Xcode 16 synchronized-folder format, so new
Swift files under `Rabble/` are picked up automatically). `project.yml` is the
equivalent [XcodeGen](https://github.com/yonaskolb/XcodeGen) spec for anyone
who prefers to regenerate it.

## Build on the Mac mini (`ssh m1`)

From a checkout of this repo on the Mac (or `rsync` the `ios/` folder over):

```bash
cd ios
xcodebuild -project Rabble.xcodeproj -scheme Rabble \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath build build

# run in the simulator
xcrun simctl boot "iPhone 17 Pro" || true
xcrun simctl install booted build/Build/Products/Debug-iphonesimulator/Rabble.app
xcrun simctl launch booted radio.rabble.ios
xcrun simctl io booted screenshot screen.png

# headless simulators cannot be tapped; these launch arguments open a show
# (and join it) straight away
xcrun simctl launch booted radio.rabble.ios -showId demo_space_1 -autoJoin
```

Xcode 27 no longer ships a Simulator.app GUI alongside the command-line
tools on this machine, so verification is screenshot-based.

Point the app at another server by changing `RABBLE_BASE_URL` in
`project.yml` (or passing `RABBLE_BASE_URL=http://localhost:3000` to
xcodebuild).

Note: on the homelab LAN the simulator reaches the LiveKit SFU directly over
UDP. Off the LAN it relays audio through Cloudflare TURN using the per-join
`iceServers` in the join response, which the app passes to the LiveKit SDK.
If the server has no TURN key configured, off-LAN devices connect to the room
but hear nothing.
