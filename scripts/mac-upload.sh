#!/bin/sh
# Upload a Mac Catalyst archive to App Store Connect with the API key.
#
#   npm run mac:upload -- "$HOME/Library/Developer/Xcode/Archives/2026-10-28/Reef Bloom Mac 2026-10-28-18.15.xcarchive"
#   npm run mac:upload            # newest "Reef Bloom Mac" archive
#
# Two steps, unlike ios-upload.sh: xcodebuild's own upload of a Mac package
# fails every time with "Account credentials have expired" (it is not the
# token flake iOS sees — six retries never got through), while exporting the
# signed App.pkg works and altool uploads it with the same key first try.
set -e
KEY_ID="${ASC_KEY_ID:-T45LR52KTG}"
ISSUER_ID="${ASC_ISSUER_ID:-dc3aa120-e313-4678-8c22-c2fb328944f4}"
KEY_PATH="${ASC_KEY_PATH:-$HOME/.private_keys/AuthKey_$KEY_ID.p8}"
ARCHIVE="$1"
if [ -z "$ARCHIVE" ]; then
  ARCHIVE=$(ls -td "$HOME/Library/Developer/Xcode/Archives"/*/"Reef Bloom Mac"*.xcarchive 2>/dev/null | head -1)
fi
[ -d "$ARCHIVE" ] || { echo "no Mac archive at: $ARCHIVE" >&2; exit 1; }
[ -f "$KEY_PATH" ] || { echo "API key not found: $KEY_PATH" >&2; exit 1; }
TMP=$(mktemp -d)
cat > "$TMP/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>export</string>
  <key>teamID</key><string>BA9VTC969X</string>
  <key>signingStyle</key><string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
PLIST
echo "Exporting: $ARCHIVE"
xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist "$TMP/ExportOptions.plist" \
  -exportPath "$TMP/out" -allowProvisioningUpdates \
  -authenticationKeyPath "$KEY_PATH" -authenticationKeyID "$KEY_ID" -authenticationKeyIssuerID "$ISSUER_ID" \
  > "$TMP/export.log" 2>&1 || { grep -i error "$TMP/export.log" | grep -v 'search path'; rm -rf "$TMP"; exit 1; }
PKG=$(ls "$TMP/out"/*.pkg | head -1)
echo "Uploading: $PKG"
# altool finds the key in ~/.private_keys by its id.
xcrun altool --upload-app --type macos -f "$PKG" --apiKey "$KEY_ID" --apiIssuer "$ISSUER_ID"
rm -rf "$TMP"
