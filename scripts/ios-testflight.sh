#!/usr/bin/env bash
# Sync ios/ to the Mac mini and run the TestFlight upload there.
# Usage: scripts/ios-testflight.sh [BUILD_NUMBER=...] [MARKETING_VERSION=...] [SKIP_UPLOAD=1]
set -euo pipefail
cd "$(dirname "$0")/.."
rsync -a --delete --exclude build --exclude .build --exclude shots ios/ m1:rabble-ios/
# -t so the keychain unlock prompt inside the script can reach the terminal.
ssh -t m1 "cd rabble-ios && env $* scripts/testflight.sh"
