# Reef Bloom — iOS App

The iOS app is a [Capacitor](https://capacitorjs.com) shell around the same game
that runs on the web. The native Xcode project lives in `ios/` and is committed
to the repo; the game's web build is copied into it by `cap sync`.

- **App ID:** `com.billdaus.reefbloom`
- **App name:** Reef Bloom
- **Dependencies:** Swift Package Manager (no CocoaPods needed)
- **Requires:** Node 22+ (`nvm use 22`), and Xcode 16+ on a Mac to build

## Day-to-day workflow

The game code is shared — there is no separate mobile codebase. The existing
portrait/tablet layouts in `src/layout.js` apply inside the app too. After any
game change:

```bash
npm run ios:sync   # vite build + copy web assets into ios/
```

On a Mac, to build and run:

```bash
npm run ios:open   # sync + open the project in Xcode
```

Then pick a Simulator (or your device) in Xcode and press Run. First run on a
device needs a signing team selected under **App target → Signing & Capabilities**
(a free Apple ID works for personal devices; App Store distribution needs the
$99/yr Apple Developer Program).

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

- Google Analytics is automatically skipped when the game runs inside the app
  shell (see the guard in `index.html`), so web stats stay clean and the App
  Store privacy form stays simple.
- Saves use `localStorage`, which iOS persists inside the app's WebView data.
  If saves ever need to be more durable, swap `src/save.js` to the
  `@capacitor/preferences` plugin.
- The `public/` website pages (about, newsletter, etc.) get bundled into the
  app too. Harmless, but they can be excluded later if app size ever matters.
