#!/usr/bin/env bash
# Sync ios/ to the Mac mini, run the headless RabbleUITests suite there, and
# pull the result bundle back. Mirrors scripts/ios-testflight.sh's shape.
# Usage: scripts/ios-test.sh
set -uo pipefail
cd "$(dirname "$0")/.."

rsync -a --delete --exclude build --exclude .build --exclude shots ios/ m1:rabble-ios/ \
  || { echo "rsync to the Mac mini failed" >&2; exit 1; }

ssh m1 "cd rabble-ios && scripts/run-ui-tests.sh"
STATUS=$?

mkdir -p ios/build
rsync -a m1:rabble-ios/build/ui-tests.xcresult ios/build/ 2>/dev/null || true

exit "$STATUS"
