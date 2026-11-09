#!/bin/zsh
# Archive the iOS app, sign it with the team's App Store distribution profile
# and upload it to TestFlight. Runs on the Mac mini (see README).
#
# Needs an App Store Connect API key with the App Manager (or Admin) role:
#   ~/.config/rabble/testflight.env   ASC_KEY_ID=XXXXXXXXXX
#                                     ASC_ISSUER_ID=xxxxxxxx-xxxx-...
#   ~/.appstoreconnect/private_keys/AuthKey_<ASC_KEY_ID>.p8
#
# BUILD_NUMBER overrides the CFBundleVersion (defaults to a UTC timestamp so
# every upload is newer than the last); MARKETING_VERSION overrides the
# user-facing version. SKIP_UPLOAD=1 archives and exports without uploading.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${ASC_ENV_FILE:-$HOME/.config/rabble/testflight.env}"
[[ -f "$ENV_FILE" ]] && source "$ENV_FILE"
: "${ASC_KEY_ID:?set ASC_KEY_ID (App Store Connect API key id)}"
: "${ASC_ISSUER_ID:?set ASC_ISSUER_ID (App Store Connect issuer id)}"
ASC_KEY_PATH="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8}"
[[ -f "$ASC_KEY_PATH" ]] || { echo "missing API key file $ASC_KEY_PATH" >&2; exit 1; }

# Each ssh login has its own security session, so the login keychain must be
# unlocked in this very session for Xcode to store and use signing keys. Run
# the script with `ssh -t` so the password prompt can reach you.
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"
if ! security show-keychain-info "$KEYCHAIN" >/dev/null 2>&1; then
  echo "==> unlocking the login keychain (enter the Mac login password)"
  security unlock-keychain "$KEYCHAIN"
  security set-keychain-settings "$KEYCHAIN"
fi

BUILD_NUMBER="${BUILD_NUMBER:-$(date -u +%Y%m%d%H%M)}"
OUT=build/testflight
ARCHIVE=$OUT/Rabble.xcarchive
rm -rf "$OUT"; mkdir -p "$OUT"
AUTH=(-allowProvisioningUpdates -allowProvisioningDeviceRegistration
      -authenticationKeyPath "$ASC_KEY_PATH"
      -authenticationKeyID "$ASC_KEY_ID"
      -authenticationKeyIssuerID "$ASC_ISSUER_ID")
VERSION_ARGS=(CURRENT_PROJECT_VERSION="$BUILD_NUMBER")
[[ -n "${MARKETING_VERSION:-}" ]] && VERSION_ARGS+=(MARKETING_VERSION="$MARKETING_VERSION")

echo "==> archiving build $BUILD_NUMBER"
xcodebuild -project Rabble.xcodeproj -scheme Rabble -configuration Release \
  -destination 'generic/platform=iOS' -derivedDataPath build \
  -archivePath "$ARCHIVE" "${AUTH[@]}" "${VERSION_ARGS[@]}" archive \
  | grep -E '^(\*\*|error|warning: .*(sign|provision)|==>)' || true
[[ -d "$ARCHIVE" ]] || { echo "archive failed" >&2; exit 1; }

EXPORT_PLIST=ExportOptions.plist
if [[ "${SKIP_UPLOAD:-0}" == 1 ]]; then
  EXPORT_PLIST=$OUT/ExportOptions.local.plist
  sed 's#<string>upload</string>#<string>export</string>#' ExportOptions.plist > "$EXPORT_PLIST"
  echo "==> exporting .ipa to $OUT (no upload)"
else
  echo "==> exporting and uploading to App Store Connect"
fi
xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportPath "$OUT" \
  -exportOptionsPlist "$EXPORT_PLIST" "${AUTH[@]}" \
  | grep -E '^(\*\*|error|Upload|Export)' || true
ls -la "$OUT"
echo "==> done: build $BUILD_NUMBER"
