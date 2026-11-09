#!/usr/bin/env bash
# Rebuilds the Legacy edition — the original Reef Bloom prototype from the
# repo's first commit — into public/legacy/, where Vite copies it verbatim to
# /legacy/ on the website. The output is committed, so this only needs
# re-running if the snapshot itself should change.
#
# Patches applied to the historical source before building:
#   • save keys are namespaced (reef-bloom-legacy-*) so the old save format
#     can never overwrite today's Classic saves, which share the originals;
#   • a Legacy badge with a link back to the current game, and a title.
set -euo pipefail
COMMIT=73d424b     # "Initial commit — Reef Bloom game", 2026-03-27
ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
trap 'git -C "$ROOT" worktree remove --force "$WORK" 2>/dev/null || true' EXIT
git -C "$ROOT" worktree add -q --detach "$WORK" "$COMMIT"
cd "$WORK"
npm ci --silent
node - <<'JS'
const fs = require('fs');
function patch(file, pairs) {
  let s = fs.readFileSync(file, 'utf8');
  for (const [a, b] of pairs) {
    if (s.split(a).length !== 2) throw new Error(`${file}: expected exactly one match for ${a.slice(0, 40)}`);
    s = s.replace(a, b);
  }
  fs.writeFileSync(file, s);
}
patch('src/save.js', [
  ["const SLOT_KEYS        = ['reef-bloom-save-0', 'reef-bloom-save-1', 'reef-bloom-save-2'];",
   "// Legacy build: its own keys, so it never touches today's Classic saves.\nconst SLOT_KEYS        = ['reef-bloom-legacy-save-0', 'reef-bloom-legacy-save-1', 'reef-bloom-legacy-save-2'];"],
  ["const CURRENT_SLOT_KEY = 'reef-bloom-current-slot';", "const CURRENT_SLOT_KEY = 'reef-bloom-legacy-current-slot';"],
]);
patch('index.html', [
  ['  <title>Reef Bloom</title>', '  <title>Reef Bloom — Legacy</title>'],
  ["    .slp-erase-btn.confirming { background: rgba(220,40,40,0.7); color: #fff; border-color: rgba(240,80,80,0.9); }\n  </style>",
   `    .slp-erase-btn.confirming { background: rgba(220,40,40,0.7); color: #fff; border-color: rgba(240,80,80,0.9); }

    /* Legacy badge — this is the original March 2026 prototype, frozen. */
    #legacy-badge {
      position: fixed; left: 50%; bottom: 10px; transform: translateX(-50%);
      z-index: 300; display: flex; align-items: center; gap: 10px;
      font-size: 12px; letter-spacing: 0.5px; color: rgba(220,240,255,0.85);
      background: rgba(4,18,50,0.78); border: 1px solid rgba(100,200,255,0.3);
      border-radius: 999px; padding: 6px 14px; backdrop-filter: blur(8px);
      white-space: nowrap; max-width: calc(100vw - 24px); overflow: hidden; text-overflow: ellipsis;
    }
    #legacy-badge b { color: #ffd740; letter-spacing: 2px; text-transform: uppercase; font-size: 11px; }
    #legacy-badge a { color: #9fe0ff; text-decoration: none; font-weight: 600; }
    #legacy-badge a:hover { color: #fff; text-decoration: underline; }
    .sp-legacy-note { font-size: 12px; color: rgba(255,215,64,0.85); letter-spacing: 1px; margin-top: 6px; }
  </style>`],
  ['      <div class="sp-sub">Place coral. Hatch fish. Watch life flourish.</div>\n      <button class="sp-btn" id="start-btn">Begin</button>',
   '      <div class="sp-sub">Place coral. Hatch fish. Watch life flourish.</div>\n      <div class="sp-legacy-note">Legacy edition — the original prototype, March 2026</div>\n      <button class="sp-btn" id="start-btn">Begin</button>'],
  ['  <script type="module" src="/src/main.js"></script>',
   '  <div id="legacy-badge"><b>Legacy</b> The original Reef Bloom, exactly as it first shipped · <a href="/">Play today\'s Reef Bloom →</a></div>\n\n  <script type="module" src="/src/main.js"></script>'],
]);
JS
npx vite build
rm -rf "$ROOT/public/legacy"
mkdir -p "$ROOT/public/legacy"
cp -r dist/. "$ROOT/public/legacy/"
echo "Legacy build written to public/legacy/"
