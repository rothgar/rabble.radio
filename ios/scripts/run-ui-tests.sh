#!/bin/zsh
# Build and run the RabbleUITests target against the simulator, headless.
# Runs on the Mac mini (see README). Mirrors testflight.sh's shape; no
# keychain unlock needed since the test target, like the debug build, is
# unsigned/simulator-only.
set -u
cd "$(dirname "$0")/.."

OUT=build
RESULT_BUNDLE="$OUT/ui-tests.xcresult"
rm -rf "$RESULT_BUNDLE"
mkdir -p "$OUT"

echo "==> running RabbleUITests"
xcodebuild test -project Rabble.xcodeproj -scheme Rabble \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath "$OUT" -resultBundlePath "$RESULT_BUNDLE" \
  2>&1 | tee "$OUT/ui-tests.log" | grep -E '^(\*\*|error|Test Suite|==>)'
STATUS=$pipestatus[1]

if [[ -d "$RESULT_BUNDLE" ]]; then
  echo "==> result bundle at $RESULT_BUNDLE"
else
  echo "==> no result bundle produced" >&2
fi

if [[ $STATUS -eq 0 ]]; then
  echo "==> PASS"
else
  echo "==> FAIL (xcodebuild exited $STATUS)"
fi
exit $STATUS
