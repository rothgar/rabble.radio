# Rabble for iOS

Native iOS client (SwiftUI, LiveKit Swift SDK) with the same scope as the
Android app: list stations, browse a station's shows, and listen to or join a
show's live audio room. Sign-in reuses the web app's Bluesky OAuth flow in a
WKWebView; the session cookie it sets is synced into `HTTPCookieStorage` for
the API client. Signed-out users can listen anonymously.

`Rabble.xcodeproj` is committed (Xcode 16 synchronized-folder format, so new
Swift files under `Rabble/` are picked up automatically). `project.yml` is the
equivalent [XcodeGen](https://github.com/yonaskolb/XcodeGen) spec for anyone
who prefers to regenerate it.

## Build on the Mac mini (`ssh m1`)

One-time: accept the Xcode license (needs an admin password):

```bash
sudo xcodebuild -license accept
```

Then, from a checkout of this repo on the Mac:

```bash
cd ios
xcodebuild -project Rabble.xcodeproj -scheme Rabble \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath build build

# run in the simulator
xcrun simctl boot "iPhone 17" || true
xcrun simctl install booted build/Build/Products/Debug-iphonesimulator/Rabble.app
xcrun simctl launch booted radio.rabble.ios
xcrun simctl io booted screenshot screen.png
```

Point the app at another server by changing `RABBLE_BASE_URL` in
`project.yml` (or passing `RABBLE_BASE_URL=http://localhost:3000` to
xcodebuild).

Note: LiveKit audio uses UDP to the MetalLB address on the homelab LAN, so a
simulator or device off that network connects to the room but will not hear
audio until a public TURN/UDP path exists.
