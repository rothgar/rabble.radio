# Development shell for the native Android app.
#
#   cd android && nix-shell
#   ./gradlew assembleDebug            # build (wrapper pins Gradle 9.8)
#   emulator -avd rabble -no-window &  # headless emulator (KVM)
#   adb install -r app/build/outputs/apk/debug/app-debug.apk
#
# The Android SDK is unfree; this shell opts in explicitly.
{ pkgs ? import <nixpkgs> {
    config = {
      allowUnfree = true;
      android_sdk.accept_license = true;
    };
  }
}:
let
  androidComposition = pkgs.androidenv.composeAndroidPackages {
    cmdLineToolsVersion = "latest";
    platformToolsVersion = "latest";
    buildToolsVersions = [ "35.0.0" "36.0.0" ];
    platformVersions = [ "35" "37" ];
    includeEmulator = true;
    emulatorVersion = "latest";
    includeSystemImages = true;
    systemImageTypes = [ "google_apis" ];
    abiVersions = [ "x86_64" ];
    includeNDK = false;
  };
  sdk = androidComposition.androidsdk;
in
pkgs.mkShell {
  buildInputs = [ sdk pkgs.jdk17 pkgs.gradle_9 ];
  ANDROID_HOME = "${sdk}/libexec/android-sdk";
  ANDROID_SDK_ROOT = "${sdk}/libexec/android-sdk";
  JAVA_HOME = pkgs.jdk17.home;
  # aapt2 from the SDK is linked against the Nix store; tell Gradle to use it.
  GRADLE_OPTS = "-Dorg.gradle.project.android.aapt2FromMavenOverride=${sdk}/libexec/android-sdk/build-tools/36.0.0/aapt2";
}
