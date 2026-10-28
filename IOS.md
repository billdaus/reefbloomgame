# Reef Bloom — iOS App

The iOS app is a [Capacitor](https://capacitorjs.com) shell around the **3D
edition only** — Classic and the website pages stay web-only. The native Xcode
project lives in `ios/` and is committed to the repo; the app's web build is
copied into it by `cap sync`.

- **App ID:** `com.defenestrationtech.games.reefbloom`
- **App name:** Reef Bloom
- **Dependencies:** Swift Package Manager (no CocoaPods needed)
- **Requires:** Node 22+ (`nvm use 22`), and Xcode 16+ on a Mac to build

## Day-to-day workflow

The game code is shared — there is no separate mobile codebase. The existing
portrait/tablet layouts in `src/layout.js` apply inside the app too. After any
game change:

```bash
npm run ios:sync   # vite build --mode app (→ dist-app/) + copy into ios/
```

`vite build --mode app` is a separate build from the website's `vite build`: it
takes `app.html` (the app-only Home screen, emitted as the app's `index.html`)
plus `threed.html`, skips `public/`, and writes to `dist-app/`. The website
build in `dist/` is byte-identical to before and never includes `app.html`.

App-only behaviour for the 3D page lives in `APP_SHELL_INJECT` in
`vite.config.js` and is spliced into `threed.html` at build time: the
`app-shell` class, status-bar safe-area offsets for the fixed HUD chrome, the
"⌂ Home" link replacing "← Classic", and a save flush on pagehide/background.
`threed.html` and `src/3d/` carry none of it, so the web game is unaffected.

## Home screen

`app.html` is the app's title screen: three reef cards read straight from the
3D edition's localStorage slots (level, 🫧, coral and fish counts, last opened,
🎁 Daily Pack / 🥚 hatch-ready badges), a Continue button for the current slot,
and a daily Bubbles line. Tapping a card sets `reefbloom_3d_slot`, stamps
`reefbloom_app_played_s<n>`, and opens `threed.html`. The version string in
its footer is hand-maintained alongside the badge in `threed.html`.

On a Mac, to build and run:

```bash
npm run ios:open   # sync + open the project in Xcode
```

Then pick a Simulator (or your device) in Xcode and press Run. First run on a
device needs a signing team selected under **App target → Signing & Capabilities**
(a free Apple ID works for personal devices; App Store distribution needs the
$99/yr Apple Developer Program).

## Versions and TestFlight

The App Store version lives in the Xcode project (`MARKETING_VERSION`, shown
as `CFBundleShortVersionString`) with an integer build number
(`CURRENT_PROJECT_VERSION`). The scheme is **Major.Minor.Patch**, chosen by
what the release contains:

| Number | Meaning | Example |
|---|---|---|
| Major | Big release / major changes | 2.0.0 |
| Minor | New features or content | 1.1.0 |
| Patch | Bug fixes / maintenance | 1.0.1 |

Every TestFlight upload needs a higher build number, so bump before every
archive — but a re-upload of the same release keeps its version:

```bash
npm run version:bump          # patch: 1.1.0 (11) → 1.1.1 (12); also updates the Home footer + package.json
npm run version:bump minor    # → 1.2.0   (any new feature or content)
npm run version:bump major    # → 2.0.0
npm run version:bump build    # same version, build +1  (re-upload of the same release)
npm run version:bump 2.0.0    # exact
```

Then archive and upload. Either from Xcode (`npm run ios:open`, pick your team
under Signing & Capabilities the first time, destination "Any iOS Device",
Product → Archive, Distribute App → TestFlight), or from the terminal:

```bash
npm run ios:archive   # build:app + cap sync + xcodebuild archive into Xcode's Archives folder
```

The archive appears in Xcode's Organizer (Window → Organizer), where
Distribute App → TestFlight uploads it. Builds show in App Store Connect's
TestFlight tab ~10–30 minutes later; internal testers need no review.

Commit the bump and tag it (`git tag ios-v1.0.1`) so the store build maps to
a commit.

## Uploading without Xcode's sign-in

Uploads go through the team's App Store Connect API key, so they never
depend on the Apple Account in Xcode (whose session expires and cannot be
seen from the command line):

```bash
npm run ios:upload                       # newest archive in Xcode's Archives folder
npm run ios:upload -- "<path>.xcarchive" # a specific archive
```

The key file lives at `~/.private_keys/AuthKey_<KEY_ID>.p8` (never committed).
It must have the **Admin** role — cloud-managed signing refuses Developer and
App Manager keys with "Cloud signing permission error". Key ID and Issuer ID
are in `scripts/ios-upload.sh` and can be overridden with `ASC_KEY_ID`,
`ASC_ISSUER_ID` and `ASC_KEY_PATH`. Generate keys at App Store Connect →
Users and Access → Integrations → App Store Connect API.

## In-app purchases

The Pearl Shop sells three consumable pearl packs through StoreKit 2 via
`@capgo/native-purchases`. The product IDs, pearl amounts and fallback prices
live in `src/3d/iap.js` and must match App Store Connect (Monetization →
In-App Purchases) exactly:

| Product ID (suffix) | Pearls | Price |
|---|---|---|
| `…reefbloom.pearls10` | 10 | $0.99 |
| `…reefbloom.pearls35` | 35 | $2.99 |
| `…reefbloom.pearls60` | 60 | $4.99 |

Inside the app the shop shows the App Store's own names and localized prices
and grants pearls only after a verified transaction; on the website (no
store) the rows keep their original stub behaviour. The plugin is imported
lazily so the web bundle never loads it. Promotional images for App Store
Connect are rendered by `node scripts/render-iap-images.mjs` into `assets/iap/`.

One-time setup:

1. Xcode → App target → Signing & Capabilities → **+ Capability → In-App Purchase**.
2. App Store Connect → Business → Agreements: the **Paid Apps** agreement must
   be active (banking + tax), or StoreKit returns no products at all.
3. Create the three products (type *Consumable*) with a localization, price and
   review screenshot so each reaches *Ready to Submit*.
4. Users and Access → Sandbox → Test Accounts: make a sandbox tester, then on
   the iPad sign in under Settings → App Store → Sandbox Account.

For the Simulator, add a StoreKit configuration file (File → New → File →
StoreKit Configuration File, "Sync with App Store Connect") and select it under
the scheme's Run → Options → StoreKit Configuration; purchases then work with
no sandbox account. TestFlight builds use the sandbox automatically.

## Mac edition

The Mac edition is a **Mac Catalyst** build of the same app — one binary for
Intel and Apple-silicon Macs (macOS 12+), same bundle ID, saves, sign-in and
pearl packs. To make it possible the project uses **CocoaPods** rather than
Swift Package Manager: Capacitor's Swift package is a prebuilt binary with no
Catalyst slice, while the pods build Capacitor, Cordova and the purchases
plugin from source. Open `ios/App/App.xcworkspace` (not the .xcodeproj) and
run `pod install` in `ios/App` after `npm install` (`cap sync` does it too).
`ios/App/Podfile`'s `post_install` turns Catalyst on for every pod.

Mac-specific pieces:

- `project.pbxproj`: `SUPPORTS_MACCATALYST`, `TARGETED_DEVICE_FAMILY 1,2,6`
  (Mac idiom), `MACOSX_DEPLOYMENT_TARGET 12.0`, hardened runtime and
  `App/Mac.entitlements` (App Sandbox + outgoing network) for the macosx SDK.
- `ReefBridgeViewController.swift` appends `ReefBloomMac` to the WebView user
  agent on Catalyst (and on "Designed for iPad"), so `app.html` labels the
  footer "Mac edition". `AppDelegate.swift` keeps the window ≥ 900×600.
- `Info.plist` carries `LSApplicationCategoryType` (Games) for the Mac App Store.

```bash
npm run mac:run        # Debug Catalyst build, ad-hoc signed, opened on this Mac
npm run mac:archive    # Release Catalyst archive into Xcode's Archives folder
npm run ios:upload -- "<Mac archive>.xcarchive"   # upload it (see below)
```

App Store Connect needs the **macOS platform added to the app record** once
(App Store → Reef Bloom → "+" platform → macOS) before the first Mac upload
is accepted; after that Mac builds show up under TestFlight → macOS and ship
with the iOS version.

## Older Macs (macOS 10.15 Catalina) — the Electron build

Mac Catalyst stops at macOS 12, so Macs that top out at Catalina (Liam's
mid-2012 unibody MacBook Pro) get a separate, unsigned **Electron 32** shell
in `mac-legacy/` around the same `dist-app` build: Electron 32 is the last
Electron that runs on 10.15 (33 dropped it — never bump past 32). Pages are
served from a custom `app://reefbloom` origin (Chromium refuses ES-module
scripts over `file://`; a fixed origin keeps the saves' localStorage stable),
the user agent carries `ReefBloomMac` so the Home page says "Mac edition",
Cognito sign-in and cloud saves work (they talk straight to AWS), and the
Pearl Market shows its web message (no StoreKit). No ads (no Capacitor).

```bash
npm run mac:legacy     # build:app → mac-legacy/app → electron-builder: Intel DMG + zip in mac-legacy/dist
```

The DMG is unsigned (no Developer ID certificate): copied over by USB it just
opens; downloaded, Catalina will say the developer can't be verified — right-
click → Open once. `mac-legacy/res/icon.icns` is the app icon; `mac-legacy/app`
and `mac-legacy/dist` are build outputs and ignored.

## Ads

Rewarded video ads, served by **Google AdMob** through
`@capacitor-community/admob`, appear as **ad clams** — Classic's clam, in the
reef. Every 45 s there is a 35% chance a golden clam settles on a free tile
near where the camera looks (first roll 90 s after the reef loads); it waits
three minutes, then sinks away. Tap it → "Watch & open" → the ad plays → the
clam opens on two rolled cards: riches (60% Bubble Energy 40–80, 40% pearls
2–4) and a find (4% Common Pack, 20% common egg, 16% seedling voucher of a
recorded coral, otherwise 6–14 polyps). Five clams a day
(`REWARDS_PER_DAY` in `src/3d/ads.js`), counted per reef in the save as
`ads: { d, n }`. A clam only appears while an ad is actually loaded, and the
payout follows the SDK's *Rewarded* event, never the tap. Code: the
"🐚 Ad clams" block in `src/3d/ReefScene3D.js`.

Where ads exist: the iOS app on iPhone and iPad only. The website never loads
the plugin (lazy import, like `iap.js`). The Mac edition has no ad SDK at all —
Google ships no Mac Catalyst slice of the Google Mobile Ads SDK, so
`ios/App/Podfile`'s `post_install` compiles the plugin's sources for iOS only
and strips the ad frameworks from the Catalyst link line; `ads.supported()`
also says no when the user agent carries `ReefBloomMac`.

Policy: the app is rated 4+ but is **not** in the Kids Category
(`kidsAgeBand` is null), so Apple's Kids advertising rules don't apply; the
clam is a free reward, not a purchase, so the loot-box disclosure doesn't
either. Requests are non-personalised (`npa`), the App Tracking Transparency
prompt is never shown, content is capped at the *General* rating. When the
ads build is submitted, the age-rating questionnaire's "advertising" answer
must flip to yes (it is `false` today; the rating stays 4+), and the privacy
label should list *Advertising Data* and *Device ID* as "used for third-party
advertising, not linked to you". `public/privacy.html` carries the disclosure.

Ids: the app id goes in `ios/App/App/Info.plist` (`GADApplicationIdentifier`),
the rewarded unit id in `REWARDED_UNIT` in `src/3d/ads.js`. Both come from
AdMob → Apps → Reef Bloom (account pub-8911863192466816, the same one as
Dragonperch; `public/app-ads.txt` already lists it). Until a real unit id is
set, every build serves Google's sample test ads (`usingTestAds()`), which
look real and pay nothing. Dev builds always use the test unit.

Testing: `window.__rb3dFakeAds` lets a headless browser run the clam flow
against a fake plugin (`window.__rb3d.spawnClam()` / `openClam()` /
`clamState()` in dev builds), but the bridge round trip is only proved on the
simulator — look for `⚡️ To Native -> AdMob initialize` and
`prepareRewardVideoAd` followed by `TO JS`, and the test ad on screen.

## Building without a Mac

The **iOS Build (Simulator)** GitHub Actions workflow
(`.github/workflows/ios-build.yml`) runs on a macOS runner. Trigger it manually
from the Actions tab — it verifies the project compiles and uploads an unsigned
Simulator `.app` artifact. Signed device/App Store builds still require a Mac
with Xcode (or a service like Ionic Appflow / Codemagic with your signing
certificates).

## App icon & splash

Source art is `assets/icon.svg`. To regenerate after editing it:

```bash
node scripts/render-app-assets.mjs        # SVG → icon.png / splash*.png
npx @capacitor/assets generate --ios      # PNGs → all iOS sizes in ios/
```

## Notes

- The 3D page adds an `app-shell` class on `<html>` when it runs inside
  Capacitor and turns the "← Classic" link into "⌂ Home".
  `index.html` keeps equivalent guards (no analytics, no cookie banner) in case
  it is ever bundled again.
- The WebView runs edge-to-edge (`contentInset: never`, `viewport-fit=cover`), so
  the landing nav and the 3D HUD offset themselves by `env(safe-area-inset-top)`
  to stay clear of the status bar. That inset is 0 on the web.
- Saves use `localStorage`, which iOS persists inside the app's WebView data.
  If saves ever need to be more durable, swap `src/save.js` to the
  `@capacitor/preferences` plugin.
- The `public/` website pages (about, newsletter, etc.) get bundled into the
  app too. Harmless, but they can be excluded later if app size ever matters.
