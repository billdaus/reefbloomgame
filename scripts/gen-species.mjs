// Generates public/species.html — the website's Species Guide — from the game's
// own data, so the page can never drift from what the game actually ships.
// Runs before vite dev/build (see package.json); the output is committed too.
//
// Sources:
//   src/constants.js            every shared coral, plant, fish and decor spec
//   src/3d/ReefScene3D.js       the 3D-only corals (Golden Tree + Legendary/Mythic),
//                               the REAL_SPECIES set, and the lantern corals
//   src/systems/EventSystem.js  the seasonal calendar (names + yearly windows)
// The 3D file can't be imported outside a browser, so its blocks are read as text.
import { readFileSync, writeFileSync } from 'node:fs';

// constants.js pulls in layout.js, which reads the window at import time.
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: '', maxTouchPoints: 0, platform: '' }, configurable: true });
globalThis.window = { innerWidth: 1024, innerHeight: 768, addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), navigator: globalThis.navigator };
globalThis.document = { documentElement: { clientWidth: 1024 }, addEventListener() {} };
const C = await import('../src/constants.js');

const scene = readFileSync('src/3d/ReefScene3D.js', 'utf8');
const events = readFileSync('src/systems/EventSystem.js', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

// ── 3D-only corals, read from the scene source ───────────────────────────────
const localBlock = scene.slice(scene.indexOf('const GOLDEN_SPEC = {'), scene.indexOf('const LOCAL_CORALS = ['));
const str = (block, key) => { const m = block.match(new RegExp(`\\b${key}:\\s*(['"])((?:\\\\.|(?!\\1).)*)\\1`)); return m ? m[2].replace(/\\'/g, "'") : ''; };
const num = (block, key) => { const m = block.match(new RegExp(`\\b${key}:\\s*(\\d+)`)); return m ? Number(m[1]) : undefined; };
const localCorals = localBlock.split(/(?=\bL\(\{|\bconst GOLDEN_SPEC = \{)/).filter(b => /\bid:\s*'/.test(b)).map(b => ({
  id: str(b, 'id'), name: str(b, 'name'), scientific: str(b, 'scientific'), tier: str(b, 'tier') || 'legendary',
  tall: /\btall:\s*true/.test(b), blocksB: /\bblocksB:\s*true/.test(b), unlockLevel: num(b, 'unlockLevel') ?? 1,
  biome: str(b, 'biome') || 'coral', wildNote: str(b, 'wildNote'), only3d: true,
}));
// The Golden Tree's tier is set on its own line; the L() corals default to legendary
// and the mythic block says so.
const mythicStart = localBlock.indexOf('const MYTHIC_SPECS');
for (const s of localCorals) {
  const at = localBlock.indexOf(`id: '${s.id}'`);
  if (s.id !== 'goldenTree' && at > mythicStart) s.tier = 'mythic';
}

const realSet = new Set([...scene.slice(scene.indexOf('const REAL_SPECIES = new Set(['), scene.indexOf('const isRealSpecies')).matchAll(/'(\w+)'/g)].map(m => m[1]));
const lanternSet = new Set([...(scene.match(/const LANTERN_CORALS = new Set\(\[([^\]]*)\]/)?.[1] ?? '').matchAll(/'(\w+)'/g)].map(m => m[1]));

// ── Seasonal calendar ────────────────────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const md = (d) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
const eventDefs = {};
for (const m of events.matchAll(/id:\s*'(\w+)',\s*name:\s*'([^']+)',[\s\S]*?startDate:\s*'([\d-]+)',\s*endDate:\s*'([\d-]+)'/g)) {
  eventDefs[m[1]] = { name: m[2], window: `${md(m[3])} – ${md(m[4])}`, start: m[3].slice(5) };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const TIER_ORDER = ['common', 'uncommon', 'rare', 'superRare', 'epic', 'legendary', 'mythic'];
const TIER_HEX = { common: '#b0bec5', uncommon: '#ab47bc', rare: '#42a5f5', superRare: '#66bb6a', epic: '#ffd54f', legendary: '#ff7043', mythic: '#ef5350' };
const stretch = (l) => (l <= 1 ? 1 : 2 * l - 1);   // the 3D edition's level curve
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const BIOME = { coral: C.BIOMES.coral, seagrass: C.BIOMES.seagrass, deepTwilight: C.BIOMES.deepTwilight };
function biomesOf(spec) {
  if (lanternSet.has(spec.id)) return ['coral', 'seagrass', 'deepTwilight'];
  const b = spec.biome;
  if (!b || b === 'coral') return ['coral'];
  if (b === 'both') return ['coral', 'seagrass'];
  return Array.isArray(b) ? b : [b];
}
function primaryBiome(spec) {
  if (spec.id === 'lanternCoral') return 'coral';
  const b = spec.biome;
  if (!b || b === 'coral' || b === 'both') return 'coral';
  if (Array.isArray(b)) return b.includes('coral') ? 'coral' : b[0];
  return b;
}
const byOrder = (a, b) => (a.unlockLevel ?? 1) - (b.unlockLevel ?? 1) || TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || a.name.localeCompare(b.name);
const badge = (tier) => `<span class="tier-badge" style="color:${TIER_HEX[tier]};border-color:${TIER_HEX[tier]}55;background:${TIER_HEX[tier]}1f">${esc(C.TIER_LABEL[tier] ?? tier)}</span>`;
const lv = (spec) => { if (spec.eventId) return '<small>event shop</small>'; const l = spec.unlockLevel ?? 1; return l <= 1 ? 'Lv 1' : `Lv ${l} <small>/ ${stretch(l)}</small>`; };
const tag = (t, title = '') => `<span class="tag" title="${esc(title)}">${t}</span>`;

function nameCell(spec) {
  const extra = biomesOf(spec).length > 1 ? ` <span class="bio">${biomesOf(spec).map(b => BIOME[b].icon).join('')}</span>` : '';
  return `${esc(spec.name)}${extra}${spec.only3d ? ' ' + tag('3D', 'Only in the 3D edition') : ''}`;
}
function notes(spec, kind) {
  kind = spec.layer ? 'fish' : 'coral';   // mixed tables (events, pearls) hold both
  const bits = [];
  if (spec.scientific) bits.push(`<em>${esc(spec.scientific)}</em>`);
  bits.push(realSet.has(spec.id) ? tag('🌍 real', 'A real species — the Ocean Journal marks it') : tag('fiction', 'Invented for Reef Bloom'));
  if (kind === 'coral') {
    if (spec.tall) bits.push(tag('tall', 'Tall coral — small (Layer A) fish steer around it'));
    if (spec.blocksB) bits.push(tag('blocks B', 'Blocks the big (Layer B) swimmers too'));
    if (lanternSet.has(spec.id)) bits.push(tag('🏮 lantern', 'Lights the water after dark, in every biome'));
    else if (C.BIOLUM_SPECIES.has(spec.id)) bits.push(tag('✨ glows', 'Bioluminescent after dark'));
    if (spec.shelter || spec.homeFor) bits.push(tag('🏠 shelter', 'Fish shelter in it'));
  } else {
    bits.push(tag(`layer ${spec.layer}`, spec.layer === 'A' ? 'Small fish — avoids all tall coral' : 'Big swimmer — avoids only coral that blocks B'));
    if (spec.grazer) bits.push(tag('🌿 grazer', 'Feeds on seagrass for bonus energy'));
    if (spec.cleaner) bits.push(tag('🧽 cleaner', 'Cleans the reef'));
    if (spec.nocturnal) bits.push(tag('🌙 nocturnal', 'Out after dark'));
    if (C.BIOLUM_SPECIES.has(spec.id)) bits.push(tag('✨ glows', 'Bioluminescent after dark'));
  }
  if (spec.wildNote) bits.push(`<span class="wild">${esc(spec.wildNote)}</span>`);
  return bits.join(' ');
}
function cost(spec, kind) {
  kind = spec.layer ? 'fish' : 'coral';
  if (spec.pearlCost) return `${spec.pearlCost} 💎`;
  if (spec.polypCost) return `${spec.polypCost} 🪸`;
  if (spec.eventId) return 'event 🎟';
  const c = (kind === 'coral' ? C.CORAL_COST : C.FISH_COST)[spec.tier];
  return c != null ? `${c} 🫧` : '—';
}
function table(rows, kind) {
  if (!rows.length) return '<p class="section-intro"><em>Nothing here yet.</em></p>';
  return `<table><thead><tr><th>Species</th><th>Tier</th><th>Unlock</th><th>Cost</th><th>Notes</th></tr></thead><tbody>`
    + rows.sort(byOrder).map(s => `<tr><td>${nameCell(s)}</td><td>${badge(s.tier)}</td><td class="lv">${lv(s)}</td><td class="cost">${cost(s, kind)}</td><td>${notes(s, kind)}</td></tr>`).join('\n')
    + '</tbody></table>';
}

// ── Gather ───────────────────────────────────────────────────────────────────
const corals = [...Object.values(C.CORAL_SPECIES), ...localCorals];
const fish = Object.values(C.FISH_SPECIES);
const decor = Object.values(C.DECOR_SPECIES ?? {});
const standard = (s) => !s.pearlCost && !s.eventId && !s.utility;
const coralIn = (b) => corals.filter(s => standard(s) && primaryBiome(s) === b);
const fishIn = (b) => fish.filter(s => standard(s) && primaryBiome(s) === b);
const pearlSpecies = [...corals.filter(s => s.pearlCost && !s.eventId), ...fish.filter(s => s.pearlCost && !s.eventId)];
const utility = corals.filter(s => s.utility);
const eventSpecies = [...corals, ...fish].filter(s => s.eventId);
// Calendar order; species whose event was retired (no longer on the schedule) sort last.
const eventIds = [...new Set(eventSpecies.map(s => s.eventId))].sort((a, b) => (eventDefs[a]?.start ?? '99').localeCompare(eventDefs[b]?.start ?? '99'));
const eventTitle = (id) => eventDefs[id]
  ? `${esc(eventDefs[id].name)} <span class="when">${esc(eventDefs[id].window)}</span>`
  : `Retired: ${esc(id.replace(/_\d{4}$/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))} <span class="when">no longer scheduled — kept by players who earned it</span>`;
const realCount = [...corals, ...fish].filter(s => realSet.has(s.id)).length;
const total = corals.length + fish.length;

const section = (title, intro, body) => `\n    <h2>${title}</h2>\n    <p class="section-intro">${intro}</p>\n    ${body}\n`;
const sub = (title, body) => `\n    <h3>${title}</h3>\n    ${body}\n`;

let content = `
    <h1>Species Guide</h1>
    <p class="tagline">Every coral, plant and fish in Reef Bloom — ${total} species, generated from the game itself &nbsp;&middot;&nbsp; v${esc(pkg.version)}</p>

    <div class="stats">
      <div><b>${corals.length}</b><span>corals &amp; plants</span></div>
      <div><b>${fish.length}</b><span>fish &amp; friends</span></div>
      <div><b>${realCount}</b><span>real species 🌍</span></div>
      <div><b>${localCorals.length}</b><span>3D-only corals</span></div>
      <div><b>${Object.keys(eventDefs).length}</b><span>seasonal events</span></div>
    </div>

    <p>Both editions of Reef Bloom — the original browser game and the 3D reef on the web, iPhone and iPad — share this catalogue. The 3D edition adds ${localCorals.length} corals of its own (marked ${tag('3D')}) and stretches the level curve: a species that unlocks at Classic level <b>n</b> unlocks at 3D level <b>2n&nbsp;&minus;&nbsp;1</b>, shown in the Unlock column as <span class="lv">Lv n <small>/ 3D</small></span>. Biomes unlock in the same way: the Seagrass Basin at Classic Lv ${C.SEAGRASS_UNLOCK_LEVEL} <small>/ ${stretch(C.SEAGRASS_UNLOCK_LEVEL)}</small>, the Deep Twilight at Lv ${C.DEEP_TWILIGHT_UNLOCK_LEVEL} <small>/ ${stretch(C.DEEP_TWILIGHT_UNLOCK_LEVEL)}</small>.</p>

    <h2>Rarity Tiers</h2>
    <p class="section-intro">Seven tiers, colour-coded the same way in the game. Rarer coral earns more Bubble Energy per tick; rarer fish lift Harmony further. Prices are the standard 🫧 Bubble Energy cost — a few species are sold for 💎 pearls at Skip-7's Pearl Market or earned with 🎟 event tokens instead.</p>
    <table class="tiers"><thead><tr><th>Tier</th><th>Coral</th><th>Fish</th><th>How you find them</th></tr></thead><tbody>
${TIER_ORDER.map(t => `      <tr><td>${badge(t)}</td><td class="cost">${C.CORAL_COST[t] ?? '—'} 🫧</td><td class="cost">${C.FISH_COST[t] ?? '—'} 🫧</td><td>${{
  common: 'Known from the start.', uncommon: 'Early surveys and eggs.', rare: 'Surveys, eggs and packs.', superRare: 'Deeper surveys; Super Rare eggs and packs.',
  epic: 'Epic eggs and packs; late surveys.', legendary: 'Legendary packs and eggs — or, for coral, a Deep Twilight survey.', mythic: 'Mythic packs are never sold: level-ups only, from Lv 23 in 3D.',
}[t]}</td></tr>`).join('\n')}
    </tbody></table>
`;

for (const [b, intro] of [
  ['coral', 'The sunlit shallows: stony reef-builders that host symbiotic algae, and the small schooling fish that shelter among them.'],
  ['seagrass', 'Underwater meadows and kelp instead of stony coral, grazed by herbivores that turn seagrass into bonus energy.'],
  ['deepTwilight', 'Below the light: slow-growing deep corals, bioluminescent fish, and the oldest animals in the game.'],
]) {
  const bi = BIOME[b];
  content += section(`${bi.icon} ${esc(bi.name)}`, intro,
    sub(b === 'seagrass' ? 'Plants &amp; Coral' : 'Coral', table(coralIn(b), 'coral'))
    + sub(b === 'seagrass' ? 'Fish &amp; Grazers' : 'Fish', table(fishIn(b), 'fish')));
}

content += section('🤖 Pearl Market', "Skip-7's counter sells these for pearls, never for Bubble Energy. A purchase is a voucher: the species then places free, once.",
  table(pearlSpecies, 'coral').replace('<th>Notes</th>', '<th>Notes</th>'));

content += section('🎉 Seasonal Events', 'Each festival returns on the same dates every year with its own exclusive species, bought at the Event Shop with event tokens. Exclusives you have already earned stay on your reef.',
  eventIds.map(id => sub(eventTitle(id), table(eventSpecies.filter(s => s.eventId === id), 'coral'))).join(''));

if (utility.length || decor.length) {
  content += section('🪸 Utility &amp; Decor', 'Working corals paid in polyps — cleaning stations, vaults, shelters — and the decorations that dress the sand.',
    (utility.length ? sub('Utility Coral', table(utility, 'coral')) : '')
    + (decor.length ? sub('Decor', `<table><thead><tr><th>Item</th><th>Tier</th><th>Unlock</th><th>Cost</th><th>Notes</th></tr></thead><tbody>`
      + decor.slice().sort(byOrder).map(s => `<tr><td>${esc(s.name)}</td><td>${badge(s.tier)}</td><td class="lv">${lv(s)}</td><td class="cost">${s.polypCost ? `${s.polypCost} 🪸` : s.cost != null ? `${s.cost} 🫧` : '—'}</td><td>${esc(s.kind)}${s.stackable ? ' ' + tag('stackable') : ''}${s.cleaning ? ' ' + tag('🧽 cleaning') : ''}</td></tr>`).join('\n')
      + '</tbody></table>') : ''));
}

content += `
    <p style="margin-top:24px;">New species arrive with updates and seasonal events; this page is rebuilt from the game's data with every release. Read the stories behind the real ones on the <a href="/reef-education.html">Reef Education</a> page, or check the <a href="/guide.html">Game Guide</a> for how to find them.</p>

    <div class="play-row">
      <a class="play-btn" href="/reef/">Play 3D ✨</a>
      <a class="play-btn secondary" href="/">Play Classic</a>
    </div>

    <hr class="divider">
`;

// ── Page shell ───────────────────────────────────────────────────────────────
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="Complete species guide for Reef Bloom — all ${total} coral, plant and fish species with rarity tiers, unlock levels, biomes, prices and which ones are real. Generated from the game's own data." />
  <title>Species Guide — Reef Bloom</title>
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2397359547710356" crossorigin="anonymous"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      background: linear-gradient(175deg, #70d4f8 0%, #28a0e0 30%, #1468b0 65%, #0a3050 100%);
      font-family: system-ui, -apple-system, sans-serif;
      color: rgba(255,255,255,0.88);
      padding: 0 0 80px;
    }
    .reef-silhouette {
      position: fixed; bottom: 0; left: 0; right: 0; height: 100px;
      background: linear-gradient(180deg, transparent 0%, rgba(5,20,45,0.55) 35%, rgba(4,15,32,0.96) 100%);
      clip-path: polygon(
        0% 58%, 3% 38%, 6% 54%, 9% 28%, 12% 46%,
        15% 22%, 18% 40%, 21% 18%, 24% 36%, 27% 12%,
        30% 32%, 33%  8%, 36% 26%, 39%  6%, 42% 20%,
        45%  4%, 48% 16%, 51%  2%, 54% 14%, 57%  5%,
        60% 18%, 63%  7%, 66% 24%, 69% 10%, 72% 28%,
        75% 16%, 78% 33%, 81% 20%, 84% 38%, 87% 26%,
        90% 43%, 93% 30%, 96% 48%, 100% 33%, 100% 100%, 0% 100%
      );
      pointer-events: none; z-index: 0;
    }
    header {
      background: rgba(4, 18, 50, 0.55); backdrop-filter: blur(10px);
      border-bottom: 1px solid rgba(100,200,255,0.18);
      padding: 18px 32px; display: flex; align-items: center; gap: 20px; flex-wrap: wrap;
    }
    header a { color: rgba(255,255,255,0.5); text-decoration: none; font-size: 13px; letter-spacing: 1px; transition: color 0.15s; }
    header a:hover { color: #fff; }
    header .site-name { font-size: 18px; font-weight: 800; color: #fff; letter-spacing: 2px; text-decoration: none; }
    .content { position: relative; max-width: 860px; margin: 48px auto 0; padding: 0 24px; z-index: 1; }
    h1 { font-size: 32px; font-weight: 800; color: #fff; letter-spacing: 1px; margin-bottom: 6px; }
    .tagline { font-size: 14px; color: rgba(255,255,255,0.5); letter-spacing: 1px; margin-bottom: 28px; }
    h2 { font-size: 14px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: rgba(140,210,255,0.85); margin: 40px 0 10px; }
    h3 { font-size: 16px; font-weight: 700; color: rgba(255,255,255,0.9); margin: 24px 0 8px; }
    h3 .when { font-size: 12px; font-weight: 400; color: rgba(255,255,255,0.5); margin-left: 8px; letter-spacing: 0.5px; }
    p, li { font-size: 14px; line-height: 1.75; color: rgba(255,255,255,0.75); }
    p { margin-bottom: 12px; }
    a { color: rgba(140,210,255,0.9); }
    a:hover { color: #fff; }
    b, strong { color: rgba(255,255,255,0.9); }
    small { color: rgba(255,255,255,0.45); font-size: 0.85em; }
    .stats { display: flex; flex-wrap: wrap; gap: 10px; margin: 0 0 22px; }
    .stats div {
      flex: 1 1 130px; background: rgba(4,18,50,0.45); border: 1px solid rgba(100,200,255,0.18); border-radius: 12px;
      padding: 12px 14px; display: flex; flex-direction: column; gap: 2px;
    }
    .stats b { font-size: 24px; font-weight: 800; color: #fff; line-height: 1.1; }
    .stats span { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: rgba(140,210,255,0.7); }
    table { width: 100%; border-collapse: collapse; margin: 10px 0 18px; font-size: 13px; }
    th {
      text-align: left; padding: 8px 10px; font-size: 10px; letter-spacing: 2px; text-transform: uppercase;
      color: rgba(140,210,255,0.65); border-bottom: 1px solid rgba(100,200,255,0.2);
    }
    td { padding: 8px 10px; color: rgba(255,255,255,0.72); border-bottom: 1px solid rgba(255,255,255,0.06); vertical-align: top; line-height: 1.6; }
    tr:last-child td { border-bottom: none; }
    td:first-child { font-weight: 600; color: rgba(200,230,255,0.92); }
    td.lv, td.cost { white-space: nowrap; font-variant-numeric: tabular-nums; }
    td.lv small { color: rgba(127,216,255,0.7); }
    .bio { font-size: 11px; letter-spacing: 1px; }
    .tier-badge {
      display: inline-block; padding: 1px 8px; border-radius: 20px; border: 1px solid;
      font-size: 10.5px; font-weight: 700; letter-spacing: 0.3px; white-space: nowrap;
    }
    .tag {
      display: inline-block; font-size: 10px; letter-spacing: 0.5px; color: rgba(255,255,255,0.6);
      background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 0 6px; margin: 1px 0; white-space: nowrap;
    }
    .wild { display: block; font-size: 12px; color: rgba(180,220,255,0.7); font-style: italic; }
    em { color: rgba(180,220,255,0.8); }
    .section-intro { margin-bottom: 14px; }
    .play-row { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; margin-top: 28px; }
    .play-btn {
      display: inline-block; padding: 14px 48px; font-size: 16px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;
      color: #0a3050; background: #fff; border-radius: 40px; text-decoration: none;
      box-shadow: 0 4px 32px rgba(0,100,200,0.4); transition: transform 0.12s, background 0.12s;
    }
    .play-btn:hover { background: #d0f0ff; transform: scale(1.04); color: #0a3050; }
    .play-btn.secondary { background: #0a3050; color: #cfe6f4; box-shadow: 0 4px 32px rgba(0,60,120,0.5); }
    .play-btn.secondary:hover { background: #124a78; color: #fff; }
    .divider { border: none; border-top: 1px solid rgba(100,200,255,0.15); margin: 36px 0 0; }
    footer { position: relative; z-index: 1; text-align: center; padding: 40px 24px 20px; font-size: 12px; color: rgba(255,255,255,0.35); }
    footer a { color: rgba(140,210,255,0.6); text-decoration: none; }
    footer a:hover { color: #fff; }
    @media (max-width: 639px) {
      header { padding: 12px 16px; gap: 12px; }
      .content { padding: 0 10px; }
      table { font-size: 11.5px; }
      th, td { padding: 6px 5px; }
      td.cost { display: none; } th:nth-child(4) { display: none; }
    }
  </style>
</head>
<body>

  <header>
    <a class="site-name" href="/">Reef Bloom</a>
    <a href="/">Play</a>
    <a href="/guide.html">Guide</a>
    <a href="/reef-education.html">Reef Education</a>
    <a href="/about.html">About</a>
    <a href="/newsletter/">Newsletter</a>
    <a href="/contact.html">Contact</a>
  </header>

  <div class="content">${content}  </div>

  <footer>
    &copy; 2026 ReefBloomGame.com &nbsp;&middot;&nbsp;
    <a href="/about.html">About</a> &nbsp;&middot;&nbsp;
    <a href="/reef-education.html">Reef Education</a> &nbsp;&middot;&nbsp;
    <a href="/contact.html">Contact</a> &nbsp;&middot;&nbsp;
    <a href="/privacy.html">Privacy Policy</a> &nbsp;&middot;&nbsp;
    <a href="/terms.html">Terms of Service</a>
  </footer>

  <div class="reef-silhouette"></div>

  <!-- Cookie consent banner -->
  <div id="cookie-banner" style="
    display:none; position:fixed; bottom:0; left:0; right:0; z-index:9999;
    background:rgba(4,18,50,0.95); backdrop-filter:blur(10px);
    border-top:1px solid rgba(100,200,255,0.2);
    padding:14px 24px; font-family:system-ui,-apple-system,sans-serif;
    align-items:center; justify-content:center; gap:16px; flex-wrap:wrap;
  ">
    <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.7);line-height:1.5;flex:1;min-width:240px;">
      This site uses cookies from Google to serve ads and analyze traffic.
      <a href="/privacy.html" style="color:rgba(140,210,255,0.9);">Learn more</a>
    </p>
    <div style="display:flex;gap:8px;flex-shrink:0;">
      <button onclick="acceptCookies()" style="
        padding:8px 24px;background:#fff;color:#0a3050;border:none;border-radius:20px;
        font-size:12px;font-weight:700;letter-spacing:0.5px;cursor:pointer;font-family:inherit;
      ">Accept</button>
      <button onclick="declineCookies()" style="
        padding:8px 24px;background:transparent;color:rgba(255,255,255,0.5);
        border:1px solid rgba(255,255,255,0.2);border-radius:20px;
        font-size:12px;font-weight:600;letter-spacing:0.5px;cursor:pointer;font-family:inherit;
      ">Decline</button>
    </div>
  </div>
  <script>
    (function() {
      var consent = localStorage.getItem('cookie_consent');
      if (!consent) document.getElementById('cookie-banner').style.display = 'flex';
    })();
    function acceptCookies() { localStorage.setItem('cookie_consent','accepted'); document.getElementById('cookie-banner').style.display='none'; }
    function declineCookies() { localStorage.setItem('cookie_consent','declined'); document.getElementById('cookie-banner').style.display='none'; }
  </script>
</body>
</html>
`;

writeFileSync('public/species.html', html);
console.log(`species.html: ${corals.length} corals (${localCorals.length} 3D-only), ${fish.length} fish, ${decor.length} decor, ${eventIds.length} events, ${realCount} real`);
