// Generates mobile/index.html from index.html — the /mobile/ phone version.
// Single source of truth: the root page. This runs before vite dev/build
// (see package.json scripts); mobile/ is gitignored as a build artifact.
//
// Transforms applied:
//   - sets window.__REEF_FORCE_MOBILE__ so layout.js forces the phone layout
//   - canonical link to the root (avoids duplicate-content SEO)
//   - title/description marked as the mobile edition
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const src = readFileSync('index.html', 'utf8');

let out = src;

// Force-mobile flag + canonical, injected right after <head> opens
out = out.replace(
  '<head>',
  `<head>
  <script>window.__REEF_FORCE_MOBILE__ = true;</script>
  <link rel="canonical" href="https://reefbloomgame.com/" />`
);

out = out.replace(
  '<title>Reef Bloom</title>',
  '<title>Reef Bloom — Mobile</title>'
);

out = out.replace(
  'content="Reef Bloom is a free browser game',
  'content="Reef Bloom Mobile — the phone edition of the free browser game'
);

// The version-switch link points back to the desktop edition
out = out.replace(
  '<a class="sp-version-link" id="sp-version-link" href="/mobile/">📱 Phone version</a>',
  '<a class="sp-version-link" id="sp-version-link" href="/">🖥️ Desktop version</a>'
);

if (out === src) {
  console.error('[gen-mobile] no transforms applied — check index.html markers');
  process.exit(1);
}

mkdirSync('mobile', { recursive: true });
writeFileSync('mobile/index.html', out);
console.log('[gen-mobile] wrote mobile/index.html');
