# App Store screenshots

Regenerates the ten captioned App Store screenshots (five iPhone 6.5", five
iPad 13") from the live 3D build, using a seeded level-12 reef so every shot
shows a populated game. Re-run whenever the UI in a shot changes — App Review
checks that screenshots match the app.

```bash
npm run dev                                   # in one terminal (port 5173)
npm i --no-save playwright-core               # once; drives the installed Google Chrome
node scripts/store-shots/shots.mjs /tmp/rb-shots          # raw captures
node scripts/store-shots/caption.mjs /tmp/rb-shots /tmp/rb-store   # captioned set
```

Upload the files in `/tmp/rb-store` to App Store Connect **one at a time, in
numeric order** — a multi-file upload lands in reverse order, and the first
three are the ones shown on install sheets.

The capture hides page chrome that isn't part of the store story (menu row,
back link, hint bar, Bubbles' speech, dev badge) and the species palette for
the two hero shots. It never adds anything the app doesn't show.
