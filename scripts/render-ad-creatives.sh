#!/bin/zsh
# Renders the Reef Bloom house-ad creatives (AdMob campaign images) from
# assets/ads/template.html with headless Chrome. AdMob's limit is 150 KB per
# image, so the two iPad sizes are written as JPEG. Output: assets/ads/.
set -e
cd "$(dirname "$0")/.."
ICON="$PWD/assets/icon.png"
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROF="${TMPDIR:-/tmp}/rb-ad-render-profile"
render() { # name W H portrait|landscape scale reefHeightPx
  local out="assets/ads/$1" tmp="assets/ads/.$1.html"
  sed -e "s/__W__/$2/g;s/__H__/$3/g;s/__ORI__/$4/;s/__S__/$5/;s/__REEF__/$6/;s#__ICON__#$ICON#" assets/ads/template.html > "$tmp"
  "$CH" --headless=new --hide-scrollbars --disable-gpu --window-size=$2,$3 --force-device-scale-factor=1 \
    --virtual-time-budget=8000 --user-data-dir="$PROF" --screenshot="$PWD/$out.png" "file://$PWD/$tmp" >/dev/null 2>&1
  rm -f "$tmp"
  if [[ $7 == jpg ]]; then sips -s format jpeg -s formatOptions 88 "$out.png" --out "$out.jpg" >/dev/null; rm -f "$out.png"; out="$out.jpg"; else out="$out.png"; fi
  echo "$out $(stat -f%z "$out") bytes"
}
render reefbloom-320x480   320  480  portrait  0.92 95  png
render reefbloom-480x320   480  320  landscape 0.95 75  png
render reefbloom-768x1024  768  1024 portrait  2.2  210 jpg
render reefbloom-1024x768  1024 768  landscape 2.0  170 jpg
