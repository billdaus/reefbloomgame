#!/bin/sh
# Prints the xcodebuild flags that let -allowProvisioningUpdates sign with
# the team's App Store Connect API key (so archives never need the Apple
# Account in Xcode). Used by the ios:archive / mac:archive scripts.
KEY_ID="${ASC_KEY_ID:-T45LR52KTG}"
ISSUER_ID="${ASC_ISSUER_ID:-dc3aa120-e313-4678-8c22-c2fb328944f4}"
KEY_PATH="${ASC_KEY_PATH:-$HOME/.private_keys/AuthKey_$KEY_ID.p8}"
[ -f "$KEY_PATH" ] && printf -- '-authenticationKeyPath %s -authenticationKeyID %s -authenticationKeyIssuerID %s' "$KEY_PATH" "$KEY_ID" "$ISSUER_ID"
