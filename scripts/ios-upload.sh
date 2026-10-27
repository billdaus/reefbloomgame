#!/bin/sh
# Upload an Xcode archive to App Store Connect (TestFlight) with the team's
# App Store Connect API key — no Apple Account in Xcode needed.
#
#   npm run ios:upload -- "$HOME/Library/Developer/Xcode/Archives/2026-10-27/Reef Bloom 2026-10-27-17.50.xcarchive"
#   npm run ios:upload            # newest archive in Xcode's Archives folder
#
# The key (.p8) lives in ~/.private_keys and is never committed. It must have
# the Admin role: cloud-managed signing refuses Developer/App Manager keys.
set -e
KEY_ID="${ASC_KEY_ID:-T45LR52KTG}"
ISSUER_ID="${ASC_ISSUER_ID:-dc3aa120-e313-4678-8c22-c2fb328944f4}"
KEY_PATH="${ASC_KEY_PATH:-$HOME/.private_keys/AuthKey_$KEY_ID.p8}"
ARCHIVE="$1"
if [ -z "$ARCHIVE" ]; then
  ARCHIVE=$(ls -td "$HOME/Library/Developer/Xcode/Archives"/*/*.xcarchive 2>/dev/null | head -1)
fi
[ -d "$ARCHIVE" ] || { echo "no archive at: $ARCHIVE" >&2; exit 1; }
[ -f "$KEY_PATH" ] || { echo "API key not found: $KEY_PATH" >&2; exit 1; }
TMP=$(mktemp -d)
cat > "$TMP/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>BA9VTC969X</string>
  <key>signingStyle</key><string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
PLIST
echo "Uploading: $ARCHIVE"
xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist "$TMP/ExportOptions.plist" \
  -exportPath "$TMP/export" -allowProvisioningUpdates \
  -authenticationKeyPath "$KEY_PATH" -authenticationKeyID "$KEY_ID" -authenticationKeyIssuerID "$ISSUER_ID" \
  | grep -E "Progress|Upload|EXPORT|error" || true
rm -rf "$TMP"
