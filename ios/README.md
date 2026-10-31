# Rabble for iOS

Native iOS client (SwiftUI, LiveKit Swift SDK) with the same scope as the
Android app: list stations, browse a station's shows, and listen to or join a
show's live audio room. Sign-in reuses the web app's Bluesky OAuth flow in a
WKWebView; the session cookie it sets is synced into `HTTPCookieStorage` for
the API client. Signed-out users can listen anonymously.

The Xcode project is described by `project.yml` for
[XcodeGen](https://github.com/yonaskolb/XcodeGen); the generated
`Rabble.xcodeproj` is not committed.

## Build on the Mac mini (`ssh m1`)

One-time: accept the Xcode license (needs an admin password):

```bash
sudo xcodebuild -license accept
```

Then, from a checkout of this repo on the Mac:

```bash
cd ios
# XcodeGen via Swift Package Manager (no Homebrew needed)
git clone --depth 1 https://github.com/yonaskolb/XcodeGen.git /tmp/XcodeGen
swift build -c release --package-path /tmp/XcodeGen
/tmp/XcodeGen/.build/release/xcodegen generate

xcodebuild -project Rabble.xcodeproj -scheme Rabble \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -derivedDataPath build build

# run in the simulator
xcrun simctl boot "iPhone 16" || true
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
