# Rabble for Android

Native Android client (Kotlin, Jetpack Compose, LiveKit Android SDK) that lists
stations, shows the shows in a station, and joins a show's live audio room.

Sign-in reuses the web app's Bluesky OAuth flow inside a WebView; the session
cookie it sets is shared with the API client.

## Build

```bash
cd android
nix-shell                      # Android SDK 35, emulator, JDK 17, Gradle
./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
```

Point the app at a different server:

```bash
./gradlew assembleDebug -PrabbleBaseUrl=http://10.0.2.2:3000   # host machine from the emulator
```

## Run in the emulator

```bash
avdmanager create avd -n rabble -k "system-images;android-35;google_apis;x86_64" -d pixel_7
emulator -avd rabble -no-window -no-audio -gpu swiftshader_indirect &
adb wait-for-device
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n radio.rabble.android/.MainActivity
adb exec-out screencap -p > screen.png
```

Note: LiveKit audio uses UDP to the MetalLB address on the homelab LAN, so an
emulator or device off that network connects to the room but will not hear
audio until a public TURN/UDP path exists.
