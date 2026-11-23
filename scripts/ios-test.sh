#!/usr/bin/env bash
# Sync ios/ to the Mac mini, run the headless RabbleUITests suite there, and
# pull the result bundle back. Mirrors scripts/ios-testflight.sh's shape.
# RABBLE_BASE_URL, if set, is forwarded to run-ui-tests.sh (see its header);
# left unset, it defaults to a dev server on the Mac mini itself.
# Usage: scripts/ios-test.sh
set -uo pipefail
cd "$(dirname "$0")/.."

rsync -a --delete --exclude build --exclude .build --exclude shots ios/ m1:rabble-ios/ \
  || { echo "rsync to the Mac mini failed" >&2; exit 1; }

remote_cmd=$(printf 'cd rabble-ios && RABBLE_BASE_URL=%q scripts/run-ui-tests.sh' "${RABBLE_BASE_URL:-}")
ssh m1 "$remote_cmd"
STATUS=$?

mkdir -p ios/build
rsync -a m1:rabble-ios/build/ui-tests.xcresult ios/build/ 2>/dev/null || true

exit "$STATUS"
