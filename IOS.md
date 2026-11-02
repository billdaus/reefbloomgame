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

The Pearl Shop sells five consumable pearl packs through StoreKit 2 via
`@capgo/native-purchases`. The product IDs, pearl amounts and fallback prices
live in `src/3d/iap.js` and must match App Store Connect (Monetization →
In-App Purchases) exactly:

| Product ID (suffix) | Pearls | Price |
|---|---|---|
| `…reefbloom.pearls10` | 10 | $0.99 |
| `…reefbloom.pearls35` | 35 | $2.99 |
| `…reefbloom.pearls60` | 60 | $4.99 |
| `…reefbloom.pearls150` | 150 | $9.99 |
| `…reefbloom.starter30` | 30 | $1.99, **once** ("First Bloom") |

`pearls150` ("Pearls Reef Fund") and `starter30` ("First Bloom") were created
in App Store Connect by API on Nov 2 2026 with en-US text, USA base price,
all territories, the Pearl Market review screenshot and promotional images;
they are **not yet submitted** — they go to review with the next app version
(App Store Connect → the version → In-App Purchases and Subscriptions → add
them before submitting). First Bloom is a one-time welcome price: `once: true`
in `PEARL_PACKS`, remembered per device in `localStorage` (`rb3d_iap_once`)
and hidden from the shop once bought. A brand-new reef on the native app also
gets a one-time First Bloom banner when the orientation ends (or two minutes
in), remembered in `rb3d_starter_banner`. On the website a separate
"Reef Bloom is on the App Store" card appears after four minutes of play, at
most every three days (`rb3d_store_nudge`); never on the Desktop Edition.

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
Intel and Apple-silicon Macs (macOS 10.15 Catalina and up), same bundle ID,
saves, sign-in and pearl packs (on macOS 12+; see below). To make it possible the project uses **CocoaPods** rather than
Swift Package Manager: Capacitor's Swift package is a prebuilt binary with no
Catalyst slice, while the pods build Capacitor, Cordova and the purchases
plugin from source. Open `ios/App/App.xcworkspace` (not the .xcodeproj) and
run `pod install` in `ios/App` after `npm install` (`cap sync` does it too).
`ios/App/Podfile`'s `post_install` turns Catalyst on for every pod.

Mac-specific pieces:

- `project.pbxproj`: `SUPPORTS_MACCATALYST`, `TARGETED_DEVICE_FAMILY 1,2,6`
  (Mac idiom), `MACOSX_DEPLOYMENT_TARGET 10.15`, hardened runtime and
  `App/Mac.entitlements` (App Sandbox + outgoing network) for the macosx SDK.
- **Catalina.** iOS stays at 15.0, but the Catalyst build sets
  `IPHONEOS_DEPLOYMENT_TARGET[sdk=macosx*] = 13.1` (Catalyst 13.1 = macOS
  10.15) in the project and, via the Podfile's `post_install`, in every pod.
  Capacitor 8 and `@capgo/native-purchases` assume iOS 15, so `patches/`
  (applied by `patch-package` on `npm install`) wrap their iOS 14/15 API uses
  in availability guards: WKWebView's media-capture delegate, `UTType`,
  `limitsNavigationsToAppBoundDomains`, `isiOSAppOnMac`, and the whole
  StoreKit 2 surface of the purchases plugin. On macOS 10.15–11 the plugin
  loads but every purchase call rejects ("need macOS 12 or newer") and
  `isBillingSupported` is false, so the Pearl Shop shows no packs there; on
  macOS 12+ nothing changes. When either package is upgraded, re-apply the
  idea if the patch no longer applies: build with
  `npm run mac:run` and fix whatever "only available in Mac Catalyst 14/15"
  errors appear. The arm64 slice is stamped 14.0 (Apple silicon starts at 11
  anyway); `LSMinimumSystemVersion` in the built app is 10.15.
- `ReefBridgeViewController.swift` appends `ReefBloomMac` to the WebView user
  agent on Catalyst (and on "Designed for iPad"), so `app.html` labels the
  footer "Mac edition". `AppDelegate.swift` keeps the window ≥ 900×600.
- `Info.plist` carries `LSApplicationCategoryType` (Games) for the Mac App Store.

```bash
npm run mac:run        # Debug Catalyst build, ad-hoc signed, opened on this Mac
npm run mac:archive    # Release Catalyst archive into Xcode's Archives folder
npm run mac:upload -- "<Mac archive>.xcarchive"   # export the signed .pkg, upload it with altool
```

App Store Connect needs the **macOS platform on the app record** before the
first Mac upload is accepted. It was added Oct 28 2026 by API (POST
/v1/appStoreVersions with platform MAC_OS — the UI's "+ platform" does the
same). Mac uploads go through `scripts/mac-upload.sh`, not `ios-upload.sh`:
xcodebuild's own upload of a Mac package fails every time with "Account
credentials have expired", so the script exports the signed App.pkg and hands
it to `xcrun altool --upload-app --type macos` with the same API key. Mac
builds then show up under TestFlight → macOS and the macOS version gets its
own listing (description, keywords, 2880×1800 screenshots) and review.

## Desktop Edition (Electron) — older Macs, Linux, Windows

Catalyst reaches macOS 10.15 (see above), but there is no App Store for
Linux or Windows, and no signed build for Macs that cannot run the Mac App
Store version, so `desktop/` wraps the same `dist-app` build in an unsigned
**Electron 32** shell: the Desktop Edition. Electron 32 is the last Electron
that runs on macOS 10.15 Catalina (Liam's mid-2012 unibody MacBook Pro tops
out there); 33 dropped it — never bump past 32. Pages are served from a custom
`app://reefbloom` origin (Chromium refuses ES-module scripts over `file://`;
a fixed origin keeps the saves' localStorage stable), the user agent carries
`ReefBloomDesktop` so the Home page says "Desktop edition", Cognito sign-in
and cloud saves work (they talk straight to AWS), and the Pearl Market shows
its web message (no StoreKit). No ads (no Capacitor).

```bash
npm run desktop:mac     # Intel DMG + zip, macOS 10.15+   → desktop/dist
npm run desktop:linux   # AppImage, x64 (a .deb needs a Linux host: macOS's ar breaks fpm) → desktop/dist
npm run desktop:win     # NSIS installer, x64             → desktop/dist
```

Everything is unsigned (no Developer ID / Authenticode certificates). macOS:
copied over by USB it just opens; downloaded, Catalina says the developer
can't be verified — right-click → Open once. Windows: SmartScreen's "More
info → Run anyway". `desktop/res/icon.icns|png` are the icons; `desktop/app`
and `desktop/dist` are build outputs and ignored.

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
the rewarded unit id in `REWARDED_UNIT` in `src/3d/ads.js`. Both were created
Oct 29 2026 in AdMob → Apps → Reef Bloom (account pub-8911863192466816, the
same one as Dragonperch): app id `ca-app-pub-8911863192466816~5268277071`,
"Ad Clam Rewarded" unit `ca-app-pub-8911863192466816/1321740318`. The app
is still *Requires review* / *Not verified* in AdMob: `public/app-ads.txt`
is live at reefbloomgame.com but Google's crawl had not picked it up yet
(re-check from the app's settings page; review itself takes a few days and
ad serving is limited until it passes). Release builds now use the real
unit; dev builds (`import.meta.env.DEV`) always use Google's sample unit
(`usingTestAds()`), which looks real and pays nothing.

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
