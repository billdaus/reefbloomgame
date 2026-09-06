# Reef Bloom — iOS App

The iOS app is a [Capacitor](https://capacitorjs.com) shell around the **3D
edition only** — Classic and the website pages stay web-only. The native Xcode
project lives in `ios/` and is committed to the repo; the app's web build is
copied into it by `cap sync`.

- **App ID:** `com.billdaus.reefbloom`
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
(`CURRENT_PROJECT_VERSION`). The scheme is **major.minor.patch** starting at
**1.0.0 (1)**; each TestFlight upload needs a higher build number, so bump
before every archive:

```bash
npm run version:bump          # 1.0.0 (1) → 1.0.1 (2); also updates the Home footer + package.json
npm run version:bump minor    # → 1.1.0
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
