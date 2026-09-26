// Reef Bloom — 3D reef (three.js render track).
// A playable slice of the actual game in 3D: all three Classic biomes laid out
// side by side on one continuous seafloor — Seagrass Basin to the west, the
// Coral Reef in the centre, and the Deep Twilight basin dropping away to the
// east. Each biome has its own placement grid, terrain, and species list
// (biome-exclusive per Classic's rules), with a live Bubble-Essence economy
// using Classic's numbers and its own saved reef.
//
// Self-contained: reuses Classic's DATA (species, costs, income) and its own
// localStorage slot, but not Classic's save. Run `npm run dev` → /threed.html.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { eventDaysRemaining, liveEvent, nextEvent, eventById } from '../systems/EventSystem.js';
import { CHALLENGE_POOL } from '../systems/QuestSystem.js';
import { SPECIES_LORE } from '../systems/JournalSystem.js';
import {
  CORAL_SPECIES, FISH_SPECIES, CORAL_COST, FISH_COST, BE_PER_TICK,
  START_BE, START_POLYPS, START_PEARLS, START_HARMONY, START_LEVEL,
  BE_MAX, POLYP_MAX, POLYP_BE_BONUS, POLYP_PER_CORAL_TICK, CORAL_MAX_LEVEL, TICK_MS,
  BIOMES, SEAGRASS_UNLOCK_LEVEL, DEEP_TWILIGHT_UNLOCK_LEVEL,
  DECOR_SPECIES, STATION_MAX_LEVEL, stationUpgradeCost, TIER_LABEL, COLORS,
  CLEAN_COOLDOWN_MS, CLEANING_ASSIGN_INTERVAL,
  CLEANING_HARMONY_PER, CLEANING_HARMONY_MAX, CLEANING_MISSING_PENALTY,
  BIOLUM_SPECIES, DAY_HIDER_SPECIES,
} from '../constants.js';
import { LINES as BUBBLES_LINES } from '../entities/bubblesLines.js';
import { createReefMusic } from './music.js';
import { initCloudSave, cloudMarkWritten, onCloudSynced } from '../cloudsave.js';
import { openAccountSheet, accountsEnabled, onAccountSignedIn } from '../accountSheet.js';
import {
  PEARL_PACKS, isNative as iapIsNative, loadProducts as iapLoadProducts, purchase as iapPurchase,
  startTransactionListener as iapStartListener, takePendingPearls as iapTakePending,
  cachedProducts as iapCachedProducts, resetProducts as iapResetProducts,
  restorePurchases as iapRestore,
} from './iap.js';

const TILE = 2;
const SURFACE_Y = 13;     // the ocean surface — everything swims beneath it
const CLEAN_DURATION_MS = 8000;   // how long a client sits at a station (3D pacing)
const STATION_SPEC = DECOR_SPECIES.cleaningStation;
const VENT_PERIOD = 5.2;
const TICK_SEC = TICK_MS / 1000;        // BE/polyp tick cadence in seconds
const SAVE_KEY_BASE = 'reefbloom_3d_save_v1';
const SLOT_KEY = 'reefbloom_3d_slot';
const slotKey = (s) => `${SAVE_KEY_BASE}_s${s}`;

// Three biome zones on one seafloor. Each has its own grid; the twilight
// basin sits on a deep shelf east of the reef, the seagrass flats a touch
// shallower to the west. Zone membership for free water (fish) is by x band.
const ZONES = {
  seagrass:     { id: 'seagrass',     cx: -32, cz: 0, grid: 10, floorY: 0.5,  unlock: SEAGRASS_UNLOCK_LEVEL },
  coral:        { id: 'coral',        cx: 0,   cz: 0, grid: 10, floorY: -0.1, unlock: 1 },
  deepTwilight: { id: 'deepTwilight', cx: 32,  cz: 0, grid: 10, floorY: -4.5, unlock: DEEP_TWILIGHT_UNLOCK_LEVEL },
};
function zoneAt(x) {
  if (x < -16) return ZONES.seagrass;
  if (x > 16) return ZONES.deepTwilight;
  return ZONES.coral;
}

// Classic's biome membership rule (PlacementMenu._matchesBiome): no biome
// field = coral-only; 'both' = coral + seagrass; arrays list biomes explicitly.
// Lantern corals are the exception: they are lamps first and corals second,
// and a lamp belongs anywhere it's dark — they place in every biome (3D only).
const LANTERN_CORALS = new Set(['lanternCoral', 'wispCoral', 'phantomPolyp', 'lumenCoral']);
function matchesBiome(spec, biomeId) {
  if (LANTERN_CORALS.has(spec.id)) return true;
  const b = spec.biome;
  if (!b || b === 'coral') return biomeId === 'coral';
  if (b === 'both') return biomeId === 'coral' || biomeId === 'seagrass';
  if (Array.isArray(b)) return b.includes(biomeId);
  return b === biomeId;
}
const biomeIcons = (spec) =>
  Object.keys(ZONES).filter(id => matchesBiome(spec, id)).map(id => BIOMES[id].icon).join('');

// Free-roaming fish: big swimmers wander their biome instead of circling, and
// multi-biome species get a roam band spanning every biome they belong to —
// tangs and cleaners genuinely commute between the reef and the seagrass flats.
// The seagrass band stops short of the beach slope so fish never strand.
const ZONE_BAND = { seagrass: [-50, -16], coral: [-16, 16], deepTwilight: [16, 52] };
// Big open-water swimmers (dolphins, sharks, rays, turtles, whale sharks…)
// ignore biome bands altogether: the whole lagoon is theirs, beach slope to
// the deep drop-off and far out over open water beyond the grids.
const LAGOON = { x0: -46, x1: 50, z: 34 };
function roamProfile(spec) {
  const zs = Object.keys(ZONES).filter(id => matchesBiome(spec, id));
  const big = (spec.size ?? 14) >= 22;
  if (big && !BENTHIC_SPECIES.has(spec.id)) return { x0: LAGOON.x0, x1: LAGOON.x1, wide: true };
  if (zs.length < 2) return null;
  return {
    x0: Math.min(...zs.map(z => ZONE_BAND[z][0])) + 2,
    x1: Math.max(...zs.map(z => ZONE_BAND[z][1])) - 2,
  };
}

// Bottom-dwellers that aren't fish at all — an arthropod, echinoderms, a
// gastropod, a shrimp — plus the fish that perch and forage on the seafloor
// rather than swimming the column.
const BENTHIC_SPECIES = new Set([
  'horseshoeCrab', 'sandDollar', 'conch', 'seaUrchin', 'cleanerShrimp',
  'hermitCrab', 'flamingoTongue',
  'sculpin', 'ochreStar', 'chiton', 'tidepoolCrab',
  'blenny', 'hawkfish', 'goatfish', 'frogfish', 'scorpionfish',
]);
// How high each benthic body's origin sits above the sand (× its base scale).
const BENTHIC_LIFT = {
  horseshoeCrab: 0.16, sandDollar: 0.06, conch: 0.22, seaUrchin: 0.28, cleanerShrimp: 0.18,
  hermitCrab: 0.22, flamingoTongue: 0.14,
  sculpin: 0.16, ochreStar: 0.08, chiton: 0.12, tidepoolCrab: 0.16,
  blenny: 0.12, hawkfish: 0.16, goatfish: 0.2, frogfish: 0.16, scorpionfish: 0.16,
};

// Species-specific roaming styles: cruising altitude above the floor, pitch
// damping for flat gliders that shouldn't nose-dive, and speed/bob tweaks for
// drifters. Rays feed low over the sand; mantas cruise the open column;
// the nautilus jets along in slow buoyant bobs.
const ROAM_STYLE = {
  mantaRay:        { alt: [3.5, 8],   pitch: 0.35 },
  spottedEagleRay: { alt: [0.7, 2.2], pitch: 0.35 },
  abyssalRay:      { alt: [0.7, 2.2], pitch: 0.35 },
  stingray:        { alt: [0.7, 2.2], pitch: 0.35 },
  nautilus:        { alt: [1.4, 4.5], pitch: 0.25, bob: 0.5, drift: 0.55 },
  seaOtter:        { alt: [11.3, 12], pitch: 0.1, bob: 0.18, drift: 0.8 },   // rafts ON the surface
};

// Small shoaling species swim as one school — a shared drifting waypoint plus
// boids-style separation/cohesion/alignment per fish. One school per
// species + biome, so five chromis genuinely travel together.
const SCHOOL_SPECIES = new Set([
  'blueChromis', 'chromis', 'damselfish', 'cardinalfish',
  'pajamaCardinalfish', 'banggaiCardinalfish', 'zebrafish',
  'mullet', 'sergeantMajor', 'anthias', 'yellowChromis',
]);

// Classic's day/night: 4-minute day, timeOfDay 0→1 (midnight 0, sunrise 0.25,
// noon 0.5, sunset 0.75); night factor eases toward clamp(-elevation·1.6, 0, 1).
const DAY_MS = 240000;

// Milestone requirements to REACH each level [coralCount, fishCount, harmony],
// mirroring Classic's LevelSystem. Index === level being reached (1 = start).
const MAX_LEVEL = 15;
const LEVEL_REQS = [
  null, null,
  [3, 0, 0], [6, 2, 0], [12, 4, 60], [18, 7, 75], [24, 10, 78], [30, 13, 80],
  [38, 17, 82], [46, 21, 85], [55, 25, 87], [64, 29, 89], [74, 34, 91],
  [84, 39, 93], [95, 45, 95], [100, 50, 98],
];

// Polyps FROM level L → L+1 (Classic CoralUpgrade.upgradeCost = 4 * L).
const upgradeCost = (level) => 4 * level;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function ventIntensity(p) {
  if (p < 0.12) return p / 0.12;
  if (p < 0.48) return 1;
  if (p < 0.62) return 1 - (p - 0.48) / 0.14;
  return 0;
}

function gradientTexture(stops) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function hex(n) { return `#${n.toString(16).padStart(6, '0')}`; }

// Small deterministic PRNG so each coral gets its own silhouette without
// re-randomizing on every frame.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Procedural textures (everything is "textured" from these canvases) ────────
// Tileable grain/blotch noise — sand, rock, and bump detail all come from here.
function grainTexture({ base, dark, light, blotches = 8, grains = 1400, seed = 11 }) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const rnd = mulberry32(seed);
  const wrapped = (draw) => {
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) draw(dx, dy);
  };
  // Large soft blotches for low-frequency variation.
  ctx.filter = 'blur(14px)';
  for (let i = 0; i < blotches; i++) {
    const x = rnd() * size, y = rnd() * size, r = 26 + rnd() * 52;
    ctx.fillStyle = i % 2 ? dark : light;
    ctx.globalAlpha = 0.16;
    wrapped((dx, dy) => { ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, 7); ctx.fill(); });
  }
  ctx.filter = 'none';
  // Fine speckle grain.
  ctx.globalAlpha = 0.28;
  for (let i = 0; i < grains; i++) {
    const x = rnd() * size, y = rnd() * size, s = 1 + rnd() * 1.6;
    ctx.fillStyle = rnd() < 0.5 ? dark : light;
    wrapped((dx, dy) => ctx.fillRect(x + dx, y + dy, s, s));
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Tileable caustic-style light web, used as the seafloor's animated emissive map.
function causticTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  const rnd = mulberry32(7);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.filter = 'blur(2px)';
  for (let i = 0; i < 70; i++) {
    const x = rnd() * size, y = rnd() * size, r = 8 + rnd() * 18;
    const a0 = rnd() * Math.PI * 2, a1 = a0 + 2 + rnd() * 3.5;
    ctx.lineWidth = 1 + rnd() * 2;
    // Draw wrapped copies so the texture tiles without seams.
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, r, a0, a1);
        ctx.stroke();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ── Species-specific textures ─────────────────────────────────────────────────
// Every species gets its own procedural skin, styled by its shape family and
// painted in its own colors. Cached per species — instances share one texture.
function hashId(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}
const css = (c) => `#${c.getHexString()}`;

// Individuals get their own skin: `variant` reseeds the pattern layout and
// subtly shifts the tone, so two corals of one species never match exactly.
const TEX_VARIANTS = 6;
const coralTexCache = new Map();
function coralTexture(spec, variant = 0) {
  const key = `${spec.id}:${variant}`;
  let t = coralTexCache.get(key);
  if (t) return t;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const rnd = mulberry32(hashId(spec.id) + variant * 2654435761);
  const col = new THREE.Color(spec.color).lerp(new THREE.Color(0x8a8a80), 0.18);
  col.offsetHSL((rnd() - 0.5) * 0.03, (rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.09);
  const dark = css(col.clone().multiplyScalar(0.58));
  const light = css(col.clone().lerp(new THREE.Color(0xffffff), 0.4));
  ctx.fillStyle = css(col);
  ctx.fillRect(0, 0, size, size);
  const raw = shapeOf(spec);
  // New shape families reuse the closest existing pattern.
  const shape = spec.id === 'candycane' ? 'candycane'
    : raw === 'lettuce' ? 'plate'
    : raw === 'kelp' || raw === 'sapling' ? 'grass'
    : raw;
  if (shape === 'candycane') {
    // Signature pale bands around each tube.
    ctx.fillStyle = light;
    for (let y = 6; y < size; y += 15 + Math.floor(rnd() * 4)) {
      ctx.fillRect(0, y, size, 6);
    }
  } else if (shape === 'brain') {
    // Meandering ridge-and-valley lines — thin, dense, low contrast.
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 13; i++) {
      const y0 = (i + 0.5) * (size / 13);
      ctx.strokeStyle = i % 2 ? dark : light;
      ctx.globalAlpha = i % 2 ? 0.9 : 0.5;
      ctx.beginPath();
      for (let x = -8; x <= size + 8; x += 8) {
        const y = y0 + Math.sin(x * 0.11 + i * 2.2 + rnd() * 0.5) * 3.5;
        if (x === -8) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (shape === 'plate') {
    // Concentric growth rings.
    ctx.lineWidth = 1.6;
    for (let r = 6; r < size; r += 7 + Math.floor(rnd() * 5)) {
      ctx.strokeStyle = rnd() < 0.5 ? dark : light;
      ctx.beginPath(); ctx.arc(size / 2, size / 2, r, 0, 7); ctx.stroke();
    }
  } else if (shape === 'grass') {
    // Lengthwise blade streaks.
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 26; i++) {
      const x = rnd() * size;
      ctx.strokeStyle = rnd() < 0.5 ? dark : light;
      ctx.lineWidth = 1 + rnd() * 2;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (rnd() - 0.5) * 10, size); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (shape === 'bubble') {
    // Soft translucent cells.
    ctx.globalAlpha = 0.16;
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = rnd() < 0.6 ? light : dark;
      ctx.beginPath(); ctx.arc(rnd() * size, rnd() * size, 10 + rnd() * 22, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else {
    // branch / polyp — fine polyp pores.
    ctx.globalAlpha = 0.55;
    for (let i = 0; i < 150; i++) {
      ctx.fillStyle = rnd() < 0.75 ? dark : light;
      ctx.beginPath(); ctx.arc(rnd() * size, rnd() * size, 0.8 + rnd() * 1.8, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  coralTexCache.set(key, t);
  return t;
}

// Fish skins: iconic banded/spotted species get their real markings in their
// accent color; everyone else gets counter-shading plus a lateral stripe.
const FISH_BANDED = new Set([
  'clownfish', 'zebraGoby', 'zebrafish',
  'harlequinTuskfish', 'butterflyfish', 'moorishIdol', 'seaUrchin', 'clownTriggerfish',
  'emperorAngelfish', 'raccoonButterflyfish', 'copperbandButterflyfish']);
const FISH_SPOTTED = new Set([
  'spottedEagleRay', 'pufferfish', 'mandarinfish', 'rainbowGoby', 'twilightWhaleShark',
  'flashlightFish', 'giantSquid', 'spottedDrum', 'whaleShark', 'porcupinePuffer']);
// Species with a specific real-world livery get painted by hand. Texture x
// runs around the body: 0 = left flank middle, 0.25 = nose, 0.5 = right
// flank middle, 0.75 = tail; y runs back (0) to belly (h). `band(p0, p1)`
// fills the same stretch along the body on both flanks, p = 0 nose … 1 tail.
const FISH_PAINT = {
  yellowTang(ctx, w, h, { band }) {
    ctx.fillStyle = '#ffffff'; band(0.86, 0.92, 0.42, 0.58);        // the scalpel
  },
  blueTang(ctx, w, h, { band }) {
    // The black "palette": a stroke along the upper flank that hooks down
    // behind the pectoral, leaving a blue oval — and a yellow tail.
    ctx.fillStyle = '#0d1b2a';
    band(0.1, 0.85, 0.12, 0.3); band(0.62, 0.85, 0.3, 0.7); band(0.32, 0.4, 0.3, 0.62);
    ctx.fillStyle = '#ffeb3b'; band(0.9, 1, 0, 1);
  },
  powderBrownTang(ctx, w, h, { band }) {
    ctx.fillStyle = '#eceff1'; band(0.02, 0.2, 0.42, 0.75);        // white cheek
    ctx.fillStyle = '#ffd54f'; band(0.2, 0.86, 0.08, 0.16);         // yellow band under the dorsal
    ctx.fillStyle = '#ffffff'; band(0.0, 0.05, 0.5, 0.62);          // white lips
  },
  damselfish(ctx, w, h) { /* plain electric blue — the counter-shade is all it needs */ },
  cardinalfish(ctx, w, h, { band }) {
    ctx.fillStyle = 'rgba(183,28,28,0.5)';
    for (let k = 0; k < 4; k++) band(0.05, 0.95, 0.18 + k * 0.17, 0.2 + k * 0.17);   // faint red lines
  },
  pajamaCardinalfish(ctx, w, h, { band, rnd }) {
    ctx.fillStyle = '#c0ca33'; band(0, 0.36, 0, 1);                   // olive-yellow head
    ctx.fillStyle = '#1a1a1a'; band(0.36, 0.5, 0, 1);                 // the black belt
    ctx.fillStyle = '#ef5350';                                        // red spots on the rear
    for (let k = 0; k < 24; k++) { const p = 0.52 + rnd() * 0.46, y = rnd(); band(p, p + 0.03, y, y + 0.07); }
  },
  banggaiCardinalfish(ctx, w, h, { band, rnd }) {
    ctx.fillStyle = '#111111';
    band(0.2, 0.26, 0, 1); band(0.46, 0.52, 0, 1); band(0.72, 0.78, 0, 1);   // three bars
    ctx.fillStyle = '#ffffff';
    for (let k = 0; k < 18; k++) { const p = 0.28 + rnd() * 0.68, y = rnd(); band(p, p + 0.02, y, y + 0.05); }
  },
};
const fishTexCache = new Map();
function fishTexture(spec, variant = 0) {
  const key = `${spec.id}:${variant}`;
  let t = fishTexCache.get(key);
  if (t) return t;
  const w = 128, h = 64;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const rnd = mulberry32(hashId(spec.id) + variant * 2654435761);
  const base = new THREE.Color(spec.color);
  base.offsetHSL((rnd() - 0.5) * 0.04, (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.08);
  const acc = new THREE.Color(spec.accentColor ?? 0xffffff);
  ctx.fillStyle = css(base);
  ctx.fillRect(0, 0, w, h);
  // Counter-shading: darker dorsal (top of texture = top of fish).
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, css(base.clone().multiplyScalar(0.6)));
  grad.addColorStop(0.4 + rnd() * 0.15, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = css(acc);
  const band = (p0, p1, y0 = 0, y1 = 1) => {
    // right flank: x = 0.25 + 0.5p; left flank mirrors it back through x = 0.25 (wrapping)
    ctx.fillRect((0.25 + 0.5 * p0) * w, y0 * h, (p1 - p0) * 0.5 * w, (y1 - y0) * h);
    const a = 0.25 - 0.5 * p1, b = 0.25 - 0.5 * p0;   // may dip below 0 → wraps to the right edge
    const rect = (x0, x1) => { if (x1 > x0) ctx.fillRect(x0 * w, y0 * h, (x1 - x0) * w, (y1 - y0) * h); };
    if (a >= 0) rect(a, b);
    else if (b <= 0) rect(1 + a, 1 + b);
    else { rect(0, b); rect(1 + a, 1); }
  };
  if (FISH_PAINT[spec.id]) {
    FISH_PAINT[spec.id](ctx, w, h, { band, rnd, base, acc });
  } else if (FISH_BANDED.has(spec.id)) {
    const bands = 3 + (hashId(spec.id) % 2);
    for (let i = 0; i < bands; i++) {
      const x = ((i + 0.3 + rnd() * 0.4) / bands) * w;
      const bw = 7 + rnd() * 6;
      ctx.fillRect(x - bw / 2, 0, bw, h);
    }
  } else if (FISH_SPOTTED.has(spec.id)) {
    ctx.globalAlpha = 0.85;
    const n = 20 + Math.floor(rnd() * 14);
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * h, 1.6 + rnd() * 2.6, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else {
    // Lateral stripe along the flank.
    ctx.globalAlpha = 0.55 + rnd() * 0.3;
    ctx.fillRect(0, h * (0.46 + rnd() * 0.12), w, 3 + rnd() * 3);
    ctx.globalAlpha = 1;
  }
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  fishTexCache.set(key, t);
  return t;
}

const sandTex = grainTexture({
  base: '#e3cf9b', dark: '#bfa268', light: '#fff3cf', blotches: 6, grains: 1600, seed: 11 });
sandTex.repeat.set(30, 30);
const rockTex = grainTexture({
  base: '#8a8a86', dark: '#55524c', light: '#b5b3ac', blotches: 12, grains: 900, seed: 23 });
const bumpTex = grainTexture({
  base: '#808080', dark: '#5a5a5a', light: '#a8a8a8', blotches: 10, grains: 1200, seed: 37 });
bumpTex.repeat.set(3, 3);
const tileTex = sandTex.clone();
tileTex.repeat.set(1.5, 1.5);

// ── Terrain — one continuous heightfield under all three biomes ───────────────
// Gentle waves, a shelf dropping east into the twilight basin, slightly raised
// seagrass flats west, dune ridges rising beyond the play field, and a flat
// plateau blended in under each biome's grid.
function terrainHeight(x, z) {
  let h = -0.2 + Math.sin(x * 0.08) * Math.cos(z * 0.07) * 0.9
    + Math.sin(x * 0.21 + z * 0.13) * 0.35;
  h -= smoothstep(16, 26, x) * 4.4;
  h += smoothstep(16, 24, -x) * 0.7;
  h += smoothstep(50, 68, -x) * 15.5;                   // a low, flat beach rises from the sea
  const d = Math.max(x - 52, Math.abs(z) - 38);
  if (d > 0) {
    h += Math.min(d * 0.3, 10) * (0.72 + 0.28 * Math.sin(x * 0.07 + Math.cos(z * 0.09) * 2));
  }
  for (const zn of Object.values(ZONES)) {
    // Rectangular plateau: grid width across, but stretched north–south to
    // pre-flatten the aprons where both rings of 5×5 expansions attach.
    const xHalf = (zn.grid * TILE) / 2 + 1.4;
    const zHalf = xHalf + 20;
    const dist = Math.max(Math.abs(x - zn.cx) - xHalf, Math.abs(z - zn.cz) - zHalf);
    const k = 1 - smoothstep(0, 4, dist);
    if (k > 0) h = h * (1 - k) + zn.floorY * k;
  }
  return h;
}

// Full Classic catalog (all biomes; event-pass exclusives excluded from the shop,
// mirroring Classic). Sorted by unlock level then tier for a sensible palette order.
const byUnlock = (a, b) => (a.unlockLevel ?? 1) - (b.unlockLevel ?? 1)
  || (BE_PER_TICK[a.tier] ?? 0) - (BE_PER_TICK[b.tier] ?? 0);
function allCorals() {
  return Object.values(CORAL_SPECIES)
    .filter(s => !s.eventId && s.color != null).sort(byUnlock);
}
function allFish() {
  return Object.values(FISH_SPECIES)
    .filter(s => !s.eventId && s.color != null && s.layer).sort(byUnlock);
}
// Biome a species is listed under in the palette (placement may allow more).
function primaryBiome(spec) {
  // Lantern Coral rehomed to the shallows: it lights every biome, but its
  // shop/journal listing lives in the Coral Reef now — the twilight's native
  // glowing coral is the Golden Tree (as in the real deep Pacific).
  if (spec.id === 'lanternCoral') return 'coral';
  const b = spec.biome;
  if (!b || b === 'coral' || b === 'both') return 'coral';
  if (Array.isArray(b)) return b.includes('coral') ? 'coral' : b[0];
  return b;
}

// ── Coral geometry — a distinct silhouette per species family ──────────────────
const coralRock = new THREE.MeshStandardMaterial({
  color: 0x8f887a, roughness: 1, flatShading: true, map: rockTex });
coralRock.userData.shared = true;

function shapeOf(spec) {
  const id = spec.id;
  if (['staghorn', 'finger', 'firetip', 'candycane', 'pillar', 'elkhorn',
    'sunfire', 'rainbowCoral'].includes(id)) return 'branch';
  if (['toadstool', 'table', 'midnightTable'].includes(id)) return 'plate';
  if (id === 'lettuce') return 'lettuce';
  if (['star', 'starter', 'sunCoral'].includes(id)) return 'polyp';
  if (id === 'tidepoolAnemone') return 'anemone';
  if (id === 'gooseneckBarnacles') return 'barnacles';
  if (id === 'seaLettuce') return 'grass';
  if (id === 'corallineAlgae') return 'brain';
  if (id === 'bubble') return 'bubble';
  if (['brain', 'ghost', 'twilightBrain'].includes(id)) return 'brain';
  if (['seaweed', 'seagrass', 'redSeagrass'].includes(id)) return 'grass';
  if (id === 'kelp' || id === 'amberKelp') return 'kelp';
  if (id === 'mangroveSapling') return 'sapling';
  if (['abyssalFan', 'lagoonFan', 'sunsetFan', 'russetFan'].includes(id)) return 'fan';
  if (id === 'barnacles') return 'barnacles';
  if (id === 'anemoneHome') return 'anemone';
  if (['wispCoral', 'phantomPolyp'].includes(id)) return 'wisp';
  if (id === 'lanternCoral' || id === 'lumenCoral') return 'lantern';
  if (['essenceVault', 'grandReservoir'].includes(id)) return 'clam';
  if (id === 'reefCave') return 'cave';
  return spec.tall ? 'branch' : 'brain';
}

// Per-species branch architecture — a staghorn is not a pillar is not an
// elkhorn. n arms of radius r and height h, leaning outward; `fork` grows a
// kinked second segment, `flat` widens arms into elkhorn-style blades.
const CORAL_STYLE = {
  staghorn: { n: 11, r: 0.036, h: 1.2, lean: 0.32, fork: true },
  firetip: { n: 8, r: 0.05, h: 0.9, lean: 0.25, fork: true },
  finger: { n: 9, r: 0.09, h: 0.5, lean: 0.12, fork: false },
  candycane: { n: 6, r: 0.075, h: 0.75, lean: 0.08, fork: false },
  pillar: { n: 4, r: 0.17, h: 1.5, lean: 0.03, fork: false },
  elkhorn: { n: 6, r: 0.055, h: 1.0, lean: 0.35, fork: true, flat: 3.2 },
  sunfire: { n: 7, r: 0.06, h: 1.1, lean: 0.2, fork: true },
  rainbowCoral: { n: 9, r: 0.045, h: 0.8, lean: 0.3, fork: true },
  fireCoral: { n: 8, r: 0.05, h: 0.95, lean: 0.22, fork: true },
};

// Each builder gets ({ mat, tipMat, darkMat }, rnd) — rnd is a per-coral PRNG so
// every placement has its own silhouette instead of six identical clones.
const BODY = {
  branch(g, { mat, tipMat, lvl = 1 }, rnd, spec) {
    const st = CORAL_STYLE[spec?.id] ?? { n: 9, r: 0.05, h: 0.9, lean: 0.28, fork: true };
    const N = st.n + Math.floor(rnd() * 3) + (lvl - 1) * 2;   // upgrades grow NEW arms
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + rnd() * 0.6;
      const lean = st.lean * (0.7 + rnd() * 0.6);
      const h1 = st.h * (0.75 + rnd() * 0.5);
      const r0 = st.r * (0.85 + rnd() * 0.3) * (1 + (lvl - 1) * 0.05);
      // Lower segment: tapered, leaning outward from the base.
      const arm = new THREE.Group();
      arm.position.set(Math.cos(a) * 0.18, 0.2, Math.sin(a) * 0.18);
      arm.rotation.z = Math.cos(a) * lean;
      arm.rotation.x = -Math.sin(a) * lean;
      const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 0.65, r0, h1, 7), mat);
      if (st.flat) seg1.scale.x = st.flat;                 // elkhorn-style blades
      seg1.position.y = h1 / 2; arm.add(seg1);
      if (st.fork) {
        // Upper segment: thinner, kinked a bit further out, pale grow-tip.
        const fork = new THREE.Group();
        fork.position.y = h1;
        fork.rotation.z = (rnd() - 0.3) * 0.8;
        fork.rotation.x = (rnd() - 0.5) * 0.6;
        const h2 = 0.35 + rnd() * 0.5;
        const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 0.3, r0 * 0.62, h2, 6), mat);
        if (st.flat) seg2.scale.x = st.flat * 0.8;
        seg2.position.y = h2 / 2; fork.add(seg2);
        const tip = new THREE.Mesh(new THREE.SphereGeometry(r0 * 0.55, 6, 6), tipMat);
        if (st.flat) tip.scale.x = st.flat * 0.6;
        tip.position.y = h2; fork.add(tip);
        arm.add(fork);
        if (rnd() < 0.5) {
          const nh = 0.2 + rnd() * 0.25;
          const nub = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 0.25, r0 * 0.5, nh, 5), mat);
          nub.position.set(0, h1 * (0.35 + rnd() * 0.3), 0);
          nub.rotation.z = 0.9 + rnd() * 0.5;
          arm.add(nub);
        }
      } else {
        // Unforked columns and fingers end in a rounded cap.
        const cap = new THREE.Mesh(new THREE.SphereGeometry(r0 * 0.68, 8, 6), tipMat);
        cap.position.y = h1; arm.add(cap);
      }
      g.add(arm);
    }
  },
  // Lettuce coral: a rosette of ruffled, wavy-edged vertical blades.
  lettuce(g, { mat, lvl = 1 }, rnd) {
    const m = mat.clone(); m.side = THREE.DoubleSide;
    const N = 6 + Math.floor(rnd() * 3) + (lvl - 1) * 2;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + rnd() * 0.5;
      const pts = [[0, 0]];
      for (let k = 0; k <= 6; k++) {
        const ang = -0.55 + (k / 6) * 1.1;
        const rr = 0.5 + Math.sin(k * 2.1 + rnd() * 3) * 0.09;
        pts.push([Math.sin(ang) * rr, 0.12 + Math.cos(ang) * rr * 0.75]);
      }
      pts.push([0, 0]);
      const blade = finMesh(pts, m, 0);
      blade.position.set(Math.cos(a) * 0.15, 0.12, Math.sin(a) * 0.15);
      blade.rotation.y = -a + Math.PI / 2;
      blade.rotation.x = (rnd() - 0.5) * 0.3;
      blade.rotation.z = (rnd() - 0.5) * 0.5;
      g.add(blade);
    }
  },
  // Sea fan: a single flat plane of radiating ribs with arced cross-struts.
  fan(g, { mat, tipMat, lvl = 1 }, rnd) {
    const plane = new THREE.Group();
    plane.rotation.y = rnd() * Math.PI;
    const N = 9 + (lvl - 1) * 2;
    for (let i = 0; i < N; i++) {
      const ang = -0.85 + (i / (N - 1)) * 1.7;
      const len = 0.85 + Math.cos(ang) * 0.3 + rnd() * 0.15;
      const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.028, len, 5), mat);
      rib.rotation.z = -ang;
      rib.position.set(Math.sin(ang) * len * 0.5, 0.18 + Math.cos(ang) * len * 0.5, 0);
      plane.add(rib);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), tipMat);
      tip.position.set(Math.sin(ang) * len, 0.18 + Math.cos(ang) * len, 0);
      plane.add(tip);
    }
    for (let k = 0; k < 3 + Math.floor((lvl - 1) / 2); k++) {
      const rr = 0.35 + k * 0.24;
      const strut = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.011, 5, 20, 1.7), mat);
      strut.position.y = 0.18;
      strut.rotation.z = Math.PI / 2 - 0.85;
      plane.add(strut);
    }
    g.add(plane);
  },
  // Barnacle cluster: truncated cones with dark mouths.
  barnacles(g, { mat, lvl = 1 }, rnd) {
    const mouth = new THREE.MeshStandardMaterial({ color: 0x1c262e, roughness: 1 });
    const N = 9 + Math.floor(rnd() * 5) + (lvl - 1) * 3;
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2, rr = rnd() * 0.42;
      const h = 0.1 + rnd() * 0.18, rb = 0.07 + rnd() * 0.05;
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(rb * 0.55, rb, h, 8), mat);
      cone.position.set(Math.cos(a) * rr, 0.12 + h / 2, Math.sin(a) * rr);
      g.add(cone);
      const lip = new THREE.Mesh(new THREE.CylinderGeometry(rb * 0.38, rb * 0.38, 0.02, 8), mouth);
      lip.position.set(Math.cos(a) * rr, 0.12 + h, Math.sin(a) * rr);
      g.add(lip);
    }
  },
  // Anemone: squat column crowned with a ring of long waving tentacles.
  anemone(g, { mat, tipMat, lvl = 1 }, rnd) {
    const cw = 1 + (lvl - 1) * 0.07;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.24 * cw, 0.3 * cw, 0.28, 12), mat);
    col.position.y = 0.2; g.add(col);
    for (let i = 0; i < 22 + (lvl - 1) * 5; i++) {
      const a = rnd() * Math.PI * 2, rr = 0.06 + rnd() * 0.17;
      const len = 0.3 + rnd() * 0.25;
      const tnt = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, len, 3, 6), i % 2 ? mat : tipMat);
      tnt.position.set(Math.cos(a) * rr, 0.36 + len / 2, Math.sin(a) * rr);
      tnt.rotation.z = Math.cos(a) * (0.3 + rnd() * 0.5);
      tnt.rotation.x = -Math.sin(a) * (0.3 + rnd() * 0.5);
      g.add(tnt);
    }
  },
  // Wisp / phantom polyps: tall translucent stalks with glowing tips.
  wisp(g, { mat, tipMat, lvl = 1 }, rnd) {
    const m = mat.clone(); m.transparent = true; m.opacity = 0.72;
    const N = 6 + Math.floor(rnd() * 4) + (lvl - 1) * 2;
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2, rr = rnd() * 0.3;
      const stalk = new THREE.Group();
      stalk.position.set(Math.cos(a) * rr, 0.14, Math.sin(a) * rr);
      stalk.rotation.z = (rnd() - 0.5) * 0.35;
      stalk.rotation.x = (rnd() - 0.5) * 0.35;
      let y = 0;
      for (let s = 0; s < 3; s++) {
        const h = 0.35 + rnd() * 0.25;
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.032 - s * 0.006, h, 5), m);
        seg.position.set(Math.sin(s * 2 + a) * 0.03, y + h / 2, 0);
        stalk.add(seg);
        y += h;
      }
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), tipMat);
      tip.position.y = y; stalk.add(tip);
      g.add(stalk);
    }
  },
  // Lantern coral: stalks hung with glowing bulbs.
  lantern(g, { mat, tipMat, lvl = 1 }, rnd) {
    const N = 4 + Math.floor(rnd() * 3) + (lvl - 1);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + rnd();
      const h = 0.7 + rnd() * 0.55;
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, h, 6), mat);
      stalk.position.set(Math.cos(a) * 0.16, 0.14 + h / 2, Math.sin(a) * 0.16);
      stalk.rotation.z = Math.cos(a) * 0.22;
      stalk.rotation.x = -Math.sin(a) * 0.22;
      g.add(stalk);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1 + rnd() * 0.04, 10, 8), tipMat);
      bulb.position.set(
        Math.cos(a) * (0.16 + Math.sin(0.22) * h), 0.16 + h * 0.97, Math.sin(a) * 0.16);
      g.add(bulb);
    }
  },
  // Giant kelp (Macrocystis pyrifera), built the way it actually grows: a
  // knobbly holdfast, long flexible stipes that rise and bend over with the
  // current into a canopy, and along each stipe a run of long wrinkled blades,
  // every one buoyed by its own gas bladder at the base. Golden-olive, not
  // grass green. Everything is merged into four meshes per plant, so a kelp
  // forest costs fewer draw calls than the old stick-and-leaf version did.
  kelp(g, { lvl = 1 }, rnd, spec) {
    // Amber Kelp (the autumn event exclusive) is the same plant in fall colours.
    const amber = spec?.id === 'amberKelp';
    const stipeM = new THREE.MeshStandardMaterial({ color: amber ? 0x8a4f1a : 0x6d6528, roughness: 0.75 });
    const bladeM = new THREE.MeshStandardMaterial({
      color: amber ? 0xe08a1e : 0xa8952f, roughness: 0.55, side: THREE.DoubleSide,
      emissive: amber ? 0x5a2a04 : 0x3d3408, emissiveIntensity: amber ? 0.3 : 0.22 });
    const bulbM = new THREE.MeshStandardMaterial({ color: amber ? 0xffc04d : 0xd2bc5c, roughness: 0.35 });
    const holdM = new THREE.MeshStandardMaterial({ color: amber ? 0x6a3c14 : 0x57501f, roughness: 0.9, flatShading: true });
    const stipes = [], blades = [], bulbs = [], hold = [];
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler();
    const ONE = new THREE.Vector3(1, 1, 1);
    const place = (list, geo, pos, euler, scale = ONE) => {
      Q.setFromEuler(euler);
      geo.applyMatrix4(M.compose(pos, Q, scale));
      list.push(geo);
    };
    // One long blade: lance-shaped, ruffled along the edges, drooping at the tip.
    const bladeGeo = (len, wid, phase) => {
      const geo = new THREE.PlaneGeometry(wid, len, 2, 7);
      geo.translate(0, len / 2, 0);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i);
        const t = Math.min(1, Math.max(0, y / len));   // clamp: -1e-17 to a fractional power is NaN
        const w = 0.22 + 0.78 * Math.sin(Math.PI * Math.pow(t, 0.75));
        const edge = Math.abs(x) / (wid / 2 || 1);
        pos.setX(i, x * w);
        pos.setZ(i, Math.sin(t * 11 + phase) * 0.022 * edge - t * t * len * 0.3);
      }
      geo.computeVertexNormals();
      return geo;
    };
    const lean = rnd() * Math.PI * 2;                       // the current every stipe bends with
    const lx = Math.cos(lean), lz = Math.sin(lean);
    const N = Math.min(6, 2 + Math.ceil(lvl / 2) + (rnd() < 0.5 ? 1 : 0));
    const H = 2.5 + lvl * 0.36;
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2, rr = 0.05 + rnd() * 0.2;
      const bx = Math.cos(a) * rr, bz = Math.sin(a) * rr;
      const h = H * (0.78 + rnd() * 0.36);
      const wob = () => (rnd() - 0.5) * 0.22;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(bx, 0.1, bz),
        new THREE.Vector3(bx + lx * h * 0.05 + wob(), h * 0.3, bz + lz * h * 0.05 + wob()),
        new THREE.Vector3(bx + lx * h * 0.14 + wob(), h * 0.62, bz + lz * h * 0.14 + wob()),
        new THREE.Vector3(bx + lx * h * 0.3 + wob(), h * 0.88, bz + lz * h * 0.3 + wob()),
        new THREE.Vector3(bx + lx * h * 0.52, h * 0.97, bz + lz * h * 0.52),   // the canopy lays over
      ]);
      stipes.push(new THREE.TubeGeometry(curve, 16, 0.026, 5, false));
      const count = 7 + lvl;
      for (let j = 0; j < count; j++) {
        const k = 0.16 + 0.82 * (j / (count - 1));
        const p = curve.getPoint(k);
        const side = j % 2 ? 1 : -1;
        const len = 0.5 + k * 0.55 + rnd() * 0.18, wid = 0.11 + k * 0.06;
        // Blades stream out to alternating sides and trail down-current.
        const yaw = lean + side * (0.9 + rnd() * 0.5);
        E.set(0, -yaw + Math.PI / 2, -(1.05 + rnd() * 0.35), 'YXZ');
        place(blades, bladeGeo(len, wid, rnd() * 6.28), p, E);
        const bulb = new THREE.SphereGeometry(0.046, 7, 6);
        const out = new THREE.Vector3(Math.cos(yaw), 0.15, Math.sin(yaw)).multiplyScalar(0.05);
        E.set(0, -yaw, 0.5, 'YXZ');
        place(bulbs, bulb, p.clone().add(out), E, new THREE.Vector3(1.7, 1, 1));
      }
    }
    // Holdfast: a tangle of root-like knobs gripping the rock.
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rnd() * 0.5, r = 0.1 + rnd() * 0.16;
      const knob = new THREE.ConeGeometry(0.07 + rnd() * 0.04, 0.2 + rnd() * 0.12, 5);
      E.set((rnd() - 0.5) * 0.9, a, (rnd() - 0.5) * 0.9);
      place(hold, knob, new THREE.Vector3(Math.cos(a) * r, 0.14, Math.sin(a) * r), E);
    }
    for (const [list, m] of [[stipes, stipeM], [blades, bladeM], [bulbs, bulbM], [hold, holdM]]) {
      const merged = mergeGeometries(list, false);
      list.forEach(x => x.dispose());
      if (merged) g.add(new THREE.Mesh(merged, m));
    }
  },
  // Mangrove sapling: upright stalks with leaf blades and bud tips.
  sapling(g, { mat, tipMat, lvl = 1 }, rnd) {
    const m = mat.clone(); m.side = THREE.DoubleSide;
    const N = 3 + Math.floor(rnd() * 3) + (lvl - 1);
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2, rr = rnd() * 0.25;
      const h = 2.2 + rnd() * 1.1;
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.04, h, 5), mat);
      stalk.position.set(Math.cos(a) * rr, h / 2 + 0.1, Math.sin(a) * rr);
      stalk.rotation.z = (rnd() - 0.5) * 0.14;
      g.add(stalk);
      for (let b = 0; b < 4; b++) {
        const blade = finMesh([
          [0, 0], [0.1, 0.12, 0.06, 0.42], [0, 0.34, -0.03, 0.1], [0, 0]], m, rnd() * Math.PI * 2);
        blade.position.set(
          Math.cos(a) * rr + (rnd() - 0.5) * 0.1,
          0.4 + b * (h / 4.4), Math.sin(a) * rr + (rnd() - 0.5) * 0.1);
        blade.rotation.z = (rnd() - 0.5) * 1.2;
        g.add(blade);
      }
      const float = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), tipMat);
      float.position.set(Math.cos(a) * rr, h + 0.08, Math.sin(a) * rr);
      g.add(float);
    }
  },
  // Storage corals read as giant clams — an open shell around a glowing pearl.
  clam(g, { mat, tipMat, lvl = 1 }, rnd, spec) {
    const s = (spec?.id === 'grandReservoir' ? 1.3 : 1) * (1 + (lvl - 1) * 0.06);
    const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.42 * s, 16, 10), mat);
    bottom.scale.set(1, 0.4, 1.1); bottom.position.y = 0.16; g.add(bottom);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.42 * s, 16, 10), mat);
    top.scale.set(1, 0.4, 1.1);
    top.position.set(0, 0.3 * s, -0.14 * s);
    top.rotation.x = -0.75; g.add(top);
    const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.14 * s, 12, 10), tipMat);
    pearl.position.set(0, 0.26 * s, 0.05); g.add(pearl);
  },
  // Reef grotto: two boulders bridged by a slab, with a dark mouth.
  cave(g, { mat }, rnd) {
    for (const s of [-1, 1]) {
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), mat);
      rock.position.set(s * 0.34, 0.28, 0); rock.scale.y = 1.5;
      rock.rotation.y = rnd() * Math.PI; g.add(rock);
    }
    const slab = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), mat);
    slab.position.y = 0.62; slab.scale.set(1.4, 0.4, 1); g.add(slab);
    const mouthMat = new THREE.MeshStandardMaterial({ color: 0x0a1016, roughness: 1 });
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), mouthMat);
    mouth.position.set(0, 0.3, 0.28); g.add(mouth);
  },
  brain(g, { mat, lvl = 1 }, rnd) {
    // Lumpy hemisphere: layered sine-noise displacement; the meandering
    // ridge-and-valley detail comes from the skin's pattern-aligned bump map.
    const geo = new THREE.SphereGeometry(0.62 * (1 + (lvl - 1) * 0.09),
      34, 24, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const pos = geo.attributes.position;
    const o1 = rnd() * 10, o2 = rnd() * 10;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = Math.sin(v.x * 9 + o1) * Math.cos(v.z * 8 + o2) * 0.5
        + Math.sin(v.x * 17 + v.z * 15 + o1) * 0.5;
      v.multiplyScalar(1 + n * 0.1);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const dome = new THREE.Mesh(geo, mat);
    dome.position.y = 0.18; dome.scale.y = 0.72; g.add(dome);
  },
  plate(g, { mat, tipMat, lvl = 1 }, rnd, spec) {
    // Table corals: one broad table on a sturdy stem. Toadstool leathers: a
    // single thick mushroom cap. Everything attaches — no floating discs.
    const grow = 1 + (lvl - 1) * 0.08;
    const wide = spec?.id === 'table' || spec?.id === 'midnightTable';
    const stemH = wide ? 0.5 : 0.4;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, stemH, 9), mat);
    stem.position.y = stemH / 2 + 0.06; g.add(stem);
    if (wide) {
      const r = (0.85 + rnd() * 0.2) * grow;
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.82, 0.06, 24), mat);
      disc.position.y = stemH + 0.07;
      disc.rotation.x = (rnd() - 0.5) * 0.1; disc.rotation.z = (rnd() - 0.5) * 0.1;
      g.add(disc);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 6, 30), tipMat);
      rim.rotation.x = Math.PI / 2; rim.position.y = 0.02; disc.add(rim);
    } else {
      const r = (0.55 + rnd() * 0.12) * grow;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.55, 0.2, 20), mat);
      cap.position.y = stemH + 0.12;
      cap.rotation.x = (rnd() - 0.5) * 0.14; cap.rotation.z = (rnd() - 0.5) * 0.14;
      g.add(cap);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(r * 0.94, 18, 8,
        0, Math.PI * 2, 0, Math.PI * 0.32), mat);
      crown.position.y = -0.24 * r; cap.add(crown);
    }
  },
  polyp(g, { mat, tipMat, lvl = 1 }, rnd) {
    const mound = new THREE.Mesh(
      new THREE.SphereGeometry(0.55 * (1 + (lvl - 1) * 0.06),
        14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mat);
    mound.position.y = 0.1; mound.scale.y = 0.55; g.add(mound);
    for (let i = 0; i < 12 + (lvl - 1) * 4; i++) {
      const a = rnd() * Math.PI * 2, rr = 0.06 + rnd() * 0.34;
      const h = 0.22 + rnd() * 0.16;
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.065, h, 6), mat);
      tube.position.set(Math.cos(a) * rr, 0.28 + h / 2, Math.sin(a) * rr); g.add(tube);
      const t = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), tipMat);
      t.position.set(Math.cos(a) * rr, 0.3 + h, Math.sin(a) * rr); g.add(t);
    }
  },
  bubble(g, { mat, lvl = 1 }, rnd) {
    const m = mat.clone(); m.transparent = true; m.opacity = 0.82; m.roughness = 0.25;
    for (let i = 0; i < 11 + (lvl - 1) * 4; i++) {
      const a = rnd() * Math.PI * 2, rr = 0.05 + rnd() * 0.3;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.13 + rnd() * 0.11, 12, 12), m);
      b.position.set(Math.cos(a) * rr, 0.2 + rnd() * 0.26, Math.sin(a) * rr);
      g.add(b);
    }
  },
  // Seagrass vegetation: a clump of tall, slightly bowed blades.
  grass(g, { mat, tipMat, lvl = 1 }, rnd) {
    const N = 9 + Math.floor(rnd() * 5) + (lvl - 1) * 4;
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2, rr = rnd() * 0.42;
      const h = 0.9 + rnd() * 1.3;
      const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.05, h, 5), i % 3 ? mat : tipMat);
      blade.position.set(Math.cos(a) * rr, h / 2 + 0.08, Math.sin(a) * rr);
      blade.rotation.z = (rnd() - 0.5) * 0.5;
      blade.rotation.x = (rnd() - 0.5) * 0.5;
      g.add(blade);
    }
  },
};

let coralCounter = 1;
// Build (or REBUILD) a coral's meshes into `g`. Deterministic per seed, so an
// upgrade regrows the same individual with more branches/bulk — the extra
// level shows as new growth, not an inflated copy of the old mesh.
// Bake a finished, static model down to ONE mesh per material. The coral
// builders assemble a colony from dozens of little primitives — every branch,
// polyp and blade its own mesh — and every mesh is a draw call, paid twice once
// shadows are on. A hundred-coral reef was issuing ~10,000 draw calls a frame.
// Nothing animates inside a coral (the whole group sways and scales), so the
// parts can be merged with their transforms baked in: a staghorn goes from ~40
// draw calls to 3. Children flagged `keep`, and anything that isn't a mesh
// (halo sprites, lights), are left exactly as they were.
function mergeByMaterial(root) {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map(), spent = [];
  const M = new THREE.Matrix4();
  root.traverse(o => {
    if (!o.isMesh || o.userData.keep || Array.isArray(o.material)) return;
    for (let p = o.parent; p && p !== root; p = p.parent) if (p.userData.keep) return;
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(geo.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
    }
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) {
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    }
    geo.applyMatrix4(M.multiplyMatrices(toRoot, o.matrixWorld));
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(geo);
    spent.push(o);
  });
  if (spent.length < 2) { buckets.forEach(list => list.forEach(x => x.dispose())); return; }
  for (const o of spent) { o.parent.remove(o); o.geometry.dispose(); }
  for (const [mat, list] of buckets) {
    const merged = list.length > 1 ? mergeGeometries(list, false) : list[0];
    if (list.length > 1) list.forEach(x => x.dispose());
    if (merged) root.add(new THREE.Mesh(merged, mat));
  }
  // drop the now-empty scaffolding groups
  const empties = [];
  root.traverse(o => { if (o !== root && o.isGroup && !o.children.length && !o.userData.keep) empties.push(o); });
  empties.forEach(o => o.parent?.remove(o));
}

function buildCoralInto(g, spec, seedBase, lvl = 1) {
  const rnd = mulberry32(seedBase);
  // Slightly desaturated, rough, and barely emissive — real corals aren't neon;
  // bioluminescent species genuinely glow (and brighter after dark).
  const biolum = BIOLUM_SPECIES.has(spec.id);
  const glow = biolum ? 0.55 : 0.04;
  const color = new THREE.Color(spec.color).lerp(new THREE.Color(0x8a8a80), 0.18);
  // The individual's skin carries the color; white base keeps the pattern true.
  // The same skin drives the bump map, so ridges, rings, and pores that are
  // painted dark also sit physically lower — pattern-aligned relief.
  const tex = coralTexture(spec, seedBase % TEX_VARIANTS);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: tex, roughness: 0.8,
    emissive: color, emissiveIntensity: glow,
    bumpMap: tex, bumpScale: 0.045 });
  const tipMat = new THREE.MeshStandardMaterial({
    color: color.clone().lerp(new THREE.Color(0xfff6e8), 0.45), roughness: 0.6,
    emissive: color, emissiveIntensity: glow + 0.06 });
  const base = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), coralRock);
  base.scale.set(1, 0.35, 1); base.position.y = 0.08;
  base.rotation.y = rnd() * Math.PI; g.add(base);
  // Per-individual proportions: the body grows inside its own jittered frame,
  // so two corals of one species differ in girth and height, not just pattern.
  const inner = new THREE.Group();
  inner.scale.set(0.82 + rnd() * 0.36, 0.78 + rnd() * 0.5, 0.82 + rnd() * 0.36);
  g.add(inner);
  (BODY[shapeOf(spec)] || BODY.brain)(inner, { mat, tipMat, lvl }, rnd, spec);
  mergeByMaterial(g);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.rotation.y = rnd() * Math.PI * 2;
  g.userData.seed = rnd() * 6.28;
  g.userData.glowMats = biolum ? [mat, tipMat] : null;
}
function makeCoral(spec, lvl = 1) {
  const g = new THREE.Group();
  const seedBase = spec.id.length * 977 + coralCounter++ * 7919;
  g.userData = { grow: 0, buildSeed: seedBase };
  buildCoralInto(g, spec, seedBase, lvl);
  g.scale.setScalar(0.01);
  return g;
}
// Strip a coral group bare (disposing its meshes) so it can regrow denser.
// Children flagged `keep` (biolum halos and lights) ride through the regrow.
function clearCoralGroup(g) {
  for (let i = g.children.length - 1; i >= 0; i--) {
    const c = g.children[i];
    if (c.userData.keep) continue;
    g.remove(c);
    disposeGroup(c);
  }
}

// Build a flat fin mesh from an outline. Points are [x, y] for lineTo or
// [cpx, cpy, x, y] for a quadratic curve; the shape is drawn in the xy plane
// with +x pointing tailward, then yawed so +x maps onto -z (backward).
function finMesh(pts, mat, yaw = Math.PI / 2) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.length === 4) s.quadraticCurveTo(p[0], p[1], p[2], p[3]);
    else s.lineTo(p[0], p[1]);
  }
  const m = new THREE.Mesh(new THREE.ShapeGeometry(s), mat);
  m.rotation.y = yaw;
  return m;
}

// Sculpt a sphere into a fusiform body — pinched caudal peduncle, tapered
// snout. pinchAmt/snoutAmt tune how hard; nose points +z.
function fusiformBody(mat, pinchAmt = 0.72, snoutAmt = 0.28) {
  const geo = new THREE.SphereGeometry(0.5, 28, 18);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const u = v.z / 0.5;
    const pinch = 1 - pinchAmt * smoothstep(0.15, 0.95, -u);
    const snout = 1 - snoutAmt * smoothstep(0.55, 1, u);
    v.x *= pinch * snout;
    v.y *= (pinch * 0.4 + 0.6) * snout;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}
const scleraMat = new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 0.25 });
scleraMat.userData.shared = true;
const pupilMat = new THREE.MeshStandardMaterial({ color: 0x0a1420, roughness: 0.15 });
pupilMat.userData.shared = true;
// Both eyes share one mesh for the whites and one for the pupils (two draw
// calls per fish, not four), and eyes never cast shadows — at 150+ fish that
// is a meaningful slice of the frame.
function fishEyes(g, x, y, z, s = 1) {
  const whites = [], pupils = [];
  for (const side of [-1, 1]) {
    const w = new THREE.SphereGeometry(0.042 * s, 10, 8);
    w.translate(side * x, y, z); whites.push(w);
    const p = new THREE.SphereGeometry(0.026 * s, 8, 8);
    p.translate(side * (x + 0.018 * s), y, z + 0.014 * s); pupils.push(p);
  }
  for (const [parts, mat] of [[whites, scleraMat], [pupils, pupilMat]]) {
    const merged = mergeGeometries(parts, false);
    parts.forEach(q => q.dispose());
    const m = new THREE.Mesh(merged, mat);
    m.userData.noShadow = true;
    g.add(m);
  }
}

// Half-width of a sculpted body at height y, station z (in the body's scaled
// space): the widest vertex near that spot. Used to seat eyes ON the head —
// body girth is randomised per fish, and a fixed eye offset left the widest
// individuals with both eyes buried inside their own skull.
function bodyHalfWidthAt(body, y, z) {
  const pos = body.geometry.attributes.position, sc = body.scale;
  let best = 0, nearest = Infinity, nearestX = 0;
  for (let i = 0; i < pos.count; i++) {
    const vx = Math.abs(pos.getX(i) * sc.x), vy = pos.getY(i) * sc.y, vz = pos.getZ(i) * sc.z;
    const dy = Math.abs(vy - y), dz = Math.abs(vz - z);
    if (dy < 0.05 && dz < 0.06) best = Math.max(best, vx);
    const d = dy + dz;
    if (d < nearest) { nearest = d; nearestX = vx; }
  }
  return best || nearestX;
}

// ── Species body builders — each returns { tail?, tailAxis?, animate? } ───────
const FISH_BODY = {
  generic(g, { bodyMat, finMat, rnd }) {
    const body = fusiformBody(bodyMat);
    const deep = 0.85 + rnd() * 0.35;
    body.scale.set(0.36 * (0.85 + rnd() * 0.3), 0.62 * deep, 1.18 * (0.9 + rnd() * 0.25));
    g.add(body);
    // Seat the eyes on the actual head surface, bulging out by a third.
    fishEyes(g, Math.max(0.09, bodyHalfWidthAt(body, 0.13, 0.3) - 0.014), 0.13, 0.3);
    const pecs = [];
    for (const s of [-1, 1]) {
      const pec = finMesh([
        [0, 0], [0.16, 0.08, 0.27, 0.02], [0.2, -0.1, 0.24, -0.13], [0.08, -0.1, 0, 0]],
        finMat, s > 0 ? 1.15 : 1.98);
      pec.position.set(s * 0.15, -0.02, 0.22);
      pec.scale.setScalar(0.85 + rnd() * 0.4);
      pec.userData.baseYaw = pec.rotation.y;
      pecs.push(pec);
      g.add(pec);
    }
    const tail = new THREE.Group();
    tail.position.z = -0.48; g.add(tail);
    const caudal = finMesh([
      [0, 0.05], [0.35, 0.14, 0.55, 0.42], [0.3, 0.1, 0.2, 0],
      [0.3, -0.1, 0.55, -0.42], [0.35, -0.14, 0, -0.05]], finMat);
    caudal.scale.set(0.85 + rnd() * 0.4, 0.8 + rnd() * 0.45, 1);
    tail.add(caudal);
    const dorsal = finMesh([
      [0, 0], [0.08, 0.3, 0.26, 0.28], [0.42, 0.14, 0.55, 0.01], [0.28, -0.04, 0, 0]], finMat);
    dorsal.position.set(0, 0.26 * deep, 0.28);
    dorsal.scale.set(0.9 + rnd() * 0.35, 0.7 + rnd() * 0.55, 1);
    g.add(dorsal);
    const anal = finMesh([
      [0, 0], [0.1, -0.16, 0.24, -0.15], [0.3, -0.06, 0.32, 0.01], [0.16, 0.03, 0, 0]], finMat);
    anal.position.set(0, -0.2 * deep, -0.05);
    g.add(anal);
    return { tail, pecs };
  },
  // Surgeonfish (tangs): a tall, laterally flattened oval with a small pointed
  // snout, long low dorsal and anal fins running most of the body, a truncate
  // tail, and the "scalpel" — a pale spine at the tail base. Zebrasoma (the
  // Yellow Tang) is taller with sail-like fins; Acanthurus (Blue, Powder
  // Brown) is more oval. Blue Tang carries its yellow tail.
  tang(g, { bodyMat, spec, rnd }) {
    const sail = spec.id === 'yellowTang';
    const finM = new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.color).multiplyScalar(spec.id === 'powderBrownTang' ? 0.55 : 0.92),
      roughness: 0.4, side: THREE.DoubleSide });
    const tailM = spec.id === 'blueTang' ? new THREE.MeshStandardMaterial({ color: 0xffeb3b, roughness: 0.4, side: THREE.DoubleSide })
      : spec.id === 'powderBrownTang' ? new THREE.MeshStandardMaterial({ color: 0xcfd8dc, roughness: 0.4, side: THREE.DoubleSide })
      : finM;
    const body = fusiformBody(bodyMat, 0.62, 0.5);
    body.scale.set(0.2, sail ? 0.74 : 0.6, 1.08 * (0.95 + rnd() * 0.1));
    g.add(body);
    fishEyes(g, 0.1, 0.12, 0.34, 0.85);
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.2, 8), bodyMat);
    snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.02, 0.58); g.add(snout);
    const H = sail ? 0.4 : 0.26;
    const dorsal = finMesh([[0, 0], [0.12, H, 0.4, H * 1.05], [0.8, H * 0.7, 0.98, 0.02], [0, 0]], finM);
    dorsal.position.set(0, (sail ? 0.3 : 0.24), 0.42); g.add(dorsal);
    const anal = finMesh([[0, 0], [0.16, H * 0.85, 0.42, H * 0.9], [0.8, H * 0.6, 0.94, 0.02], [0, 0]], finM);
    anal.scale.y = -1; anal.position.set(0, -(sail ? 0.3 : 0.24), 0.36); g.add(anal);
    for (const sd of [-1, 1]) {
      const pec = finMesh([[0, 0], [0.16, 0.06, 0.24, -0.04], [0.16, -0.1, 0.02, -0.04], [0, 0]], finM, sd > 0 ? 1.2 : 1.94);
      pec.position.set(sd * 0.11, -0.02, 0.24); g.add(pec);
      const scalpel = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.03, 0.09), scleraMat);
      scalpel.position.set(sd * 0.1, 0.0, -0.44); g.add(scalpel);
    }
    const tail = new THREE.Group();
    tail.position.z = -0.56; g.add(tail);
    const caudal = finMesh([[0, 0.08], [0.18, 0.2, 0.3, 0.26], [0.22, 0.04, 0.22, -0.04], [0.3, -0.26, 0.18, -0.2], [0, -0.08]], tailM);
    tail.add(caudal);
    return { tail };
  },
  // Damselfish and chromis: small, deep-bodied ovals with a single long
  // dorsal, a squared-off snout and a cleanly forked tail.
  damsel(g, { bodyMat, spec, rnd }) {
    const finM = new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.accentColor ?? spec.color), roughness: 0.4,
      side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const body = fusiformBody(bodyMat, 0.7, 0.32);
    body.scale.set(0.24, 0.5 * (0.95 + rnd() * 0.12), 0.98);
    g.add(body);
    fishEyes(g, 0.1, 0.1, 0.32, 0.9);
    const dorsal = finMesh([[0, 0], [0.1, 0.22, 0.34, 0.24], [0.62, 0.22, 0.78, 0.02], [0, 0]], finM);
    dorsal.position.set(0, 0.2, 0.36); g.add(dorsal);
    const anal = finMesh([[0, 0], [0.1, 0.14, 0.3, 0.16], [0.42, 0.12, 0.5, 0.02], [0, 0]], finM);
    anal.scale.y = -1; anal.position.set(0, -0.18, 0.08); g.add(anal);
    for (const sd of [-1, 1]) {
      const pec = finMesh([[0, 0], [0.14, 0.05, 0.2, -0.04], [0.12, -0.09, 0.02, -0.03], [0, 0]], finM, sd > 0 ? 1.2 : 1.94);
      pec.position.set(sd * 0.12, -0.03, 0.2); g.add(pec);
    }
    const tail = new THREE.Group();
    tail.position.z = -0.46; g.add(tail);
    const caudal = finMesh([[0, 0.06], [0.22, 0.14, 0.4, 0.34], [0.14, 0.02, 0.14, -0.02], [0.4, -0.34, 0.22, -0.14], [0, -0.06]], finM);
    tail.add(caudal);
    return { tail };
  },
  // Cardinalfish: big eyes for a nocturnal life, TWO separate dorsal fins,
  // a rounded tail. The Banggai trails long, tapering fins and a deeply
  // forked tail; the Pajama is short and round.
  cardinal(g, { bodyMat, spec, rnd }) {
    const banggai = spec.id === 'banggaiCardinalfish';
    const pajama = spec.id === 'pajamaCardinalfish';
    const finM = new THREE.MeshStandardMaterial({
      color: new THREE.Color(banggai ? 0x263238 : spec.accentColor ?? spec.color), roughness: 0.4,
      side: THREE.DoubleSide, transparent: true, opacity: banggai ? 0.9 : 0.8 });
    const body = fusiformBody(bodyMat, 0.66, 0.3);
    body.scale.set(0.24, pajama ? 0.5 : 0.42, pajama ? 0.9 : 1.02);
    g.add(body);
    fishEyes(g, 0.1, 0.1, 0.3, 1.35);
    const L = banggai ? 2.2 : 1;
    const d1 = finMesh([[0, 0], [0.04, 0.22 * L, 0.1, 0.26 * L], [0.16, 0.08, 0.2, 0], [0, 0]], finM);
    d1.position.set(0, 0.2, 0.22); g.add(d1);
    const d2 = finMesh([[0, 0], [0.04, 0.18 * L, 0.12, 0.22 * L], [0.24, 0.06, 0.28, 0], [0, 0]], finM);
    d2.position.set(0, 0.18, -0.08); g.add(d2);
    const anal = finMesh([[0, 0], [0.04, 0.16 * L, 0.12, 0.2 * L], [0.24, 0.06, 0.28, 0], [0, 0]], finM);
    anal.scale.y = -1; anal.position.set(0, -0.17, -0.08); g.add(anal);
    for (const sd of [-1, 1]) {
      const pelvic = finMesh([[0, 0], [0.04, 0.12 * L, 0.08, 0.14 * L], [0.14, 0.04, 0.16, 0], [0, 0]], finM);
      pelvic.scale.y = -1; pelvic.position.set(sd * 0.05, -0.16, 0.2); g.add(pelvic);
      const pec = finMesh([[0, 0], [0.12, 0.05, 0.18, -0.03], [0.1, -0.08, 0.02, -0.03], [0, 0]], finM, sd > 0 ? 1.2 : 1.94);
      pec.position.set(sd * 0.12, -0.02, 0.2); g.add(pec);
    }
    const tail = new THREE.Group();
    tail.position.z = -0.5; g.add(tail);
    const caudal = banggai
      ? finMesh([[0, 0.05], [0.3, 0.2, 0.62, 0.42], [0.16, 0.02, 0.16, -0.02], [0.62, -0.42, 0.3, -0.2], [0, -0.05]], finM)
      : finMesh([[0, 0.06], [0.16, 0.18, 0.26, 0.14], [0.3, 0, 0.26, -0.14], [0.16, -0.18, 0, -0.06]], finM);
    tail.add(caudal);
    return { tail };
  },
  shark(g, { bodyMat, spec, rnd }) {
    // Long, slim, pointed; fins are body-colored, tail heterocercal.
    const finM = new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.color).multiplyScalar(0.92), roughness: 0.4,
      side: THREE.DoubleSide });
    const body = fusiformBody(bodyMat, 0.78, 0.5);
    body.scale.set(0.3, 0.4, 1.55 * (0.95 + rnd() * 0.15));
    g.add(body);
    fishEyes(g, 0.085, 0.08, 0.52, 0.75);
    const dorsal = finMesh([
      [0, 0], [0.06, 0.34, 0.24, 0.32], [0.3, 0.12, 0.4, 0], [0, 0]], finM);
    dorsal.position.set(0, 0.17, 0.22); g.add(dorsal);
    const dorsal2 = finMesh([[0, 0], [0.04, 0.12, 0.13, 0.11], [0.18, 0.03, 0.2, 0], [0, 0]], finM);
    dorsal2.position.set(0, 0.1, -0.42); g.add(dorsal2);
    for (const s of [-1, 1]) {
      const pec = finMesh([[0, 0], [0.3, 0.02, 0.44, -0.12], [0.24, -0.14, 0.06, -0.06], [0, 0]],
        finM, s > 0 ? 1.2 : 1.94);
      pec.position.set(s * 0.13, -0.06, 0.32); g.add(pec);
      // Gill slits: three thin dark lines on each flank.
      for (let k = 0; k < 3; k++) {
        const slit = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.1, 0.012), pupilMat);
        slit.position.set(s * 0.135, 0.02, 0.42 - k * 0.05); g.add(slit);
      }
    }
    const tail = new THREE.Group();
    tail.position.z = -0.72; g.add(tail);
    const caudal = finMesh([
      [0, 0.04], [0.3, 0.2, 0.42, 0.5], [0.26, 0.14, 0.16, 0],
      [0.24, -0.08, 0.3, -0.24], [0.2, -0.1, 0, -0.04]], finM);   // big upper lobe
    tail.add(caudal);
    return { tail };
  },
  // Ocean sunfish: a tall, flattened disc with no tail — the body ends in a
  // wavy clavus — and one huge dorsal and anal fin it sculls with.
  mola(g, { bodyMat, spec, rnd }) {
    const finM = new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.color).multiplyScalar(0.85), roughness: 0.4,
      side: THREE.DoubleSide });
    const body = fusiformBody(bodyMat, 0.25, 0.45);        // barely pinched: a disc
    body.scale.set(0.26, 1.05, 1.1 * (0.95 + rnd() * 0.1));
    g.add(body);
    fishEyes(g, 0.1, 0.12, 0.42, 0.8);
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 12), pupilMat);
    mouth.position.set(0, -0.02, 0.54); g.add(mouth);
    // The fins sit on the rear half of the disc and reach about a body-height.
    const finPts = [[0, 0], [-0.08, 0.5, 0.02, 0.62], [0.22, 0.46, 0.3, 0], [0, 0]];
    const dorsal = finMesh(finPts, finM);
    dorsal.position.set(0, 0.42, -0.16); g.add(dorsal);
    const anal = finMesh(finPts, finM);
    anal.scale.y = -1; anal.position.set(0, -0.42, -0.16); g.add(anal);
    // Clavus: the scalloped rear edge where a tail would be.
    const clavus = finMesh([
      [0, 0.44], [0.16, 0.36, 0.1, 0.22], [0.2, 0.1, 0.1, 0], [0.2, -0.1, 0.1, -0.22],
      [0.16, -0.36, 0, -0.44], [0, 0.44]], finM);
    clavus.position.set(0, 0, -0.48); g.add(clavus);
    for (const sd of [-1, 1]) {
      const pec = finMesh([[0, 0], [0.16, 0.04, 0.22, -0.06], [0.14, -0.1, 0.02, -0.04], [0, 0]],
        finM, sd > 0 ? 1.2 : 1.94);
      pec.position.set(sd * 0.12, 0.02, 0.12); g.add(pec);
    }
    const animate = (t, phase) => {
      dorsal.rotation.z = Math.sin(t * 2.4 + phase) * 0.22;       // opposed sculling
      anal.rotation.z = -Math.sin(t * 2.4 + phase) * 0.22;
      g.rotation.z = Math.sin(t * 0.6 + phase) * 0.08;            // lolling, as they do
    };
    return { animate };
  },
  dolphin(g, { bodyMat, spec, rnd }) {
    const finM = new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.color).multiplyScalar(0.9), roughness: 0.35,
      side: THREE.DoubleSide });
    const body = fusiformBody(bodyMat, 0.75, 0.2);
    body.scale.set(0.34, 0.42, 1.5); g.add(body);
    const beak = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.16, 4, 8), bodyMat);
    beak.rotation.x = Math.PI / 2; beak.position.set(0, -0.03, 0.76); g.add(beak);
    fishEyes(g, 0.1, 0.05, 0.6, 0.7);
    const dorsal = finMesh([[0, 0], [0.05, 0.26, 0.2, 0.22], [0.24, 0.08, 0.3, 0], [0, 0]], finM);
    dorsal.position.set(0, 0.19, 0.05); g.add(dorsal);
    for (const s of [-1, 1]) {
      const flip = finMesh([[0, 0], [0.2, 0.0, 0.3, -0.12], [0.16, -0.12, 0.04, -0.04], [0, 0]],
        finM, s > 0 ? 1.25 : 1.9);
      flip.position.set(s * 0.14, -0.1, 0.4); g.add(flip);
    }
    // Horizontal fluke on a pitching pivot (cetaceans beat up-and-down).
    const tail = new THREE.Group();
    tail.position.z = -0.72; g.add(tail);
    const fluke = finMesh([
      [0, 0.02], [0.28, 0, 0.5, 0.24], [0.28, 0.2, 0.06, 0.12], [0, 0.1],
      [-0.06, 0.12], [-0.28, 0.2, -0.5, 0.24], [-0.28, 0, 0, 0.02]], finM, 0);
    fluke.rotation.x = -Math.PI / 2;
    tail.add(fluke);
    return { tail, tailAxis: 'x' };
  },
  otter(g, { bodyMat, spec, rnd }) {
    // Sea otter rafting on its back: brown body belly-up at the surface,
    // pale face looking skyward, paws folded on the chest, rudder tail aft.
    const furM = bodyMat;
    const faceM = new THREE.MeshStandardMaterial({
      color: spec.accentColor ?? 0xa1887f, roughness: 0.7 });
    const darkM = new THREE.MeshStandardMaterial({ color: 0x3e2b20, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.75, 6, 12), furM);
    body.rotation.x = Math.PI / 2;
    body.scale.set(1.15, 0.85, 1); g.add(body);
    // Pale chest/belly patch facing UP
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 9), faceM);
    chest.scale.set(0.95, 0.4, 1.35); chest.position.set(0, 0.16, 0.05); g.add(chest);
    // Head tilted up out of the water
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), furM);
    head.position.set(0, 0.14, 0.55); g.add(head);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 9), faceM);
    face.position.set(0, 0.26, 0.58); face.scale.set(0.95, 0.8, 0.9); g.add(face);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), furM);
      ear.position.set(s * 0.16, 0.24, 0.48); g.add(ear);
      // Paws folded on the chest
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.075, 7, 6), furM);
      paw.position.set(s * 0.1, 0.26, 0.22); g.add(paw);
      // Webbed hind feet poking up
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 7, 6), darkM);
      foot.scale.set(0.7, 0.35, 1.3);
      foot.position.set(s * 0.14, 0.2, -0.42); g.add(foot);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), darkM);
    nose.position.set(0, 0.32, 0.7); g.add(nose);
    fishEyes(g, 0.08, 0.36, 0.62, 0.7);
    // Rudder tail on a wag pivot
    const tail = new THREE.Group();
    tail.position.set(0, 0.02, -0.58); g.add(tail);
    const fluke = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.34, 4, 7), furM);
    fluke.rotation.x = Math.PI / 2 + 0.15;
    fluke.scale.set(1.3, 1, 0.5);
    fluke.position.z = -0.2; tail.add(fluke);
    const animate = (t, phase) => {
      tail.rotation.y = Math.sin(t * 2.2 + phase) * 0.3;      // lazy scull
      g.rotation.z = Math.sin(t * 0.8 + phase) * 0.06;        // rocking with the swell
    };
    return { animate };
  },
  sirenian(g, { bodyMat, spec, rnd }) {
    // Manatee / dugong: rotund, blunt snout, paddle tail.
    const finM = new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.color).multiplyScalar(0.88), roughness: 0.5,
      side: THREE.DoubleSide });
    const body = fusiformBody(bodyMat, 0.6, 0.1);
    body.scale.set(0.52, 0.52, 1.25); g.add(body);
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), bodyMat);
    snout.position.set(0, -0.08, 0.6); snout.scale.set(1, 0.75, 0.7); g.add(snout);
    fishEyes(g, 0.13, 0.08, 0.5, 0.6);
    for (const s of [-1, 1]) {
      const flip = finMesh([[0, 0], [0.16, 0, 0.24, -0.14], [0.12, -0.13, 0.02, -0.04], [0, 0]],
        finM, s > 0 ? 1.3 : 1.85);
      flip.position.set(s * 0.2, -0.16, 0.32); g.add(flip);
    }
    const tail = new THREE.Group();
    tail.position.z = -0.62; g.add(tail);
    const fluked = spec.id === 'dugong';
    const paddle = fluked
      ? finMesh([[0, 0.02], [0.26, 0, 0.46, 0.24], [0.24, 0.16, 0.05, 0.1], [-0.05, 0.1],
        [-0.24, 0.16, -0.46, 0.24], [-0.26, 0, 0, 0.02]], finM, 0)
      : finMesh([[0, 0], [0.34, 0.02, 0.34, 0.26], [0.3, 0.42, 0, 0.42],
        [-0.3, 0.42, -0.34, 0.26], [-0.34, 0.02, 0, 0]], finM, 0);
    paddle.rotation.x = -Math.PI / 2;
    tail.add(paddle);
    return { tail, tailAxis: 'x' };
  },
  eel(g, { bodyMat, rnd }) {
    // Chain of tapering segments; the whole body undulates in the loop.
    const segs = [];
    const N = 9;
    for (let i = 0; i < N; i++) {
      const k = i / (N - 1);
      const r = 0.13 * (1 - k * 0.68);
      const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), bodyMat);
      seg.scale.z = 2.1;
      seg.position.z = 0.55 - i * 0.19;
      g.add(seg); segs.push(seg);
    }
    fishEyes(g, 0.07, 0.07, 0.68, 0.65);
    const animate = (t, phase) => {
      for (let i = 1; i < N; i++) {
        segs[i].position.x = Math.sin(t * 3.4 + phase - i * 0.75) * 0.05 * (i * 0.45 + 0.4);
      }
    };
    return { animate };
  },
  pipefish(g, { bodyMat, finMat, spec, rnd }) {
    // A straightened seahorse: pencil-thin body armoured in bony rings
    // (angular, not round, in cross-section), a long tube snout with a tiny
    // upturned mouth, one small fluttering dorsal fin and a little fan tail.
    // Pipefish swim stiffly — the fin does the work, the body barely bends.
    const ringM = new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.accentColor ?? spec.color).multiplyScalar(0.85), roughness: 0.7 });
    const N = 16, L = 1.8, z0 = 0.62, step = L / N;
    const segs = [];
    for (let i = 0; i < N; i++) {
      const k = i / (N - 1);
      const r = 0.056 * (1 - k * 0.66) + 0.01;
      const seg = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r, step * 1.12, 7), bodyMat);
      body.rotation.x = Math.PI / 2;
      seg.add(body);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.04, r * 0.2, 4, 7), ringM);
      ring.position.z = step * 0.5;
      seg.add(ring);
      seg.position.z = z0 - i * step;
      g.add(seg); segs.push(seg);
    }
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), bodyMat);
    head.scale.set(0.9, 0.95, 1.7); head.position.z = z0 + 0.1; g.add(head);
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.027, 0.36, 6), bodyMat);
    snout.rotation.x = Math.PI / 2; snout.position.z = z0 + 0.36; g.add(snout);
    const mouth = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.05, 6), ringM);
    mouth.rotation.x = -Math.PI / 2 + 0.5; mouth.position.set(0, 0.012, z0 + 0.55); g.add(mouth);
    fishEyes(g, 0.05, 0.022, z0 + 0.13, 0.62);
    const dorsal = finMesh([[0, 0], [0.04, 0.13, 0.17, 0.11], [0.24, 0.0, 0, 0]], finMat);
    dorsal.position.set(0, 0.035, z0 - L * 0.38); g.add(dorsal);
    const fan = finMesh([[0, 0], [0.1, 0.075], [0.135, 0], [0.1, -0.075], [0, 0]], finMat);
    fan.position.z = z0 - L + step * 0.4; g.add(fan);
    const animate = (t, phase) => {
      for (let i = 2; i < N; i++) {
        segs[i].position.x = Math.sin(t * 2.0 + phase - i * 0.45) * 0.0035 * i;
      }
      fan.position.x = segs[N - 1].position.x;
      dorsal.rotation.z = Math.sin(t * 17 + phase) * 0.22;      // the blur of a pipefish's fin
      dorsal.position.x = segs[Math.round(N * 0.38)].position.x;
    };
    return { animate };
  },
  octopus(g, { bodyMat, spec, rnd }) {
    // Bulbous mantle, big eyes, eight writhing tapered arms.
    const squid = spec.id === 'giantSquid';
    const mantle = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 12), bodyMat);
    mantle.scale.set(0.9, 1, squid ? 1.8 : 1.1);
    mantle.position.set(0, 0.22, -0.2); g.add(mantle);
    if (squid) {
      const finM = new THREE.MeshStandardMaterial({
        color: spec.accentColor ?? spec.color, roughness: 0.45, side: THREE.DoubleSide });
      const fins = finMesh([[0, 0], [0.3, 0.28, 0, 0.5], [-0.3, 0.28, 0, 0]], finM, 0);
      fins.position.set(0, 0.32, -0.72); fins.rotation.x = 0.5; g.add(fins);
    }
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), bodyMat);
    head.position.set(0, 0.08, 0.14); g.add(head);
    fishEyes(g, 0.14, 0.14, 0.2, 1.4);
    const arms = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const arm = new THREE.Group();
      arm.position.set(Math.cos(a) * 0.12, -0.02, 0.18 + Math.sin(a) * 0.06);
      arm.rotation.y = -a;
      for (let s = 0; s < 5; s++) {
        const r = 0.05 * (1 - s * 0.17);
        const bead = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 6), bodyMat);
        bead.position.set(0.09 + s * 0.1, -0.05 - s * 0.045 - s * s * 0.012, 0);
        arm.add(bead);
      }
      arm.userData.base = -a;
      g.add(arm); arms.push(arm);
    }
    const animate = (t, phase) => {
      arms.forEach((arm, i) => {
        arm.rotation.y = arm.userData.base + Math.sin(t * 1.4 + phase + i * 1.7) * 0.14;
        arm.rotation.x = Math.sin(t * 1.1 + phase + i) * 0.1;
      });
    };
    return { animate };
  },
  cuttlefish(g, { bodyMat, spec, rnd }) {
    // Broad flattened mantle with an undulating skirt and short arm cluster.
    const finM = new THREE.MeshStandardMaterial({
      color: spec.accentColor ?? spec.color, roughness: 0.45,
      side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const mantle = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), bodyMat);
    mantle.scale.set(0.62, 0.38, 1.05); g.add(mantle);
    const skirt = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 6, 26), finM);
    skirt.rotation.x = Math.PI / 2;
    skirt.scale.set(0.72, 1.05, 0.5); g.add(skirt);
    fishEyes(g, 0.15, 0.06, 0.36, 1.2);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const armlet = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.16, 3, 6), bodyMat);
      armlet.position.set(Math.cos(a) * 0.07, Math.sin(a) * 0.05 - 0.02, 0.5);
      armlet.rotation.x = Math.PI / 2 + (rnd() - 0.5) * 0.4;
      g.add(armlet);
    }
    return {};
  },
  seahorse(g, { bodyMat, finMat, rnd }) {
    // Upright S-curve: crowned head, tube snout, belly, curled tail.
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.52, 0.02), new THREE.Vector3(0, 0.38, 0.12),
      new THREE.Vector3(0, 0.16, 0.1), new THREE.Vector3(0, -0.05, -0.02),
      new THREE.Vector3(0, -0.24, -0.08), new THREE.Vector3(0, -0.36, 0.0),
      new THREE.Vector3(0, -0.34, 0.12), new THREE.Vector3(0, -0.24, 0.14),
      new THREE.Vector3(0, -0.2, 0.05),
    ]);
    for (let i = 0; i <= 16; i++) {
      const k = i / 16;
      const p = curve.getPoint(k);
      const r = 0.1 * (1 - k * 0.8) + 0.015;
      const bead = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 7), bodyMat);
      bead.position.copy(p);
      bead.scale.z = 1.4;
      g.add(bead);
    }
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.04, 0.2, 6), bodyMat);
    snout.rotation.x = Math.PI / 2 - 0.35;
    snout.position.set(0, 0.5, 0.16); g.add(snout);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 5), bodyMat);
    crown.position.set(0, 0.64, 0.0); g.add(crown);
    fishEyes(g, 0.06, 0.54, 0.08, 0.7);
    const dorsal = finMesh([[0, 0], [0.06, 0.16, 0.2, 0.1], [0.16, -0.02, 0, 0]], finMat);
    dorsal.position.set(0, 0.12, -0.02);
    dorsal.rotation.z = -0.4;
    g.add(dorsal);
    return {};
  },
  turtle(g, { bodyMat, spec, rnd }) {
    const skinM = new THREE.MeshStandardMaterial({
      color: spec.accentColor ?? 0x7b5230, roughness: 0.6 });
    const finM = new THREE.MeshStandardMaterial({
      color: spec.accentColor ?? 0x7b5230, roughness: 0.55, side: THREE.DoubleSide });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), bodyMat);
    shell.scale.set(0.85, 0.42, 1); g.add(shell);
    const plastron = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 10), skinM);
    plastron.scale.set(0.78, 0.24, 0.92); plastron.position.y = -0.08; g.add(plastron);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), skinM);
    head.position.set(0, 0.02, 0.5); head.scale.z = 1.25; g.add(head);
    fishEyes(g, 0.08, 0.08, 0.58, 0.6);
    // Front flippers on a pivot so they slowly row.
    const tail = new THREE.Group();                            // reuse wag slot
    g.add(tail);
    for (const s of [-1, 1]) {
      const front = finMesh([[0, 0], [0.3, 0.06, 0.46, -0.08], [0.24, -0.16, 0.05, -0.06], [0, 0]],
        finM, s > 0 ? 1.35 : 1.8);
      front.position.set(s * 0.32, -0.04, 0.3);
      tail.add(front);
      const rear = finMesh([[0, 0], [0.14, -0.02, 0.22, -0.1], [0.1, -0.1, 0.02, -0.03], [0, 0]],
        finM, s > 0 ? 1.5 : 1.65);
      rear.position.set(s * 0.28, -0.05, -0.34);
      g.add(rear);
    }
    return { tail, tailAxis: 'x' };
  },
  ray(g, { bodyMat, spec, rnd }) {
    // Flattened disc body with broad flapping wings; skin pattern (spots)
    // carries onto the wings. Manta gets cephalic lobes and a bigger span.
    const manta = spec.id === 'mantaRay';
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 18, 12), bodyMat);
    body.scale.set(0.42, 0.15, 0.8); g.add(body);
    fishEyes(g, 0.1, 0.08, 0.28, 0.6);
    const pivots = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.1, 0.02, 0);
      if (s < 0) pivot.scale.x = -1;
      const wing = finMesh([
        [0, 0.3], [0.45, 0.26, 0.75, 0], [0.4, -0.2, 0.1, -0.45], [0, -0.3], [0, 0.3]],
        bodyMat, 0);
      wing.rotation.x = Math.PI / 2;                          // lay flat, +y → forward
      if (manta) wing.scale.setScalar(1.25);
      pivot.add(wing);
      g.add(pivot); pivots.push(pivot);
    }
    const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.02, 0.75, 5), bodyMat);
    whip.rotation.x = Math.PI / 2 + 0.12;
    whip.position.set(0, 0.03, -0.65); g.add(whip);
    if (manta) {
      for (const s of [-1, 1]) {
        const lobe = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.2, 6), bodyMat);
        lobe.rotation.x = Math.PI / 2 - 0.5;
        lobe.position.set(s * 0.12, -0.04, 0.36); g.add(lobe);
      }
    }
    // Wingbeat matches the animal: mantas take slow, deep strokes; eagle and
    // abyssal rays flick quicker, shallower beats as they hug the bottom.
    const rate = manta ? 1.2 : spec.id === 'abyssalRay' ? 1.7 : 2.3;
    const amp = manta ? 0.52 : 0.4;
    const animate = (t, phase) => {
      const flap = Math.sin(t * rate + phase) * amp;
      pivots[0].rotation.z = flap;
      pivots[1].rotation.z = flap;
      g.rotation.z = Math.sin(t * rate + phase - 0.6) * 0.06;  // gentle roll follow-through
    };
    return { animate };
  },
  nautilus(g, { bodyMat, spec, rnd }) {
    // Chambered nautilus: cream coiled shell with red-brown flame stripes,
    // a hood over a crowd of short tentacles, pinhole eyes. Built into an
    // inner group flipped 180° — nautiluses jet SHELL-first, tentacles trailing.
    const body = new THREE.Group();
    body.rotation.y = Math.PI;
    g.add(body);
    const stripeM = new THREE.MeshStandardMaterial({
      color: spec.accentColor ?? 0xb04a2a, roughness: 0.55 });
    const fleshM = new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.color).multiplyScalar(0.82), roughness: 0.6 });
    const whorl = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 14), bodyMat);
    whorl.scale.set(0.52, 1, 1); whorl.position.set(0, 0.06, -0.14); body.add(whorl);
    // Flame stripes arc over the shell back from the coil outward.
    for (let i = 0; i < 7; i++) {
      const a = -0.9 + i * 0.42;                              // fan across the top/back
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.018, 5, 10, 0.5), stripeM);
      stripe.position.set(0, 0.06, -0.14);
      stripe.rotation.y = Math.PI / 2;                        // ring lies in the y/z plane
      stripe.rotation.x = a;
      stripe.scale.x = 0.54;                                  // follow the flattened shell
      body.add(stripe);
    }
    // The coil: a logarithmic spiral ridge traced on BOTH faces of the shell,
    // winding ~1.5 whorls from the rim into the centre — the nautilus's
    // signature. Bead size and offset shrink with the spiral radius.
    const coilC = { y: 0.08, z: -0.12 };
    for (const side of [-1, 1]) {
      for (let i = 0; i < 26; i++) {
        const th = i * 0.36;                                  // ~1.5 turns total
        const r = 0.3 * Math.exp(-0.185 * th);
        const bead = new THREE.Mesh(
          new THREE.SphereGeometry(0.022 + r * 0.09, 7, 6), stripeM);
        bead.position.set(
          side * (0.09 + r * 0.32),
          coilC.y + Math.sin(th - 0.7) * r,
          coilC.z + Math.cos(th - 0.7) * r);
        body.add(bead);
      }
    }
    // Hood, tentacle crowd, and eyes at the shell opening (which trails aft).
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), fleshM);
    hood.scale.set(0.9, 0.6, 1); hood.position.set(0, 0.02, 0.32); body.add(hood);
    const tentacles = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 8 - 0.5) * 1.6;
      const tnt = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.24, 5), fleshM);
      tnt.position.set(Math.sin(a) * 0.11, -0.1, 0.42 + Math.cos(a) * 0.04);
      tnt.rotation.x = Math.PI / 2 + 0.5 + (rnd() - 0.5) * 0.3;
      tnt.rotation.z = -a * 0.5;
      body.add(tnt); tentacles.push(tnt);
    }
    fishEyes(body, 0.13, 0.06, 0.3, 0.9);
    const animate = (t, phase) => {
      // Buoyant rocking as it jets, tentacles trailing and feeling about.
      g.rotation.z = Math.sin(t * 1.1 + phase) * 0.08;
      tentacles.forEach((tnt, i) => {
        tnt.rotation.x = Math.PI / 2 + 0.5 + Math.sin(t * 1.8 + phase + i * 0.9) * 0.18;
      });
    };
    return { animate };
  },
  puffer(g, { bodyMat, finMat, rnd, spec }) {
    // Round body that periodically inflates, spines extending as it puffs.
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 13), bodyMat);
    body.scale.set(0.82, 0.8, 1); g.add(body);
    fishEyes(g, 0.16, 0.16, 0.3, 1.15);
    const spikeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.color).lerp(new THREE.Color(0xffffff), 0.3), roughness: 0.5 });
    const spikes = new THREE.Group();
    const dir = new THREE.Vector3();
    const srnd = mulberry32(hashId(spec.id) + 7);
    for (let i = 0; i < 26; i++) {
      dir.set(srnd() - 0.5, srnd() - 0.5, srnd() - 0.5).normalize();
      if (dir.z > 0.8) continue;                              // keep the face clear
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.14, 5), spikeMat);
      spike.position.copy(dir).multiplyScalar(0.38);
      spike.position.multiply(body.scale);
      spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      spikes.add(spike);
    }
    g.add(spikes);
    const tail = new THREE.Group();
    tail.position.z = -0.42; g.add(tail);
    const caudal = finMesh([
      [0, 0.03], [0.2, 0.06, 0.3, 0.18], [0.18, 0, 0.3, -0.18], [0.2, -0.06, 0, -0.03]], finMat);
    tail.add(caudal);
    const baseScale = body.scale.clone();
    const animate = (t, phase) => {
      tail.rotation.y = Math.sin(t * 7 + phase) * 0.5;
      // Puff up briefly every ~18 s, individual timing per fish.
      const cyc = Math.sin(t * 0.35 + phase * 2);
      const puff = smoothstep(0.9, 0.97, cyc);
      body.scale.copy(baseScale).multiplyScalar(1 + 0.5 * puff);
      spikes.scale.setScalar(1 + 0.55 * puff);
    };
    return { animate };
  },
  horseshoe(g, { bodyMat, spec }) {
    // Horseshoe crab: domed horseshoe carapace, hinged abdomen with spined
    // edges, long telson spike. It crawls the flats — no fins, no tail wag.
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), bodyMat);
    dome.scale.set(0.95, 0.4, 1.1); g.add(dome);
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.05, 16), bodyMat);
    skirt.scale.set(0.95, 1, 1.1); skirt.position.y = 0.02; g.add(skirt);
    const abdomen = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), bodyMat);
    abdomen.scale.set(0.82, 0.42, 0.9); abdomen.position.set(0, -0.01, -0.5); g.add(abdomen);
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const spine = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.1, 4), bodyMat);
        spine.position.set(s * (0.2 - k * 0.045), 0.06, -0.6 - k * 0.06);
        spine.rotation.z = s * -1.2; g.add(spine);
      }
    }
    const telson = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.7, 5), bodyMat);
    telson.rotation.x = -Math.PI / 2 - 0.08;
    telson.position.set(0, 0.04, -1.05); g.add(telson);
    fishEyes(g, 0.2, 0.12, 0.16, 0.55);   // compound eyes up on the dome
    return {};
  },
  urchin(g, { bodyMat, spec }) {
    // Sea urchin: dark test bristling with long thin spines (Diadema-style).
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), bodyMat);
    ball.scale.y = 0.85; g.add(ball);
    const spineM = new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.color).lerp(new THREE.Color(spec.accentColor ?? 0x7b1fa2), 0.4),
      roughness: 0.4 });
    const dir = new THREE.Vector3();
    const srnd = mulberry32(hashId(spec.id) + 13);
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 48; i++) {
      dir.set(srnd() - 0.5, srnd() - 0.35, srnd() - 0.5).normalize();
      if (dir.y < -0.55) continue;                            // underside sits on the sand
      const len = 0.45 + srnd() * 0.4;
      const spine = new THREE.Mesh(new THREE.ConeGeometry(0.012, len, 4), spineM);
      spine.position.copy(dir).multiplyScalar(0.24 + len / 2);
      spine.quaternion.setFromUnitVectors(up, dir);
      g.add(spine);
    }
    const animate = (t, phase) => { g.rotation.y = phase + Math.sin(t * 0.3 + phase) * 0.15; };
    return { animate };
  },
  sandDollar(g, { bodyMat, spec }) {
    // Sand dollar: a flat test half-buried look, five-petal rosette on top.
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.08, 22), bodyMat);
    g.add(disc);
    const petalM = new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.color).multiplyScalar(0.62), roughness: 0.9 });
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), petalM);
      petal.scale.set(0.55, 0.12, 1.4);
      petal.position.set(Math.sin(a) * 0.18, 0.045, Math.cos(a) * 0.18);
      petal.rotation.y = a;
      g.add(petal);
    }
    return {};
  },
  snail(g, { bodyMat, spec, rnd }) {
    // Queen conch: whorled shell with a flared pink lip, foot and eye stalks
    // peeking out the front. Inches along the sand.
    const lipM = new THREE.MeshStandardMaterial({
      color: spec.accentColor ?? 0xff8a65, roughness: 0.45 });
    const footM = new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.color).multiplyScalar(0.7), roughness: 0.7 });
    const whorl = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), bodyMat);
    whorl.scale.set(0.85, 0.78, 1.05); whorl.position.set(0, 0.16, -0.1);
    whorl.rotation.x = 0.25; g.add(whorl);
    for (let i = 0; i < 3; i++) {                             // spire coils up and back
      const r = 0.17 - i * 0.05;
      const coil = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), bodyMat);
      coil.position.set(0, 0.3 + i * 0.1, -0.32 - i * 0.08);
      g.add(coil);
      const knob = new THREE.Mesh(new THREE.ConeGeometry(0.03 - i * 0.007, 0.08, 4), bodyMat);
      knob.position.set(0.02, 0.38 + i * 0.1, -0.32 - i * 0.08);
      g.add(knob);
    }
    const lip = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), lipM);
    lip.scale.set(1.15, 0.16, 0.95); lip.position.set(0.24, 0.05, 0.02);
    lip.rotation.z = 0.35; g.add(lip);
    const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.3, 4, 8), footM);
    foot.rotation.x = Math.PI / 2; foot.position.set(0, 0.02, 0.22); g.add(foot);
    for (const s of [-1, 1]) {                                // eye stalks
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.18, 5), footM);
      stalk.rotation.x = Math.PI / 2 - 0.7;
      stalk.position.set(s * 0.07, 0.12, 0.4); g.add(stalk);
    }
    fishEyes(g, 0.09, 0.19, 0.45, 0.5);
    return {};
  },
  shrimp(g, { bodyMat, spec, rnd }) {
    // Cleaner shrimp: arched segmented abdomen, fan tail, long white antennae
    // it waves to advertise its cleaning service.
    const whiteM = new THREE.MeshStandardMaterial({
      color: 0xf5f5f5, roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.08 });
    const segs = 6;
    for (let i = 0; i < segs; i++) {
      const k = i / (segs - 1);
      const seg = new THREE.Mesh(new THREE.SphereGeometry(0.1 * (1 - k * 0.45), 9, 7), bodyMat);
      seg.scale.z = 1.5;
      // arc: head high at +z, abdomen curling down and back
      seg.position.set(0, 0.12 - k * k * 0.2, 0.3 - k * 0.16);
      g.add(seg);
    }
    const fan = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), whiteM);
    fan.scale.set(1.6, 0.2, 1.1); fan.position.set(0, -0.1, -0.55); g.add(fan);
    const legs = [];
    for (let i = 0; i < 3; i++) {
      for (const s of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 4), whiteM);
        leg.position.set(s * 0.07, -0.02, 0.22 - i * 0.1);
        leg.rotation.z = s * 0.5; g.add(leg); legs.push(leg);
      }
    }
    const antennae = [];
    for (const s of [-1, 1]) {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.7, 4), whiteM);
      ant.position.set(s * 0.05, 0.28, 0.55);
      ant.rotation.x = -0.9; ant.rotation.z = s * 0.3;
      g.add(ant); antennae.push(ant);
    }
    fishEyes(g, 0.06, 0.16, 0.42, 0.6);
    const animate = (t, phase) => {
      antennae.forEach((a, i) => {
        a.rotation.x = -0.9 + Math.sin(t * 2.2 + phase + i * 2) * 0.25;
      });
      legs.forEach((l, i) => {
        l.rotation.x = Math.sin(t * 6 + phase + i * 1.1) * 0.3;
      });
    };
    return { animate };
  },
  seastar(g, { bodyMat, spec, rnd }) {
    // Five flattened arms around a low dome, hugging the rock.
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), bodyMat);
    dome.scale.set(1, 0.55, 1); g.add(dome);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + (rnd() - 0.5) * 0.12;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.09, 0.17), bodyMat);
      arm.position.set(Math.cos(a) * 0.28, 0, Math.sin(a) * 0.28);
      arm.rotation.y = -a;
      g.add(arm);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 7, 6), bodyMat);
      tip.scale.y = 0.6;
      tip.position.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5);
      g.add(tip);
    }
    return {};
  },
  crab(g, { bodyMat, spec, rnd }) {
    // Shore crab: wide low carapace, stalked eyes, pincers, scuttling legs.
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), bodyMat);
    shell.scale.set(1.25, 0.5, 0.9); shell.position.y = 0.12; g.add(shell);
    fishEyes(g, 0.12, 0.3, 0.3, 0.7);
    const legs = [];
    for (const s of [-1, 1]) {
      const claw = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 7), bodyMat);
      claw.scale.set(1, 0.7, 1.3);
      claw.position.set(s * 0.4, 0.08, 0.3); g.add(claw);
      for (let k = 0; k < 3; k++) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.34, 5), bodyMat);
        leg.position.set(s * 0.36, 0.02, 0.08 - k * 0.15);
        leg.rotation.z = s * 1.15;
        g.add(leg); legs.push(leg);
      }
    }
    const animate = (t, phase) => {
      legs.forEach((l, i) => {
        l.rotation.x = Math.sin(t * 8 + phase + i * 1.2) * 0.25;
      });
    };
    return { animate };
  },
  chiton(g, { bodyMat, spec }) {
    // Gumboot chiton: leathery oval dome, transverse plate ridges on top.
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 12, 9, 0, Math.PI * 2, 0, Math.PI / 2), bodyMat);
    dome.scale.set(0.72, 0.5, 1.15); g.add(dome);
    const girdle = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.08, 14), bodyMat);
    girdle.scale.set(0.75, 1, 1.18); girdle.position.y = 0.03; g.add(girdle);
    const plateM = new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.accentColor ?? spec.color), roughness: 0.8 });
    for (let k = 0; k < 5; k++) {
      const zz = -0.24 + k * 0.12;
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.07), plateM);
      ridge.position.set(0, 0.05 + Math.cos((zz / 0.37) * 1.2) * 0.12, zz);
      g.add(ridge);
    }
    return {};
  },
};

function fishBodyOf(id) {
  if (['seahorse', 'neonSeahorse', 'twilightSeahorse', 'moonSeahorse', 'goldenSeahorse',
    'leafySeaDragon', 'weedySeaDragon'].includes(id)) return 'seahorse';
  if (id === 'seaTurtle') return 'turtle';
  if (['shark', 'frilledShark', 'twilightWhaleShark', 'lemonShark', 'blacktipReefShark',
    'whaleShark'].includes(id)) return 'shark';
  if (['morayEel', 'giantMoray', 'blueRibbonEel', 'glowEel', 'gulperEel',
    'oarfish', 'ribbonfish'].includes(id)) return 'eel';
  if (['octopus', 'giantSquid', 'rubyOctopus'].includes(id)) return 'octopus';
  if (id === 'dolphin' || id === 'spinnerDolphin') return 'dolphin';
  if (id === 'molaMola') return 'mola';
  if (['yellowTang', 'blueTang', 'powderBrownTang'].includes(id)) return 'tang';
  if (['damselfish', 'chromis', 'blueChromis', 'yellowChromis'].includes(id)) return 'damsel';
  if (['cardinalfish', 'pajamaCardinalfish', 'banggaiCardinalfish'].includes(id)) return 'cardinal';
  if (id === 'cuttlefish') return 'cuttlefish';
  if (['manatee', 'dugong'].includes(id)) return 'sirenian';
  if (id === 'seaOtter') return 'otter';
  if (['pufferfish', 'boxfish', 'porcupinePuffer'].includes(id)) return 'puffer';
  if (['spottedEagleRay', 'mantaRay', 'abyssalRay', 'stingray'].includes(id)) return 'ray';
  if (id === 'nautilus') return 'nautilus';
  if (id === 'horseshoeCrab') return 'horseshoe';
  if (id === 'seaUrchin') return 'urchin';
  if (id === 'sandDollar') return 'sandDollar';
  if (['conch', 'hermitCrab', 'flamingoTongue'].includes(id)) return 'snail';
  if (id === 'ochreStar') return 'seastar';
  if (id === 'tidepoolCrab') return 'crab';
  if (id === 'chiton') return 'chiton';
  if (id === 'cleanerShrimp') return 'shrimp';
  if (id === 'pipefish') return 'pipefish';
  return 'generic';
}

let fishCounter = 1;
function makeFish(spec) {
  const g = new THREE.Group();
  const variant = fishCounter++;
  // Per-individual build: each fish gets its own proportions plus its own skin.
  const rnd = mulberry32(hashId(spec.id) + variant * 31337);
  const biolum = BIOLUM_SPECIES.has(spec.id);
  const tex = fishTexture(spec, variant % TEX_VARIANTS);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: tex, roughness: 0.35,
    emissive: new THREE.Color(spec.accentColor ?? spec.color), emissiveIntensity: 0,
    bumpMap: tex, bumpScale: 0.004 });
  const finMat = new THREE.MeshStandardMaterial({
    color: spec.accentColor ?? spec.color, roughness: 0.4,
    side: THREE.DoubleSide, transparent: true, opacity: 0.8 });

  const build = FISH_BODY[fishBodyOf(spec.id)];
  const { tail, tailAxis, animate, pecs } = build(g, { bodyMat, finMat, spec, rnd }) ?? {};

  g.scale.setScalar(((spec.size ?? 14) / 16) * 0.55 * (0.92 + rnd() * 0.16));
  g.traverse(o => { if (o.isMesh) o.castShadow = !o.userData.noShadow; });
  g.userData.big = (spec.size ?? 14) >= 22;
  g.userData.tail = tail ?? null;
  g.userData.tailAxis = tailAxis;
  g.userData.animate = animate ?? null;
  g.userData.pecs = pecs ?? null;
  g.userData.baseScale = g.scale.x;
  g.userData.glowMat = biolum ? bodyMat : null;
  // Biolums cast real light after dark — a PointLight from the shared pool
  // (bioPool) follows them; the body itself glows through its emissive map.
  g.userData.bio = biolum;
  g.userData.hider = DAY_HIDER_SPECIES.has(spec.id);
  return g;
}

// ── Cleaning station — a rocky spa with signal tendrils, 2×2 tiles ────────────
// Capacity (fish cleaned at once) equals its level; the rim orbs show it.
function makeStation() {
  const g = new THREE.Group();
  const rock = new THREE.MeshStandardMaterial({
    color: 0x8a8478, roughness: 0.95, flatShading: true, map: rockTex });
  const tendrilM = new THREE.MeshStandardMaterial({
    color: STATION_SPEC.color, roughness: 0.5,
    emissive: STATION_SPEC.color, emissiveIntensity: 0.18 });
  const tipM = new THREE.MeshStandardMaterial({
    color: STATION_SPEC.accentColor, roughness: 0.45,
    emissive: STATION_SPEC.accentColor, emissiveIntensity: 0.3 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 0.4, 12), rock);
  base.position.y = 0.2; base.castShadow = true; g.add(base);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const spur = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 6), rock);
    spur.position.set(Math.cos(a) * 1.25, 0.75, Math.sin(a) * 1.25);
    spur.rotation.z = Math.cos(a) * 0.25; spur.castShadow = true;
    g.add(spur);
  }
  // Signal tendrils — the "open for business" sway cleaners advertise with.
  const tendrils = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const tnd = new THREE.Group();
    tnd.position.set(Math.cos(a) * 0.45, 0.4, Math.sin(a) * 0.45);
    const stalk = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.9, 4, 6), tendrilM);
    stalk.position.y = 0.5; tnd.add(stalk);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 7), tipM);
    tip.position.y = 1.05; tnd.add(tip);
    tnd.userData.a = a;
    g.add(tnd); tendrils.push(tnd);
  }
  // Level orbs around the rim — one lit per level.
  const orbs = [];
  for (let i = 0; i < STATION_MAX_LEVEL; i++) {
    const a = (i / STATION_MAX_LEVEL) * Math.PI * 2 - Math.PI / 2;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8),
      new THREE.MeshStandardMaterial({
        color: 0x40e0d0, emissive: 0x40e0d0, emissiveIntensity: 0.8, roughness: 0.3 }));
    orb.position.set(Math.cos(a) * 1.62, 0.42, Math.sin(a) * 1.62);
    g.add(orb); orbs.push(orb);
  }
  g.userData.tendrils = tendrils;
  g.userData.orbs = orbs;
  return g;
}

// ── Palm — a leaning trunk with a frond crown, for the beach ──────────────────
function makePalm(seed) {
  const rnd = mulberry32(seed);
  const g = new THREE.Group();
  const trunkM = new THREE.MeshStandardMaterial({
    color: 0x8a6742, roughness: 0.9, flatShading: true });
  const frondM = new THREE.MeshStandardMaterial({
    color: 0x3e9a4d, roughness: 0.7, side: THREE.DoubleSide });
  const nutM = new THREE.MeshStandardMaterial({ color: 0x6d4c2f, roughness: 0.8 });
  const leanDir = rnd() * Math.PI * 2;
  let y = 0, off = 0;
  for (let i = 0; i < 5; i++) {
    const h = 0.9;
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.115 - i * 0.012, 0.135 - i * 0.012, h, 7), trunkM);
    off += i * 0.05;
    seg.position.set(Math.cos(leanDir) * off, y + h / 2, Math.sin(leanDir) * off);
    seg.rotation.z = Math.cos(leanDir) * (0.1 + i * 0.02);
    seg.rotation.x = -Math.sin(leanDir) * (0.1 + i * 0.02);
    g.add(seg);
    y += h * 0.95;
  }
  const topX = Math.cos(leanDir) * (off + 0.15), topZ = Math.sin(leanDir) * (off + 0.15);
  const crown = new THREE.Group();
  crown.position.set(topX, y + 0.05, topZ);
  const fronds = 7 + Math.floor(rnd() * 2);
  for (let i = 0; i < fronds; i++) {
    const frond = new THREE.Group();
    frond.rotation.y = (i / fronds) * Math.PI * 2 + rnd() * 0.4;
    for (let s = 0; s < 4; s++) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.02, 0.2 - s * 0.035), frondM);
      leaf.position.set(0.32 + s * 0.48, 0.1 - s * s * 0.07, 0);
      leaf.rotation.z = -0.1 - s * 0.17;
      frond.add(leaf);
    }
    crown.add(frond);
  }
  g.add(crown);
  for (let i = 0; i < 3; i++) {
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 7), nutM);
    nut.position.set(topX + Math.cos(i * 2.1) * 0.13, y - 0.06, topZ + Math.sin(i * 2.1) * 0.13);
    g.add(nut);
  }
  g.userData.crown = crown;
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ── Gull — a simple wheeling seabird for the skies over the beach ─────────────
function makeGull() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.6 });
  const grey = new THREE.MeshStandardMaterial({
    color: 0x9aa4ac, roughness: 0.6, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.4, 4, 8), white);
  body.rotation.x = Math.PI / 2; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), white);
  head.position.set(0, 0.08, 0.32); g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 6),
    new THREE.MeshStandardMaterial({ color: 0xf2a53a, roughness: 0.5 }));
  beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.07, 0.46); g.add(beak);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 5), grey);
  tail.rotation.x = -Math.PI / 2; tail.position.set(0, 0.02, -0.34); g.add(tail);
  const wings = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.1, 0.06, 0.05);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.03, 0.34), grey);
    wing.position.x = s * 0.5;
    pivot.add(wing);
    g.add(pivot); wings.push(pivot);
  }
  g.userData.wings = wings;
  return g;
}

// ── Bubbles the drone — Classic's snarky reef observer, in 3D ─────────────────
// Same silhouette language as the Pixi sprite: teal shell, pale face plate,
// side fins, yellow sensor lens, cyan antenna bulb and thruster.
// Skip-7 — the Pearl Market's curator. A boxy robot behind a wooden counter
// with display tanks and a pearl tray, out on the reef's outskirts. He never
// leaves the counter; his one arm gestures at the merchandise. Faces +z.
function makeSkip7() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8d6240, roughness: 0.85 });
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x6b4630, roughness: 0.9 });
  const shell = new THREE.MeshStandardMaterial({ color: 0x9aa7b3, roughness: 0.4, metalness: 0.35 });
  const shellDark = new THREE.MeshStandardMaterial({ color: 0x5f6b78, roughness: 0.45, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.1, transparent: true, opacity: 0.32 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x7fe8ff, emissive: 0x7fe8ff, emissiveIntensity: 0.9, roughness: 0.2 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xffd27f, emissiveIntensity: 0.6, roughness: 0.3 });
  const pearlMat = new THREE.MeshStandardMaterial({ color: 0xfff6f0, roughness: 0.15, metalness: 0.05 });
  // Counter: plank top on two posts, a front panel, a shelf lip.
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.14, 1.1), wood);
  top.position.set(0, 1.05, 0.55); g.add(top);
  const front = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.9, 0.08), woodDark);
  front.position.set(0, 0.55, 1.06); g.add(front);
  for (const sx of [-1.45, 1.45]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.0, 0.16), woodDark);
    post.position.set(sx, 0.5, 1.0); g.add(post);
    const lampPost = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), shellDark);
    lampPost.position.set(sx, 1.55, 0.2); g.add(lampPost);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), lampMat);
    lamp.position.set(sx, 2.02, 0.2); g.add(lamp);
  }
  // Display tanks on the counter, each with a small glowing specimen.
  const tanks = [];
  [[-1.0, 0x40e0d0], [0.05, 0xff8a65], [1.0, 0xffd54f]].forEach(([x, col]) => {
    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.38, 0.4), glass);
    tank.position.set(x, 1.31, 0.62); g.add(tank);
    const spec = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 7),
      new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.5, roughness: 0.4 }));
    spec.position.set(x, 1.28, 0.62); g.add(spec); tanks.push(spec);
  });
  // Pearl tray.
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.36), woodDark);
  tray.position.set(-0.45, 1.15, 0.2); g.add(tray);
  for (let i = 0; i < 5; i++) {
    const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 7), pearlMat);
    pearl.position.set(-0.65 + (i % 3) * 0.2, 1.22, 0.1 + Math.floor(i / 3) * 0.16); g.add(pearl);
  }
  // Skip-7 himself: body, dome head, eyes, antenna, two arms — behind the counter.
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 0.6), shell);
  body.position.set(0, 1.0, -0.35); g.add(body);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.06), shellDark);
  chest.position.set(0, 1.15, -0.04); g.add(chest);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.14, 8), shellDark);
  neck.position.set(0, 1.56, -0.35); g.add(neck);
  const head = new THREE.Group(); head.position.set(0, 1.62, -0.35); g.add(head);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), shell);
  dome.scale.set(1, 0.85, 1); head.add(dome);
  const jaw = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.16, 16), shellDark);
  jaw.position.y = -0.06; head.add(jaw);
  for (const sx of [-0.12, 0.12]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), eyeMat);
    eye.position.set(sx, 0.1, 0.3); head.add(eye);
  }
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 6), shellDark);
  antenna.position.set(0.18, 0.4, 0); head.add(antenna);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 7), eyeMat);
  tip.position.set(0.18, 0.56, 0); head.add(tip);
  const arms = [];
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(sx * 0.52, 1.36, -0.3); g.add(arm);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.6, 8), shellDark);
    upper.position.y = -0.3; arm.add(upper);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 7), shell);
    hand.position.y = -0.62; arm.add(hand);
    arm.rotation.x = -0.35; arm.rotation.z = sx * 0.15;
    arms.push(arm);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData = { head, arms, tanks, eyeMat, lampMat };
  return g;
}

function makeDrone() {
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: 0x5090b8, roughness: 0.35, metalness: 0.25 });
  const plate = new THREE.MeshStandardMaterial({ color: 0x80b4d8, roughness: 0.3, metalness: 0.2 });
  const finM = new THREE.MeshStandardMaterial({ color: 0x3a6a8a, roughness: 0.5 });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xffd740, emissive: 0xffd740, emissiveIntensity: 0.35, roughness: 0.25 });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x40c8ff, emissive: 0x40c8ff, emissiveIntensity: 0.8, roughness: 0.3 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.5, 6, 14), shell);
  body.rotation.x = Math.PI / 2; g.add(body);                  // nose points +z
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 12), plate);
  face.position.z = 0.34; face.scale.set(0.95, 0.85, 0.7); g.add(face);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), eyeMat);
  eye.position.set(0, 0.02, 0.52); g.add(eye);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xfffff0, roughness: 0.15 }));
  pupil.position.set(0.02, 0.05, 0.62); g.add(pupil);
  for (const s of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.26), finM);
    fin.position.set(s * 0.44, 0.02, -0.08);
    fin.rotation.z = s * -0.28; g.add(fin);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), finM);
  mast.position.set(0, 0.42, -0.05); g.add(mast);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), glowMat);
  bulb.position.set(0, 0.55, -0.05); g.add(bulb);
  const thrust = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), glowMat);
  thrust.position.z = -0.62; g.add(thrust);
  const prop = new THREE.Group();
  prop.position.z = -0.56;
  for (const r of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.02), finM);
    blade.rotation.z = r; prop.add(blade);
  }
  g.add(prop);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData = { prop, eyeMat, glowMat };
  return g;
}

export function initReefScene3D(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (e) {
    // Safari under GPU pressure sometimes refuses the antialiased context (or
    // hands back a broken one) while a modest ask still succeeds. The failed
    // attempt poisons the canvas's context slot, so retry on a fresh canvas.
    const fresh = canvas.cloneNode(false);
    canvas.parentNode.replaceChild(fresh, canvas);
    canvas = fresh;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'default' });
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // Context loss (GPU memory pressure, backgrounding, a driver reset) must never
  // become a death loop. three.js restores its own GL state when the browser
  // hands the context back; what it can't do is stop the pressure that caused
  // it. So each loss steps the graphics down — sharpness first, then shadows —
  // and the setting sticks for the session.
  let contextLosses = 0, prCeiling = Infinity;
  canvas.addEventListener('webglcontextlost', (ev) => {
    ev.preventDefault();                       // ask the browser to restore it
    contextLosses++;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    if (contextLosses >= 1) { prCeiling = 1.5; renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); }
    if (contextLosses >= 2) {
      prCeiling = 1;
      renderer.setPixelRatio(1);
      renderer.shadowMap.enabled = false;
      scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); });
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Everything organic casts a soft shadow onto the sand.
  const enableShadows = (root) => root.traverse(o => { if (o.isMesh) o.castShadow = true; });

  const scene = new THREE.Scene();
  scene.background = gradientTexture([[0.0, '#2b86a8'], [0.45, '#155579'], [1.0, '#062232']]);
  scene.fog = new THREE.FogExp2(0x11486a, 0.011);

  const camera = new THREE.PerspectiveCamera(
    50, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.position.set(0, 15, 32);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.5, 0);
  controls.enableDamping = true; controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI * 0.49;
  if (import.meta.env?.DEV) window.__rb3d = { camera, controls };   // dev-only camera hook for tests
  controls.minDistance = 7; controls.maxDistance = 90;
  // Movable focal point: right-drag (or two-finger drag) pans along the
  // seafloor, arrow keys nudge it. The target is clamped to the play field.
  controls.enablePan = true;
  controls.screenSpacePanning = false;
  // Left-drag moves across the reef, right-drag orbits (swapped from default);
  // same idea on touch — one finger moves, two fingers pinch-zoom and orbit.
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE,
  };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controls.keyPanSpeed = 26;
  controls.keys = { LEFT: 'ArrowLeft', UP: 'ArrowUp', RIGHT: 'ArrowRight', BOTTOM: 'ArrowDown' };
  controls.listenToKeyEvents(window);

  // ── Lighting ────────────────────────────────────────────────────────────────
  const hemi = new THREE.HemisphereLight(0xcdeefc, 0x46483a, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xeaf6ff, 1.7);
  sun.position.set(6, 22, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -80; sun.shadow.camera.right = 52;
  sun.shadow.camera.top = 42; sun.shadow.camera.bottom = -42;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x3f93c4, 0.5);
  fill.position.set(-10, 6, -6); scene.add(fill);
  // Cold, dim glow over the twilight basin so the deep shelf reads as its own world.
  const twiLight = new THREE.PointLight(0x4a7bd0, 30, 46, 1.6);
  twiLight.position.set(ZONES.deepTwilight.cx, 7, 0); scene.add(twiLight);

  // ── Seafloor — one heightfield across all three biomes ──────────────────────
  const floorGeo = new THREE.PlaneGeometry(240, 240, 120, 120);
  const fp = floorGeo.attributes.position;
  const fc = new Float32Array(fp.count * 3);
  const cCor = new THREE.Color(0xc2a96e);   // golden reef sand
  const cSea = new THREE.Color(0x86a05f);   // warm grassy flats
  const cBea = new THREE.Color(0xeadfb0);   // dry beach sand above the waterline
  const cTwi = new THREE.Color(0x22344f);   // dark twilight silt
  const tint = new THREE.Color();
  for (let i = 0; i < fp.count; i++) {
    const x = fp.getX(i), z = -fp.getY(i);   // plane is rotated -90° about X
    fp.setZ(i, terrainHeight(x, z));
    tint.copy(cCor)
      .lerp(cSea, smoothstep(15, 23, -x))
      .lerp(cBea, smoothstep(52, 64, -x))
      .lerp(cTwi, smoothstep(14, 22, x));
    const v = 0.93 + 0.07 * Math.sin(x * 12.9 + z * 7.7) * Math.sin(x * 3.1 - z * 5.3);
    fc[i * 3] = tint.r * v; fc[i * 3 + 1] = tint.g * v; fc[i * 3 + 2] = tint.b * v;
  }
  floorGeo.setAttribute('color', new THREE.BufferAttribute(fc, 3));
  floorGeo.computeVertexNormals();
  // Animated caustic light web plays over the sand via the emissive channel.
  const caustics = causticTexture();
  caustics.repeat.set(26, 26);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1, map: sandTex, vertexColors: true,
    emissive: 0xaadfe8, emissiveIntensity: 0.13, emissiveMap: caustics });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true; scene.add(floor);

  // ── Ocean surface — waves rolling around a fixed water level ─────────────────
  // Front faces point DOWN, so the sheet only renders when the camera is under
  // it: dip low and a shimmering ceiling appears; the high overview stays clear.
  // Swells oscillate around SURFACE_Y — the mean water level itself never moves.
  const surfGeo = new THREE.PlaneGeometry(300, 180, 72, 44);
  const surfTex = causticTexture();
  surfTex.repeat.set(18, 12);
  const surfMat = new THREE.MeshStandardMaterial({
    color: 0x9fd9ee, transparent: true, opacity: 0.4, side: THREE.FrontSide,
    roughness: 0.35, metalness: 0.15,
    emissive: 0xbfe8f5, emissiveIntensity: 0.35, emissiveMap: surfTex,
    depthWrite: false });
  const surface = new THREE.Mesh(surfGeo, surfMat);
  surface.rotation.x = Math.PI / 2;                    // normal faces the reef
  surface.position.set(-32, SURFACE_Y, 0);
  scene.add(surface);
  // Top face — now that the camera can climb out of the water, the sea reads
  // as a lightly reflective sheet from above (the beach pokes through it).
  const surfTopMat = new THREE.MeshStandardMaterial({
    color: 0x8fd0e8, transparent: true, opacity: 0.34, side: THREE.BackSide,
    roughness: 0.28, metalness: 0.3,
    emissive: 0x9fd9ee, emissiveIntensity: 0.3, emissiveMap: surfTex,
    depthWrite: false });
  const surfaceTop = new THREE.Mesh(surfGeo, surfTopMat);
  surfaceTop.rotation.x = Math.PI / 2;
  surfaceTop.position.set(-32, SURFACE_Y, 0);
  scene.add(surfaceTop);
  const surfPos = surfGeo.attributes.position;

  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x9aa0a0, roughness: 1, flatShading: true, map: rockTex });
  const weeds = [];
  function weedTuft(x, z, blades, hue) {
    const weed = new THREE.Group();
    for (let b = 0; b < blades; b++) {
      const h = 1.2 + ((b * 7) % 5) * 0.4;
      const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.11, h, 5),
        new THREE.MeshStandardMaterial({ color: hue, roughness: 0.8 }));
      blade.position.set((b - blades / 2) * 0.16, h / 2, ((b * 13) % 3 - 1) * 0.12);
      blade.rotation.z = ((b * 11) % 5 - 2) * 0.06;
      weed.add(blade);
    }
    weed.position.set(x, terrainHeight(x, z), z);
    weed.userData.seed = x * 0.7 + z * 1.3;
    enableShadows(weed);
    scene.add(weed); weeds.push(weed);
    return weed;
  }

  // Decor stays off the buildable footprint — the grid plus its expansion
  // aprons — so placed corals never clip a rock or a tuft.
  const inBuildArea = (x, z, pad = 1) => Object.values(ZONES).some(zn =>
    Math.abs(x - zn.cx) < (zn.grid * TILE) / 2 + pad &&
    Math.abs(z - zn.cz) < (zn.grid * TILE) / 2 + 20 + pad);

  // Coral-zone scatter: rocks and a few weed tufts around the reef grid,
  // slid outward along their ray until they clear the tiles.
  for (let i = 0; i < 22; i++) {
    const a = i * 2.399;
    let r = 12 + (i % 5) * 1.1, x, z;
    do { x = Math.cos(a) * r; z = Math.sin(a) * r; r += 1.5; } while (inBuildArea(x, z));
    if (i % 3) {
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 + (i % 4) * 0.4, 0), rockMat);
      rock.position.set(x, terrainHeight(x, z) + 0.1, z);
      rock.rotation.set(a, a * 1.7, a * 0.5); rock.scale.y = 0.65;
      rock.castShadow = true; scene.add(rock);
    } else {
      weedTuft(x, z, 3 + (i % 3), 0x2f7d54);
    }
  }
  // Seagrass-zone scatter: dense grass tufts across the flats around the grid.
  {
    const rnd = mulberry32(97);
    const zn = ZONES.seagrass;
    for (let i = 0; i < 42; i++) {
      const a = rnd() * Math.PI * 2;
      let r = 11.5 + rnd() * 5, x, z;
      do {
        x = clamp(zn.cx + Math.cos(a) * r, -46, -18);
        z = clamp(Math.sin(a) * r, -28, 28);
        r += 1.6;
      } while (inBuildArea(x, z) && r < 44);
      weedTuft(x, z, 4 + Math.floor(rnd() * 3), [0x2f7d54, 0x3f8f4f, 0x557f3f][i % 3]);
    }
  }
  // The beach: dry sand climbing out of the sea west of the flats — bleached
  // rocks, hermit crabs on their little circuits, and gulls wheeling overhead.
  // Scenery you only appreciate once the camera comes out of the water.
  const gulls = [];
  const beachCrabs = [];
  const palms = [];
  {
    const rnd = mulberry32(211);
    // Palms on the flat berm, leaning whichever way they grew.
    for (const [px, pz] of [[-72, -12], [-76, 3], [-71, 15], [-78, -22]]) {
      const palm = makePalm(px * 31 + pz * 7);
      palm.position.set(px, terrainHeight(px, pz), pz);
      palm.scale.setScalar(1.15 + rnd() * 0.4);
      scene.add(palm);
      palms.push({ crown: palm.userData.crown, phase: rnd() * 6.28 });
    }
    const dryRock = new THREE.MeshStandardMaterial({
      color: 0xd8c9a4, roughness: 1, flatShading: true, map: rockTex });
    for (let i = 0; i < 9; i++) {
      const x = -64 - rnd() * 14, z = (rnd() - 0.5) * 52;
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4 + rnd() * 0.8, 0), dryRock);
      rock.position.set(x, terrainHeight(x, z) + 0.1, z);
      rock.rotation.set(rnd() * 3, rnd() * 6, rnd()); rock.scale.y = 0.55;
      rock.castShadow = true; scene.add(rock);
    }
    // Ambient hermit crabs — beach décor, separate from the placeable species.
    const crabM = new THREE.MeshStandardMaterial({ color: 0xc47a4a, roughness: 0.7 });
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const { animate } = FISH_BODY.crab(g, { bodyMat: crabM, spec: {}, rnd: mulberry32(500 + i) });
      g.scale.setScalar(0.45);
      scene.add(g);
      beachCrabs.push({
        g, animate,
        cx: -66 - i * 3, cz: -12 + i * 11, R: 1.4 + i * 0.5,
        w: (i % 2 ? -1 : 1) * 0.35, phase: i * 2.1,
      });
    }
    // Gulls above the shoreline.
    for (let i = 0; i < 4; i++) {
      const g = makeGull();
      g.scale.setScalar(0.9 + (i % 2) * 0.25);
      scene.add(g);
      gulls.push({
        g, cx: -62 - (i % 2) * 8, cz: (i - 1.5) * 10,
        R: 6 + i * 2.5, w: (i % 2 ? -1 : 1) * (0.22 + i * 0.04),
        y: SURFACE_Y + 3.5 + i * 1.2, phase: i * 1.7,
      });
    }
  }
  // Twilight-zone scatter: dark rock spires and faint glowing orbs on the shelf.
  const orbs = [];
  {
    const rnd = mulberry32(53);
    const zn = ZONES.deepTwilight;
    const spireMat = new THREE.MeshStandardMaterial({
      color: 0x3a4356, roughness: 1, flatShading: true, map: rockTex });
    for (let i = 0; i < 7; i++) {
      const a = rnd() * Math.PI * 2;
      let r = 13 + rnd() * 5, x, z;
      do {
        x = clamp(zn.cx + Math.cos(a) * r, 17.5, 50);
        z = clamp(Math.sin(a) * r, -28, 28);
        r += 1.6;
      } while (inBuildArea(x, z, 3) && r < 44);   // spires are tall — extra clearance
      const spire = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), spireMat);
      spire.position.set(x, terrainHeight(x, z) + 1.2, z);
      spire.scale.set(0.7 + rnd() * 0.7, 2.2 + rnd() * 2.6, 0.7 + rnd() * 0.7);
      spire.rotation.y = rnd() * Math.PI;
      spire.castShadow = true; scene.add(spire);
    }
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2;
      let r = 11.5 + rnd() * 6, x, z;
      do {
        x = clamp(zn.cx + Math.cos(a) * r, 18, 49);
        z = clamp(Math.sin(a) * r, -26, 26);
        r += 1.6;
      } while (inBuildArea(x, z) && r < 44);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16 + rnd() * 0.14, 10, 10),
        new THREE.MeshStandardMaterial({
          color: 0x11202e, emissive: 0x40e0ff, emissiveIntensity: 0.9, roughness: 0.4 }));
      orb.position.set(x, terrainHeight(x, z) + 0.25, z);
      orb.userData.seed = rnd() * 6.28;
      scene.add(orb); orbs.push(orb);
    }
  }
  // ── Ambient jellyfish — drifting, pulsing; twilight ones glow after dark ────
  const jellies = [];
  {
    const jrnd = mulberry32(313);
    const spots = [
      { x: -6, z: -9, c: 0xf8c8dc, tw: false }, { x: 9, z: 7, c: 0xcfe8ff, tw: false },
      { x: -26, z: 7, c: 0xd8f0d0, tw: false }, { x: -38, z: -6, c: 0xf8c8dc, tw: false },
      { x: 2, z: 11, c: 0xcfe8ff, tw: false },
      { x: 27, z: -9, c: 0x8ff0ff, tw: true }, { x: 38, z: 5, c: 0xc9a8ff, tw: true },
      { x: 32, z: 11, c: 0x8ff0ff, tw: true },
    ];
    for (const s of spots) {
      const jg = new THREE.Group();
      const jmat = new THREE.MeshStandardMaterial({
        color: s.c, transparent: true, opacity: 0.5, roughness: 0.3,
        emissive: s.c, emissiveIntensity: 0.25, side: THREE.DoubleSide, depthWrite: false });
      const bell = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), jmat);
      jg.add(bell);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8),
        new THREE.MeshStandardMaterial({
          color: s.c, emissive: s.c, emissiveIntensity: 0.5,
          transparent: true, opacity: 0.7, depthWrite: false }));
      core.position.y = 0.02; jg.add(core);
      const tentacles = [];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const tnt = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.012, 0.45 + jrnd() * 0.35, 3, 5), jmat);
        tnt.position.set(Math.cos(a) * 0.18, -0.28, Math.sin(a) * 0.18);
        tnt.userData.a = a;
        jg.add(tnt); tentacles.push(tnt);
      }
      jg.scale.setScalar(0.7 + jrnd() * 0.7);
      const baseY = (s.tw ? ZONES.deepTwilight.floorY : 0) + 3.2 + jrnd() * 2.5;
      jg.position.set(s.x, baseY, s.z);
      scene.add(jg);
      jellies.push({ g: jg, bell, mat: jmat, tentacles, tw: s.tw,
        baseY, x: s.x, z: s.z, ph: jrnd() * 6.28, drift: 1 + jrnd() * 1.5 });
    }
  }

  // Boulders out on the dunes so the distance isn't empty.
  {
    const rnd = mulberry32(71);
    for (let i = 0; i < 14; i++) {
      const a = rnd() * Math.PI * 2, r = 40 + rnd() * 45;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1 + rnd() * 2.2, 0), rockMat);
      rock.position.set(x, terrainHeight(x, z) + 0.3, z);
      rock.rotation.set(a, a * 2.1, a * 0.6); rock.scale.y = 0.55 + rnd() * 0.3;
      rock.castShadow = true; scene.add(rock);
    }
  }

  // ── Easter eggs — oddities hidden out on the dunes, beyond the reefs ─────────
  // Each is clickable: Bubbles has opinions, and the chest pays out once.
  const eggs = [];
  const eggsClaimed = new Set();          // saved — chest loot is once per reef
  function addEgg(id, g, x, z) {
    g.position.set(x, terrainHeight(x, z), z);
    g.userData.egg = id;
    g.traverse(o => { o.userData.egg = id; });
    scene.add(g); eggs.push(g);
    return g;
  }
  {
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 });
    const wood2 = new THREE.MeshStandardMaterial({ color: 0x54371f, roughness: 0.95 });
    const gold = new THREE.MeshStandardMaterial({
      color: 0xffd75e, emissive: 0xdfa620, emissiveIntensity: 0.6, roughness: 0.3 });
    // Treasure chest half-buried on the western flats.
    const chest = new THREE.Group();
    const cbase = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 0.7), wood);
    cbase.position.y = 0.18; chest.add(cbase);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.22, 0.74), wood2);
    lid.position.set(0, 0.5, -0.18); lid.rotation.x = -0.7; chest.add(lid);
    const loot = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), gold);
    loot.scale.y = 0.5; loot.position.set(0, 0.45, 0.05); chest.add(loot);
    chest.rotation.y = 0.7; chest.rotation.z = 0.08;
    addEgg('chest', chest, -48, 24);

    // Shipwreck ribs sinking into the twilight silt.
    const wreck = new THREE.Group();
    const keel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 7.5), wood2);
    keel.position.y = 0.1; keel.rotation.z = 0.3; wreck.add(keel);
    for (let i = 0; i < 4; i++) {
      const rib = new THREE.Mesh(
        new THREE.TorusGeometry(1.5 - i * 0.13, 0.09, 6, 12, Math.PI), wood);
      rib.position.set(0, 0.15, -2.4 + i * 1.5);
      wreck.add(rib);
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 4.2, 6), wood);
    mast.position.set(0.8, 1.2, 1.2); mast.rotation.z = 1.15; wreck.add(mast);
    wreck.rotation.y = -0.4;
    addEgg('wreck', wreck, 48, -26);

    // Gavin. A rock with eyes. He was here first.
    const gavin = new THREE.Group();
    const ghead = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), rockMat);
    ghead.scale.set(0.8, 1.5, 0.8); ghead.position.y = 1; ghead.castShadow = true;
    gavin.add(ghead);
    const scleraM = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.4 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), scleraM);
      eye.position.set(s * 0.25, 1.35, 0.55); gavin.add(eye);
      const pup = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), pupilMat);
      pup.position.set(s * 0.25, 1.35, 0.64); gavin.add(pup);
    }
    addEgg('gavin', gavin, -14, -34);

    // A rubber duck patrolling the surface, far to the south.
    const duckM = new THREE.MeshStandardMaterial({ color: 0xffd21f, roughness: 0.35 });
    const beakM = new THREE.MeshStandardMaterial({ color: 0xff7a00, roughness: 0.4 });
    const duck = new THREE.Group();
    const dbody = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 12), duckM);
    dbody.scale.set(0.85, 0.7, 1.05); duck.add(dbody);
    const dhead = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), duckM);
    dhead.position.set(0, 0.55, 0.35); duck.add(dhead);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.28, 8), beakM);
    beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.5, 0.68); duck.add(beak);
    fishEyes(duck, 0.16, 0.62, 0.55, 1.3);
    addEgg('duck', duck, 6, 36);
    duck.position.y = 10.5;                 // floats near the surface
    duck.userData.floatBase = SURFACE_Y + 0.05;   // rides the swells
    eggs.duckRef = duck;
  }
  const EGG_LINES = {
    chest: ['The chest is empty now. The barnacles saw nothing.'],
    wreck: ['Old wreck. Pre-dates my logs, which means officially it is not my fault.',
      'I ran the numbers: 100% of ships down here made poor choices.'],
    gavin: ['That is Gavin. He was here before the reef. Show some respect.',
      'Gavin has not stopped talking since I came online. You simply lack the frequency.',
      'I asked Gavin a question once. That was four years ago. He is still answering.'],
    duck: ['Unidentified floating object. Threat assessment: adorable.',
      'It has been circling for years. I have stopped asking questions.'],
  };
  function eggFound(id) {
    const firstChest = id === 'chest' && !eggsClaimed.has('chest');
    eggsClaimed.add(id);
    checkAch();
    if (firstChest) {
      eggsClaimed.add('chest');
      pearls += 10;
      refreshHud(); save();
      flash(rateEl, '+10 💎', '#bfe6ff');
      droneQueue.push('Sunken treasure located. Finder keeps the pearls. I keep the coordinates.');
      return;
    }
    const pool = EGG_LINES[id] ?? [];
    if (pool.length) droneQueue.push(pool[Math.floor(Math.random() * pool.length)]);
  }

  // ── Grid tiles (one grid per biome) ──────────────────────────────────────────
  // Tiles read as raked sand patches, not game-board squares — a shade lighter
  // than the local seafloor with a soft edge, glowing only on hover.
  const tileGeo = new THREE.BoxGeometry(TILE * 0.9, 0.12, TILE * 0.9);
  const tileMats = {
    coral: new THREE.MeshStandardMaterial({
      color: 0xdcc48c, roughness: 1, map: tileTex, transparent: true, opacity: 0.6 }),
    seagrass: new THREE.MeshStandardMaterial({
      color: 0x9db26f, roughness: 1, map: tileTex, transparent: true, opacity: 0.6 }),
    deepTwilight: new THREE.MeshStandardMaterial({
      color: 0x3d5570, roughness: 1, map: tileTex, transparent: true, opacity: 0.65 }),
  };
  const lockedMat = new THREE.MeshStandardMaterial({
    color: 0x2a3540, roughness: 1, transparent: true, opacity: 0.22 });
  const hoverMat = new THREE.MeshStandardMaterial({
    color: 0x9fe8f0, roughness: 0.8, emissive: 0x2aa6c4, emissiveIntensity: 0.5,
    transparent: true, opacity: 0.85 });
  const tiles = [];
  function addTile(zn, c, r) {
    const half = (zn.grid * TILE) / 2;
    const t = new THREE.Mesh(tileGeo, tileMats[zn.id]);
    t.position.set(
      zn.cx + c * TILE - half + TILE / 2, zn.floorY + 0.16,
      zn.cz + r * TILE - half + TILE / 2);
    t.userData = { biome: zn.id, c, r, occupied: false, baseMat: tileMats[zn.id] };
    t.receiveShadow = true;
    scene.add(t); tiles.push(t);
    return t;
  }
  for (const zn of Object.values(ZONES)) {
    for (let r = 0; r < zn.grid; r++) {
      for (let c = 0; c < zn.grid; c++) addTile(zn, c, r);
    }
  }
  const tileAt = (b, c, r) => tiles.find(t =>
    t.userData.biome === b && t.userData.c === c && t.userData.r === r);

  // ── Grid expansions — 5×5 plots bought with polyps ────────────────────────────
  // Each biome grows 5×5 patches off its north and south edges (the east–west
  // flanks belong to the neighbouring biomes). The inner ring attaches to the
  // main grid; each outer patch unlocks only once the patch it touches is
  // owned. Cost climbs with each patch bought in that biome; purchases persist.
  const EXP_PATCHES = {
    nw:  { c0: 0, r0: -5 },  ne:  { c0: 5, r0: -5 },
    sw:  { c0: 0, r0: 10 },  se:  { c0: 5, r0: 10 },
    nw2: { c0: 0, r0: -10, needs: 'nw' }, ne2: { c0: 5, r0: -10, needs: 'ne' },
    sw2: { c0: 0, r0: 15, needs: 'sw' },  se2: { c0: 5, r0: 15, needs: 'se' },
  };
  const EXP_SIZE = 5;
  const expansions = Object.fromEntries(Object.keys(ZONES).map(z => [z, []]));   // saved
  // Set once the wild groves exist (they're built after the saved reef loads).
  let relocateWildDecor = () => {};
  const expCost = (zid) => 40 * (expansions[zid].length + 1);
  function buildExpansion(zid, key) {
    const zn = ZONES[zid], p = EXP_PATCHES[key];
    if (!zn || !p || expansions[zid].includes(key)) return;
    for (let r = p.r0; r < p.r0 + EXP_SIZE; r++) {
      for (let c = p.c0; c < p.c0 + EXP_SIZE; c++) addTile(zn, c, r);
    }
    expansions[zid].push(key);
  }

  // Sale markers: a translucent plot with a "＋ cost" label on each unbought
  // patch of an unlocked biome. Tapping one buys the expansion.
  function expLabelTex(cost) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 5;
    ctx.setLineDash([18, 12]);
    ctx.strokeRect(8, 8, 240, 240);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.textAlign = 'center';
    ctx.font = '84px sans-serif';
    ctx.fillText('＋', 128, 128);
    ctx.font = '44px sans-serif';
    ctx.fillText(`${cost} 🪸`, 128, 196);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const expMarkers = [];
  for (const zn of Object.values(ZONES)) {
    const half = (zn.grid * TILE) / 2;
    for (const [key, p] of Object.entries(EXP_PATCHES)) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(EXP_SIZE * TILE - 0.6, EXP_SIZE * TILE - 0.6),
        new THREE.MeshBasicMaterial({
          map: expLabelTex(expCost(zn.id)), transparent: true, opacity: 0.55,
          depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(
        zn.cx + (p.c0 + EXP_SIZE / 2) * TILE - half, zn.floorY + 0.22,
        zn.cz + (p.r0 + EXP_SIZE / 2) * TILE - half);
      m.userData = { zid: zn.id, key };
      m.visible = false;                       // shown once the zone unlocks
      scene.add(m); expMarkers.push(m);
    }
  }
  function refreshExpMarkers() {
    for (const m of expMarkers) {
      const { zid, key } = m.userData;
      const bought = expansions[zid].includes(key);
      const needs = EXP_PATCHES[key].needs;
      m.visible = !bought && zoneUnlocked(zid)
        && (!needs || expansions[zid].includes(needs));
      if (!bought) {
        m.material.map.dispose();
        m.material.map = expLabelTex(expCost(zid));
      }
    }
  }
  function tryBuyExpansion(m) {
    const { zid, key } = m.userData;
    const cost = expCost(zid);
    if (polyps < cost) { flash(rateEl, `need ${cost} 🪸`); return; }
    polyps -= cost;
    buildExpansion(zid, key);
    relocateWildDecor();      // untended coral on the new plot moves aside
    refreshExpMarkers(); refreshZoneLocks(); refreshHud(); save();
    flash(rateEl, `reef expanded!`, '#7fd8b0');
  }

  // ── State + persistence ──────────────────────────────────────────────────────
  const corals = [];          // THREE groups; userData { grow, seed, spec, entry, levelScale }
  const fishes = [];          // motion state incl. .g mesh
  const placedCorals = [];    // { b, c, r, id, level }   (saved)
  const placedFish = [];      // { id, b, cx, cz, R, y, w, phase, bob, bobw } (saved)
  const seen = new Set();     // journal — every species ever placed (saved)
  const exclOwned = new Set();   // event-pass exclusive species owned (saved)

  // ── 3D-only roster additions ─────────────────────────────────────────────────
  // Injected at runtime into this page's FISH_SPECIES instance — the shared
  // catalog file is untouched and Classic never sees them.
  Object.assign(FISH_SPECIES, {
    sailfinTang: {
      id: 'sailfinTang', name: 'Sailfin Tang', scientific: 'Zebrasoma veliferum',
      tier: 'epic', layer: 'A', color: 0x8d6e63, accentColor: 0xffe082,
      size: 21, speed: 1.05, unlockLevel: 1, biome: 'both',
      lore: 'Raises its dorsal like a mainsail to look twice its size — the reef’s '
        + 'least expensive way to win an argument.',
    },
    bumpheadParrotfish: {
      id: 'bumpheadParrotfish', name: 'Bumphead Parrotfish', scientific: 'Bolbometopon muricatum',
      tier: 'epic', layer: 'B', color: 0x607d8b, accentColor: 0x9ccc65,
      size: 34, speed: 0.7, unlockLevel: 1, biome: 'both',
      lore: 'Headbutts coral to break off mouthfuls, digests the rock, and returns '
        + 'it as sand. A single bumphead can make tonnes of beach a year — vulnerable '
        + 'in the wild, and a one-fish construction crew here.',
    },
    coelacanth: {
      id: 'coelacanth', name: 'Coelacanth', scientific: 'Latimeria chalumnae',
      tier: 'epic', layer: 'B', color: 0x37474f, accentColor: 0x90a4ae,
      size: 30, speed: 0.55, unlockLevel: 1, biome: 'deepTwilight',
      lore: 'A living fossil: thought extinct for 66 million years until one turned '
        + 'up in a fishing net in 1938. Its lobed fins move like a walk remembered '
        + 'from four hundred million years ago.',
    },
  });

  // ── Rarity & Season Packs (Dragonperch's model, Reef Bloom pricing) ─────────
  // One pack per rarity tier, three ways in: Common–Rare sell for 🫧, Super
  // Rare–Legendary for 💎, and every level-up still mints a free pack for
  // budget-tight players (the tier climbs with the milestone). MYTHIC packs are
  // never sold — they mint only at level 12 and beyond, one per level-up, so
  // the top of the ladder stays skill-gated. Every pack reveals three cards —
  // riches, a free coral of the pack's tier, and a guaranteed fish of the
  // pack's tier — with all odds published in the Packs menu in plain numbers.
  // Event passes mint Season Packs that guarantee one of that event's
  // exclusives.
  const PACK_TIERS = ['common', 'uncommon', 'rare', 'superRare', 'epic', 'legendary', 'mythic'];
  const MYTHIC_PACK_LEVEL = 12;   // level-ups from here mint the unbuyable pack
  // Free-track mint: 2–3 common, 4–5 uncommon, 6–7 rare, 8–9 s.rare, 10 epic,
  // 11 legendary, 12+ mythic — every tier is reachable without spending.
  const packTierForLevel = (l) =>
    l >= MYTHIC_PACK_LEVEL ? 'mythic'
      : l === 11 ? 'legendary'
      : PACK_TIERS[clamp(Math.floor((l - 2) / 2), 0, 4)];
  // Purchase channels — Bubble Energy only, mythic deliberately absent. Pearls
  // (the real-money currency) never buy a random roll, and Bubble Energy can't
  // be bought with pearls anywhere, so packs are not loot boxes under Apple's
  // age-rating definition and the app rates 4+.
  const PACK_PRICE = {
    common:    { be: 75 },
    uncommon:  { be: 150 },
    rare:      { be: 250 },
    superRare: { be: 450 },
    epic:      { be: 700 },
    legendary: { be: 1000 },
  };
  const PACK_RICHES = {   // Riches card: 60% rolls the BE range, 40% the pearls range
    common:    { be: [40, 80],   pearls: [2, 4] },
    uncommon:  { be: [60, 120],  pearls: [3, 6] },
    rare:      { be: [90, 180],  pearls: [5, 10] },
    superRare: { be: [120, 240], pearls: [8, 15] },
    epic:      { be: [160, 320], pearls: [12, 22] },
    legendary: { be: [220, 440], pearls: [18, 35] },
    mythic:    { be: [300, 600], pearls: [30, 60] },
  };
  const packs = {};         // tier -> unopened count (saved)
  const seasonPacks = [];   // eventId per unopened Season Pack (saved)
  const vouchers = {};      // coralId -> free placements left (saved)
  let packBtn = null;       // menu button; assigned with the other menus
  let dailyPackDate = '';   // last calendar day the free Daily Pack was opened (saved)

  const rollRange = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));
  // Pack and egg pools are level- AND biome-gated: they only roll species the
  // player could meet anyway — nothing above their level, nothing homed in a
  // locked zone. Ungated tier lists remain as a never-brick fallback for eggs.
  // Pearl species never roll: "so rare it can't be hatched" — they're Skip-7's.
  const tierFish = (tier) => allFish().filter(s => s.tier === tier && !s.eventId && !s.pearlCost);
  const fishAvailable = (s) =>
    (s.unlockLevel ?? 1) <= level && zoneUnlocked(primaryBiome(s));
  const coralAvailable = (s) =>
    (s.unlockLevel ?? 1) <= level
    && Object.keys(ZONES).some(z => zoneUnlocked(z) && matchesBiome(s, z));
  const packFishPool = (tier) => tierFish(tier).filter(fishAvailable);
  const packCoralPool = (tier) =>
    allCorals().filter(s => s.tier === tier && !s.eventId && !s.utility && coralAvailable(s));

  // ── Wild-abundance odds ──────────────────────────────────────────────────────
  // Within a tier, species roll roughly as often as the real ocean serves
  // them: schooling forage fish and tidepool life are weighted up; endangered
  // and one-of-a-kind creatures are weighted down. Unlisted species weigh 1.
  const WILD_ABUNDANCE = {
    // superabundant schoolers & tidepool life
    lanternfish: 3, anthias: 3, blueChromis: 2.5, chromis: 2.5, damselfish: 2.5, hermitCrab: 2.5,
    barnacles: 2.5, blenny: 2.5, sergeantMajor: 2.2, mullet: 2.2, tidepoolCrab: 2.2, seaweed: 2.2,
    seaLettuce: 2.2, hatchetfish: 2, cardinalfish: 2, sandDollar: 2, corallineAlgae: 2,
    squirrelfish: 2, goatfish: 2,
    cleanerShrimp: 1.8, neonGoby: 1.8, sculpin: 1.8, seagrass: 1.8, gooseneckBarnacles: 1.8,
    // common reef citizens
    clownfish: 1.6, zebraGoby: 1.6, ochreStar: 1.6, fireCoral: 1.6, redSeagrass: 1.6,
    tidepoolAnemone: 1.6, kelp: 1.6, royalGramma: 1.5, ghostGoby: 1.5, glowCleanerGoby: 1.5,
    tropicBlenny: 1.5, zebrafish: 1.5, phantomLionfish: 1.5,   // lionfish: famously overabundant
    lionfish: 1.5, dottyback: 1.5, hawkfish: 1.4,
    starter: 1.5, yellowTang: 1.4, blueTang: 1.4, firefish: 1.4, cleanerWrasse: 1.4,
    pajamaCardinalfish: 1.4, chiton: 1.4, brain: 1.4, toadstool: 1.4,
    parrotfish: 1.3, opaleye: 1.3, rabbitfish: 1.3, rainbowGoby: 1.3, shrimpGoby: 1.3,
    deepBlenny: 1.3, flamingoTongue: 1.3, finger: 1.3, sunCoral: 1.3,
    foxfaceRabbitfish: 1.3, powderBrownTang: 1.2, filefish: 1.2,
    butterflyfish: 1.2, pipefish: 1.2, dragonfish: 1.2, viperfish: 1.2, flashlightFish: 1.2,
    raccoonButterflyfish: 1.2, longnoseButterflyfish: 1.2, copperbandButterflyfish: 1.2,
    seaUrchin: 1.2, lettuce: 1.2, lagoonFan: 1.2, mangroveSapling: 1.2,
    // sparser out there
    octopus: 1.1, cuttlefish: 1.1, rubyOctopus: 1.1, pufferfish: 1.1, bonefish: 1.1,
    bicolorAngelfish: 1.1, boxfish: 1.0, porcupinePuffer: 1.0, emperorSnapper: 0.9,
    flameAngelfish: 0.9, glowfinAngelfish: 0.9, stingray: 0.9, horseshoeCrab: 0.9,
    midnightTable: 0.9, giantMoray: 0.8, harlequinTuskfish: 0.8, fangtooth: 0.8,
    conch: 0.8, star: 0.8, phantomPolyp: 0.8, wispCoral: 0.8,
    emperorAngelfish: 0.8, spottedDrum: 0.8, scorpionfish: 0.8, longfinBatfish: 0.8,
    giantTrevally: 0.8,
    mandarinfish: 0.7, blueRibbonEel: 0.7, anglerfish: 0.7,
    clownTriggerfish: 0.8, sailfinTang: 1.3, bumpheadParrotfish: 0.5, coelacanth: 0.2,
    barreleye: 0.6, ribbonfish: 0.6, gulperEel: 0.6, nautilus: 0.6, dolphin: 0.6,
    abyssalRay: 0.6, rainbowCoral: 0.6, sunfire: 0.6, blacktipReefShark: 0.6,
    // threatened & endangered in the real ocean
    seahorse: 0.5, neonSeahorse: 0.5, twilightSeahorse: 0.5, shark: 0.5, lemonShark: 0.5,
    frogfish: 0.5,
    spottedEagleRay: 0.5, staghorn: 0.5, banggaiCardinalfish: 0.4, frilledShark: 0.4,
    seaOtter: 0.4, elkhorn: 0.4, whaleShark: 0.4, manatee: 0.35, seaTurtle: 0.35, oarfish: 0.35,
    napoleonWrasse: 0.3, mantaRay: 0.3, dugong: 0.3, giantSquid: 0.3,
    twilightWhaleShark: 0.3, pillar: 0.3,
    // one of a kind
    gavin: 0.1,
  };
  const wildWeight = (s) => WILD_ABUNDANCE[s.id] ?? 1;
  function weightedPick(pool) {
    let total = 0;
    for (const s of pool) total += wildWeight(s);
    let r = Math.random() * total;
    for (const s of pool) { r -= wildWeight(s); if (r <= 0) return s; }
    return pool[pool.length - 1];
  }
  // Weekly featured fish — a fixed, disclosed 25% slice of the fish roll in
  // packs of its tier. Deterministic per calendar week; nothing to save.
  function featuredFish() {
    const pool = allFish().filter(s => !s.eventId && s.tier !== 'common');
    return pool.length ? pool[Math.floor(Date.now() / 604800000) % pool.length] : null;
  }
  const packCount = () =>
    Object.values(packs).reduce((n, c) => n + c, 0) + seasonPacks.length
    + (dailyPackDate !== EV_TODAY() ? 1 : 0);   // the day's free pack counts
  function refreshPackBtn() {
    if (packBtn) packBtn.textContent = packCount() > 0 ? `🎁 ${packCount()}` : '🎁';
  }
  // Pack fish spawn straight into their own biome — the reveal IS the placement.
  function packSpawnFish(spec) {
    const zone = ZONES[primaryBiome(spec)] ?? ZONES.coral;
    const st = fishState(spec,
      zone.cx + (Math.random() - 0.5) * 6, zone.cz + (Math.random() - 0.5) * 6,
      fishes.length, zone);
    const g = attachFish(spec, st, true);
    const rec = fishSaveData(st); placedFish.push(rec); g.userData.saveRef = rec;
  }
  function openRarityPack(tier) {
    if (!(packs[tier] > 0)) return null;
    packs[tier]--;
    const lbl = TIER_LABEL[tier] ?? tier;
    const cards = [];
    // Card 1 — Riches.
    const R = PACK_RICHES[tier];
    if (Math.random() < 0.6) {
      const amt = rollRange(R.be); be = Math.min(be + amt, beMax);
      cards.push({ icon: '🫧', title: `+${amt} Bubble Energy`, sub: 'Riches — the 60% roll', gain: { be: amt } });
    } else {
      const amt = rollRange(R.pearls); pearls += amt;
      cards.push({ icon: '💎', title: `+${amt} Pearls`, sub: 'Riches — the 40% roll', gain: { pearls: amt } });
    }
    // Card 2 — a free-placement voucher for any coral of the pack's tier.
    const cPool = packCoralPool(tier);
    if (cPool.length) {
      const spec = weightedPick(cPool);
      vouchers[spec.id] = (vouchers[spec.id] ?? 0) + 1;
      cards.push({ icon: '🎟', title: `${spec.name} — free placement`,
        sub: `Any ${lbl} coral can roll (wild-abundance odds) — yours to place free`,
        added: '✓ in your palette' });
    } else {
      const amt = rollRange(R.be); be = Math.min(be + amt, beMax);
      cards.push({ icon: '🫧', title: `+${amt} Bubble Energy`,
        sub: `No ${lbl} coral is within your reach yet — consolation riches`, gain: { be: amt } });
    }
    // Card 3 — the guaranteed fish (featured takes a fixed 25% slice of its
    // tier, but only once the featured fish itself is within the gate).
    const feat = featuredFish();
    const fPool = packFishPool(tier);
    let spec = feat && feat.tier === tier && fishAvailable(feat) && Math.random() < 0.25
      ? feat : null;
    if (!spec && fPool.length) spec = weightedPick(fPool);
    if (spec) {
      packSpawnFish(spec);
      cards.push({ icon: '🐟', title: `${spec.name} joins the reef!`,
        sub: `Guaranteed ${lbl} fish${spec === feat ? " — ⭐ this week's featured" : ''}`,
        added: '✓ swimming now' });
    } else {
      const amt = rollRange(R.be); be = Math.min(be + amt, beMax);
      cards.push({ icon: '🫧', title: `+${amt} Bubble Energy`,
        sub: `No ${lbl} fish swims your unlocked waters yet — consolation riches`, gain: { be: amt } });
    }
    refreshLocks(); refreshPackBtn(); refreshProgress(); refreshHud(); save();
    return cards;
  }
  // Buying mints one pack of the tier and opens it on the spot. Mythic has no
  // price row and can never pass through here.
  function buyRarityPack(tier) {
    const price = PACK_PRICE[tier];
    if (!price) return null;
    if (!packFishPool(tier).length) {
      flash(rateEl, 'no such fish in your waters yet'); return null;
    }
    if (price.be) {
      if (be < price.be) { flash(rateEl, 'not enough 🫧'); return null; }
      be -= price.be;
    } else {
      if (pearls < price.pearls) { flash(rateEl, `need ${price.pearls} 💎`); return null; }
      pearls -= price.pearls;
    }
    packs[tier] = (packs[tier] ?? 0) + 1;
    return openRarityPack(tier);
  }
  // The Daily Pack — free, once a calendar day: modest riches (the polyp roll
  // deliberately funds surveys), one seedling from coral you've ALREADY
  // recorded (it grows the reef, never skips discovery), and a low-tier egg
  // settling into the nest. The heartbeat of the slow economy.
  function openDailyPack() {
    if (dailyPackDate === EV_TODAY()) return null;
    dailyPackDate = EV_TODAY();
    const cards = [];
    if (Math.random() < 0.6) {
      const amt = rollRange([20, 50]);
      be = Math.min(be + amt, beMax);
      cards.push({ icon: '🫧', title: `+${amt} Bubble Energy`, sub: 'Daily riches — the 60% roll', gain: { be: amt } });
    } else {
      const amt = rollRange([5, 12]);
      polyps = Math.min(polyps + amt, POLYP_MAX);
      cards.push({ icon: '🪸', title: `+${amt} Polyps`,
        sub: 'Daily riches — the 40% roll. Science fuel.', gain: { polyps: amt } });
    }
    const kn = [...allCorals(), GOLDEN_SPEC]
      .filter(s => !s.utility && !s.eventId && !s.pearlCost && seen.has(s.id));
    if (kn.length) {
      const spec = weightedPick(kn);
      vouchers[spec.id] = (vouchers[spec.id] ?? 0) + 1;
      cards.push({ icon: '🌱', title: `${spec.name} seedling`,
        sub: 'From your recorded coral, wild-abundance odds — a free placement',
        added: '✓ in your palette' });
    } else {
      polyps = Math.min(polyps + 10, POLYP_MAX);
      cards.push({ icon: '🪸', title: '+10 Polyps',
        sub: 'No recorded coral yet — nursery credit instead', gain: { polyps: 10 } });
    }
    const roll = Math.random();
    const t = roll < 0.6 ? 'common' : roll < 0.85 ? 'uncommon' : 'rare';
    if (nestEggs.length < NEST_CAP) {
      nestEggs.push({ t, at: Date.now() + EGG_TYPES[t].ms });
      refreshNestEggs();
      cards.push({ icon: '🥚', title: `A ${EGG_TYPES[t].name} settles into the nest`,
        sub: 'Incubating now — 60% common / 25% uncommon / 15% rare', added: '✓ in the nest' });
    } else {
      be = Math.min(be + 10, beMax);
      cards.push({ icon: '🫧', title: '+10 Bubble Energy', sub: 'The nest is full — energy instead', gain: { be: 10 } });
    }
    refreshLocks(); refreshPackBtn(); refreshHud(); save();
    return cards;
  }

  // The Starter Pack — every reef's welcome gift at level 1. Fixed contents,
  // no rolls: a Starter Coral voucher, two Green Chromis, and a Clownfish.
  // Opening it is the player's first taste of the pack ritual.
  function openStarterPack() {
    if (!(packs.starter > 0)) return null;
    packs.starter--;
    vouchers.starter = (vouchers.starter ?? 0) + 3;
    const cards = [];
    cards.push({ icon: '🎟', title: 'Three Starter Coral seedlings',
      sub: 'Plant them on Coral Reef tiles — your reef begins here', added: '✓ in your palette' });
    packSpawnFish(FISH_SPECIES.blueChromis);
    packSpawnFish(FISH_SPECIES.chromis);
    cards.push({ icon: '🐟', title: 'A Blue and a Green Chromis join the reef!',
      sub: 'Chromis school together — watch them find each other', added: '✓ swimming now' });
    packSpawnFish(FISH_SPECIES.clownfish);
    cards.push({ icon: '🐠', title: 'A Clownfish joins the reef!',
      sub: "The reef's first famous face", added: '✓ swimming now' });
    refreshLocks(); refreshPackBtn(); refreshProgress(); refreshHud(); save();
    return cards;
  }
  function openSeasonPack(idx) {
    const evId = seasonPacks[idx];
    if (evId === undefined) return null;
    seasonPacks.splice(idx, 1);
    const def = eventById(evId);
    const pool = (def?.pass?.tiers ?? [])
      .map(t => t.reward?.exclusive).filter(id => id && !exclOwned.has(id));
    const cards = [];
    if (pool.length) {
      const id = pool[Math.floor(Math.random() * pool.length)];
      exclOwned.add(id); refreshExclRows();
      const spec = CORAL_SPECIES[id] ?? FISH_SPECIES[id];
      cards.push({ icon: def?.icon ?? '🎁', title: `${spec?.name ?? id} unlocked!`,
        sub: `${def?.name ?? 'Event'} exclusive — guaranteed one you didn't own`, added: '✓ unlocked' });
    } else {
      pearls += 15;
      cards.push({ icon: '💎', title: '+15 Pearls',
        sub: 'Every exclusive from this event is already owned', gain: { pearls: 15 } });
    }
    refreshPackBtn(); refreshHud(); save();
    return cards;
  }

  // ── Fish Nest & Market (on the rocky outcrop with Bubbles) ──────────────────
  // Fish are no longer bought outright: the Market sells rarity-by-rarity eggs
  // that warm in the Fish Nest and hatch — after a real incubation time — into
  // a random fish of the egg's tier (odds published in the modal). The Premium
  // Egg is the 💎 path to the top tiers. Hatch clocks are absolute timestamps,
  // so eggs keep incubating while the reef is closed.
  const EGG_TYPES = {
    common:    { name: 'Common Egg',     tier: 'common',    be: 5,   ms: 45e3,   color: 0xcfd8dc },
    uncommon:  { name: 'Uncommon Egg',   tier: 'uncommon',  be: 12,  ms: 150e3,  color: 0x81c784 },
    rare:      { name: 'Rare Egg',       tier: 'rare',      be: 25,  ms: 360e3,  color: 0x64b5f6 },
    superRare: { name: 'Super Rare Egg', tier: 'superRare', be: 60,  ms: 900e3,  color: 0xb39ddb },
    epic:      { name: 'Epic Egg',       tier: 'epic',      be: 120, ms: 1800e3, color: 0xef9a9a },
    legendary: { name: 'Legendary Egg',  tier: 'legendary', be: 400, ms: 2700e3, color: 0xffd54f },
    // The one pearl egg hatches exactly the mythic you pick — pearls buy a
    // choice, never a roll (see PACK_PRICE).
    mythic:    { name: 'Mythic Egg',     tier: 'mythic',    pearls: 50, ms: 3600e3, color: 0xffe082, choose: true },
  };
  const NEST_CAP = 4;
  const nestEggs = [];            // { t: typeId, at: hatch epoch ms } (saved)
  let starterEggsGiven = false;   // the level-1 welcome eggs (saved)
  let starterPackGiven = false;   // the level-1 Starter Pack (saved)
  let nestEggGroup = null;        // egg meshes in the nest bowl; set at build
  const fmtMs = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
    if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
    return `${s}s`;
  };
  // Eggs share the packs' level+biome gate (packFishPool): the hatch pool
  // only holds fish the player could meet anyway. Levels and new biomes
  // enrich every egg the moment they arrive (counts disclosed live), and an
  // already-bought egg falls back to the ungated tier list — never bricked.
  function eggPool(t) {
    const et = EGG_TYPES[t] ?? EGG_TYPES.common;
    const open = packFishPool(et.tier);
    return open.length ? open : tierFish(et.tier);
  }
  // What a given egg will hatch: a chosen species for choice eggs, else a
  // wild-abundance roll from the tier's pool.
  function eggHatchSpec(egg) {
    if (egg.sp && FISH_SPECIES[egg.sp]) return FISH_SPECIES[egg.sp];
    const pool = eggPool(egg.t);
    return pool.length ? weightedPick(pool) : null;
  }
  const eggBuyable = (t) => packFishPool(EGG_TYPES[t].tier).length > 0;
  function buyEgg(t, sp) {
    const et = EGG_TYPES[t];
    if (!et) return;
    if (!eggBuyable(t)) { flash(rateEl, 'no such fish in your biomes yet'); return; }
    if (nestEggs.length >= NEST_CAP) { flash(rateEl, 'the nest is full'); return; }
    if (et.choose && !packFishPool(et.tier).some(s => s.id === sp)) {
      flash(rateEl, 'pick which species to hatch'); return;
    }
    if (et.be) {
      if (be < et.be) { flash(rateEl, 'not enough 🫧'); return; }
      be -= et.be;
    } else {
      if (pearls < et.pearls) { flash(rateEl, `need ${et.pearls} 💎`); return; }
      pearls -= et.pearls;
    }
    nestEggs.push(et.choose ? { t, at: Date.now() + et.ms, sp } : { t, at: Date.now() + et.ms });
    refreshNestEggs(); refreshHud(); save();
  }
  // Speed-up: pearls, always — impatience is the premium currency's job.
  // 1 💎 per 4 remaining minutes, minimum 1, shrinking as the clock runs.
  function eggRushCost(egg) {
    const remMin = Math.ceil(Math.max(0, egg.at - Date.now()) / 60e3);
    return { pearls: Math.max(1, Math.ceil(remMin / 4)) };
  }
  function speedUpEgg(i) {
    const egg = nestEggs[i];
    if (!egg) return;
    const cost = eggRushCost(egg);
    if (pearls < cost.pearls) { flash(rateEl, `need ${cost.pearls} 💎`); return; }
    pearls -= cost.pearls;
    egg.at = Date.now() - 1;
    nestTick();   // hatches on the spot; refreshes HUD and the open modal
  }
  function nestTick() {
    let hatchedAny = false;
    for (let i = nestEggs.length - 1; i >= 0; i--) {
      if (Date.now() < nestEggs[i].at) continue;
      const egg = nestEggs.splice(i, 1)[0];
      const spec = eggHatchSpec(egg);
      if (!spec) continue;
      packSpawnFish(spec);
      if (placedFish.length === 1) droneTrigger('firstFish');
      ev3Record('hatch_fish'); dqRecord('hatch_fish');
      droneQueue.push(`🐣 A ${spec.name} hatched at the nest!`);
      flash(rateEl, `🐣 ${spec.name} hatched!`, '#ffd27f');
      hatchedAny = true;
    }
    if (!hatchedAny) return;
    refreshNestEggs(); refreshProgress(); refreshHud(); save();
    if (bubblesCounter.open) fillNest();
  }
  // The egg meshes in the nest bowl mirror nestEggs one-to-one.
  const eggMats = new Map();
  function refreshNestEggs() {
    if (!nestEggGroup) return;
    while (nestEggGroup.children.length) {
      const c = nestEggGroup.children[0];
      nestEggGroup.remove(c); c.geometry.dispose();
    }
    nestEggs.forEach((egg, i) => {
      let m = eggMats.get(egg.t);
      if (!m) {
        m = new THREE.MeshStandardMaterial({ color: (EGG_TYPES[egg.t] ?? EGG_TYPES.common).color, roughness: 0.35 });
        m.userData.shared = true;
        eggMats.set(egg.t, m);
      }
      const a = (i / NEST_CAP) * Math.PI * 2 + 0.7;
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), m);
      mesh.scale.y = 1.3;
      mesh.position.set(Math.cos(a) * 0.28, 0.2, Math.sin(a) * 0.28);
      mesh.userData.eggIdx = i;
      nestEggGroup.add(mesh);
    });
  }

  let ev3 = null;                // live event progress (saved)
  let dq = null;                 // today's daily quest (saved)
  const achUnlocked = new Set(); // achievement ids earned (saved)
  const droneQueue = [];         // Bubbles' pending speech lines
  let sawNight = false;          // has this reef been seen after dark (saved)
  let tutDone = false;           // reef orientation finished or skipped (saved)
  let tutPaid = false;           // graduation pearls dispensed — pays once (saved)
  const tutSeen = new Set();     // one-shot actions the tutorial watches for
  const tutNote = (k) => { tutSeen.add(k); };
  let be = START_BE, polyps = START_POLYPS, pearls = START_PEARLS;
  let harmony = START_HARMONY, level = START_LEVEL;
  const music = createReefMusic();
  let timeOfDay = 0.3, nightFactor = 0;   // day/night cycle (saved)
  let fogEase = 0;                        // 1 = camera above the surface (clear air)
  let incomePerSec = 0, polypPerSec = 0, beMax = BE_MAX;
  let onProgress = () => {};   // set once the palette exists — refreshes lock states

  const zoneUnlocked = (zid) => level >= ZONES[zid].unlock;

  // ── Coral growth stages — level 0 is a hatchling nub, level 5 full grown ────
  // Corals plant as hatchlings and grow through stages on a real clock (epoch
  // timestamps, so growth continues while the reef is closed). Scale carries
  // the size; regrown geometry carries the density. Utility corals and decor
  // are structures, not organisms — they place full grown.
  const STAGE_MS = [60e3, 150e3, 300e3, 600e3, 900e3];   // stage s -> s+1
  const STAGE_NAMES = ['Hatchling', 'Sprout', 'Juvenile', 'Colony', 'Mature', 'Full grown'];
  const stageScale = (s) => [0.22, 0.4, 0.55, 0.7, 0.85, 1][clamp(s, 0, 5)];
  const stageOutput = (s) => s === 0 ? 0 : (s / 5) * (1 + (s - 1) * POLYP_BE_BONUS);

  // The Hidey-Hole — a 3D-only decoration (not in the shared species catalog):
  // a rock pile with a dark bolt-hole that ordinary fish sleep in overnight.
  const HIDEY_SPEC = {
    id: 'hideyHole', name: 'Hidey-Hole', scientific: '',
    tier: 'uncommon', tall: false, color: 0x7d8a99, utility: true, decor: true,
    shelter: true, homeCap: 4, polypCost: 20, unlockLevel: 2,
    biome: ['coral', 'seagrass', 'deepTwilight'],
    lore: 'A pile of rocks with a dark doorway. Real reef fish spend their nights'
      + ' wedged into exactly this kind of crevice — a bedroom is a bedroom.',
  };
  // The Golden Tree — the deep twilight's native glowing coral, exactly where
  // the real Laurinque elenya lives. A working income coral: plants as a
  // hatchling, grows on the clock, pays BE like its rare-tier peers, and
  // shimmers gold after dark. The reef's LAMPS remain the lantern corals.
  const GOLDEN_SPEC = {
    id: 'goldenTree', name: 'Golden Tree', scientific: 'Laurinque elenya',
    tier: 'rare', tall: true, color: 0xffd54f, accentColor: 0xffecb3,
    unlockLevel: 1,
    biome: 'deepTwilight',
    lore: 'A real discovery: golden, tree-like corals over a metre tall were found'
      + ' 360–529 m down on seamounts off Costa Rica — so unlike anything known that'
      + ' scientists gave them a brand-new family, Laurinqueidae. In the wild they'
      + ' rise from dark rock ringed by thousands of brittle stars: gilded trees'
      + ' standing among stars.',
    wildNote: 'Newly described — deep Pacific seamounts only',
  };
  const LOCAL_SPECS = { hideyHole: HIDEY_SPEC, goldenTree: GOLDEN_SPEC };

  // ── Coral discovery ─────────────────────────────────────────────────────────
  // Corals are discovered like fish now: the palette's standard coral rows show
  // only recorded species (level-1 basics start known; utility structures and
  // pearl species stay visible). Three discovery vectors:
  //  🔬 Bubbles' surveys — fund with polyps, real timer, guaranteed find
  //  🐟 fragment finders — a few specific species, incredibly rarely
  //  ⚖ harmony settlement — larvae settle wild on a reef held in high harmony
  let survey = null;   // { b: biomeId, at: epoch ms, d: tier idx, cost } (saved)
  // Expedition length is a choice: longer searches (and higher reef levels)
  // reach rarer species. 90% the find is from the surveyed biome; 5% each
  // it's a drifter from one of the other biomes — either way it comes home
  // as a free-placement voucher.
  const SURVEY_TIERS = [
    { name: 'Quick sweep', min: 8, cost: 30 },
    { name: 'Field survey', min: 25, cost: 60 },
    { name: 'Grand expedition', min: 60, cost: 100 },
  ];
  // Tier bias: base < 1 favors common tiers, > 1 favors rare ones. Search
  // depth and level push the base up; wild-abundance odds still apply.
  function surveyPick(pool, d) {
    const base = 0.55 + 0.25 * d + level * 0.015;
    const ws = pool.map(s =>
      wildWeight(s) * Math.pow(base, Math.max(0, PACK_TIERS.indexOf(s.tier))));
    let total = 0;
    for (const w of ws) total += w;
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) { r -= ws[i]; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }
  const FRAGMENT_FINDERS = new Set(['parrotfish', 'bumpheadParrotfish', 'hermitCrab', 'ochreStar']);
  const FRAGMENT_CHANCE = 1 / 7200;    // per finder per second — incredibly rare
  const SETTLE_HARMONY = 85;
  const SETTLE_CHANCE = 1 / 5400;      // per second while harmony holds
  const discoverableCorals = (zid) =>
    [...allCorals(), GOLDEN_SPEC].filter(s =>
      !s.utility && !s.pearlCost && !s.eventId && !seen.has(s.id)
      && (zid ? primaryBiome(s) === zid : zoneUnlocked(primaryBiome(s))));
  const surveyCanFind = () =>
    ['coral', 'seagrass', 'deepTwilight'].some(z => discoverableCorals(z).length > 0);
  // Resolve the live survey: 90% the surveyed biome, 5% each a drifter, with
  // graceful fallbacks so a find happens whenever anything remains anywhere.
  function resolveSurvey() {
    if (!survey) return;
    const { b, d = 0, cost = 40 } = survey;
    survey = null;
    const zids = ['coral', 'seagrass', 'deepTwilight'];
    const others = zids.filter(z => z !== b);
    const roll = Math.random();
    let zid = roll < 0.9 ? b : roll < 0.95 ? others[0] : others[1];
    let pool = discoverableCorals(zid);
    if (!pool.length) { zid = b; pool = discoverableCorals(b); }
    if (!pool.length) {
      for (const z of zids) {
        if (discoverableCorals(z).length) { zid = z; pool = discoverableCorals(z); break; }
      }
    }
    if (pool.length) {
      const spec = surveyPick(pool, d);
      const drift = zid === b
        ? ` recorded in the ${BIOMES[b].name}!`
        : ` recorded — a drifter from the ${BIOMES[zid].name}!`;
      discoverCoral(spec, `🔬 Survey complete: ${spec.name}${drift} The specimen is in your palette.`);
    } else {
      polyps = Math.min(polyps + cost, POLYP_MAX);
      droneQueue.push('🔬 Survey complete: no unrecorded coral remains out there. Fee returned.');
    }
    if (journal.ov.style.display === 'flex') fillJournal();
  }
  function discoverCoral(spec, line) {
    seen.add(spec.id);
    vouchers[spec.id] = (vouchers[spec.id] ?? 0) + 1;   // the specimen comes home
    droneQueue.push(line);
    flash(rateEl, `📖 ${spec.name} recorded!`, '#ffd27f');
    refreshLocks(); refreshHud(); save();
  }

  // ── Real or fiction ─────────────────────────────────────────────────────────
  // Every species is identified as a real Earth creature or a Reef Bloom
  // original. Shown in the journal (🌍/✨) and each species popup — a mixed
  // roster is fine for a game, but a kid should always be able to tell which
  // creatures they could actually meet.
  const REAL_SPECIES = new Set([
    // fish & friends
    'garibaldi',
    'blueChromis', 'chromis', 'zebraGoby', 'cardinalfish', 'clownfish', 'yellowTang',
    'blueTang', 'octopus', 'moorishIdol', 'butterflyfish', 'zebrafish', 'seahorse',
    'cuttlefish', 'morayEel', 'dolphin', 'shark', 'neonGoby', 'firefish', 'damselfish',
    'royalGramma', 'pajamaCardinalfish', 'shrimpGoby', 'banggaiCardinalfish',
    'cleanerWrasse', 'flameAngelfish', 'mandarinfish', 'harlequinTuskfish',
    'blueRibbonEel', 'napoleonWrasse', 'giantMoray', 'horseshoeCrab', 'pipefish',
    'sandDollar', 'conch', 'pufferfish', 'spottedEagleRay', 'dugong', 'seaUrchin',
    'parrotfish', 'rabbitfish', 'cleanerShrimp', 'mantaRay', 'manatee', 'seaTurtle',
    'lanternfish', 'ghostGoby', 'hatchetfish', 'dragonfish', 'flashlightFish',
    'viperfish', 'barreleye', 'ribbonfish', 'anglerfish', 'gulperEel', 'fangtooth',
    'frilledShark', 'giantSquid', 'nautilus', 'oarfish', 'mullet', 'sergeantMajor',
    'hermitCrab', 'bonefish', 'flamingoTongue', 'stingray', 'lemonShark', 'sculpin',
    'ochreStar', 'tidepoolCrab', 'chiton', 'opaleye', 'rubyOctopus', 'seaOtter',
    'clownTriggerfish', 'sailfinTang', 'bumpheadParrotfish', 'coelacanth', 'opah',
    'anthias', 'squirrelfish', 'blenny', 'hawkfish', 'dottyback', 'filefish', 'goatfish',
    'boxfish', 'raccoonButterflyfish', 'longnoseButterflyfish', 'bicolorAngelfish',
    'powderBrownTang', 'foxfaceRabbitfish', 'porcupinePuffer', 'copperbandButterflyfish',
    'spottedDrum', 'lionfish', 'emperorSnapper', 'emperorAngelfish', 'frogfish',
    'scorpionfish', 'longfinBatfish', 'giantTrevally', 'blacktipReefShark', 'whaleShark',
    'yellowChromis',
    // corals & flora
    'staghorn', 'finger', 'brain', 'lettuce', 'star', 'bubble', 'candycane',
    'toadstool', 'elkhorn', 'pillar', 'table', 'barnacles', 'redSeagrass', 'seaweed',
    'seagrass', 'kelp', 'sunCoral', 'lagoonFan', 'fireCoral', 'mangroveSapling',
    'tidepoolAnemone', 'gooseneckBarnacles', 'seaLettuce', 'corallineAlgae',
    'anemoneHome', 'goldenTree',
      'leafySeaDragon', 'weedySeaDragon', 'molaMola', 'spinnerDolphin',
  ]);
  const isRealSpecies = (id) => REAL_SPECIES.has(id);

  // ── Field ID quiz ───────────────────────────────────────────────────────────
  // Five true/false questions a day about species the player has recorded,
  // generated from the journal's real data (tier, biome, glow, taxonomy) with
  // a date seed so the day's paper is fixed. +4 🪸 per correct, +1 💎 perfect.
  let quiz = { date: '', i: 0, score: 0 };   // (saved)
  function quizQuestions() {
    const today = EV_TODAY();
    let seed = 0;
    for (const ch of today) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rng = mulberry32(seed ^ 0x5eed);
    const known = [...allCorals(), ...allFish(), ...Object.values(LOCAL_SPECS)]
      .filter(s => seen.has(s.id));
    if (known.length < 3) return null;
    const qs = [], used = new Set();
    let guard = 0;
    while (qs.length < 5 && guard++ < 60) {
      const spec = known[Math.floor(rng() * known.length)];
      if (used.has(spec.id)) continue;
      used.add(spec.id);
      qs.push(makeQuizQ(spec));
    }
    return qs.length ? qs : null;
  }
  function makeQuizQ(spec) {
    const real = isRealSpecies(spec.id);
    return {
      q: `${spec.name} is a real species, found in Earth's oceans.`,
      a: real,
      why: real
        ? `Real${spec.scientific ? ` — ${spec.scientific}` : ''}. You could meet one.`
        : `Fiction — ${spec.name} was invented for Reef Bloom.`,
    };
  }

  // ── Coral seedlings ─────────────────────────────────────────────────────────
  // A fully grown coral occasionally releases a seedling of its own species —
  // a free placement, capped at 2 banked per species so mature reefs don't
  // mint coral forever. Clocks are absolute (saved per coral as entry.s).
  const SEED_MIN = { common: 8, uncommon: 12, rare: 18, superRare: 25, epic: 35, legendary: 50, mythic: 70 };
  function seedTick() {
    const now = Date.now();
    for (const g of corals) {
      const e = g.userData.entry, spec = g.userData.spec;
      if (!e || spec.utility || e.level < CORAL_MAX_LEVEL) continue;
      const interval = (SEED_MIN[spec.tier] ?? 20) * 60e3;
      if (!e.s) { e.s = now + interval; continue; }
      if (now < e.s) continue;
      if ((vouchers[spec.id] ?? 0) >= 2) { e.s = now + interval / 2; continue; }
      e.s = now + interval;
      vouchers[spec.id] = (vouchers[spec.id] ?? 0) + 1;
      flash(rateEl, `🌱 ${spec.name} seedling!`, '#7fd8b0');
      refreshLocks();
    }
  }
  function makeGoldenTree() {
    const g = new THREE.Group();
    const seedBase = 7777 + coralCounter++ * 7919;
    const rnd = mulberry32(seedBase);
    g.userData = { grow: 0, buildSeed: seedBase };
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.85 });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffd54f, roughness: 0.35, emissive: 0xffb300, emissiveIntensity: 0.4 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.13, 1.1, 7), trunkMat);
    trunk.position.y = 0.55;
    g.add(trunk);
    const tufts = 5 + Math.floor(rnd() * 3);
    for (let i = 0; i < tufts; i++) {
      const a = rnd() * Math.PI * 2, r = 0.14 + rnd() * 0.3, h = 0.95 + rnd() * 0.5;
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.5, 5), trunkMat);
      branch.position.set(Math.cos(a) * r * 0.6, h - 0.25, Math.sin(a) * r * 0.6);
      branch.rotation.z = Math.cos(a) * 0.7;
      branch.rotation.x = -Math.sin(a) * 0.7;
      g.add(branch);
      const tuft = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16 + rnd() * 0.12, 0), goldMat);
      tuft.position.set(Math.cos(a) * r, h, Math.sin(a) * r);
      g.add(tuft);
    }
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 0), goldMat);
    crown.position.y = 1.35;
    g.add(crown);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.rotation.y = rnd() * Math.PI * 2;
    g.userData.seed = rnd() * 6.28;
    g.userData.glowMats = [goldMat];   // brightens with the biolums after dark
    g.scale.setScalar(0.01);
    return g;
  }
  function makeHideyHole() {
    const g = new THREE.Group();
    const seedBase = 4242 + coralCounter++ * 7919;
    const rnd = mulberry32(seedBase);
    g.userData = { grow: 0, buildSeed: seedBase };
    for (const [x, z, s, sy] of [[0, 0, 0.62, 0.7], [-0.42, 0.3, 0.4, 0.55], [0.44, 0.26, 0.36, 0.5]] ) {
      const r = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), rockMat);
      r.position.set(x, 0.18 * sy, z);
      r.scale.set(s, s * sy, s);
      r.rotation.y = rnd() * Math.PI;
      g.add(r);
    }
    const hole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.2, 0.16, 12), pupilMat);
    hole.rotation.x = Math.PI / 2 - 0.35;
    hole.position.set(0.05, 0.3, 0.42);
    g.add(hole);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.rotation.y = rnd() * Math.PI * 2;
    g.userData.seed = rnd() * 6.28;
    g.scale.setScalar(0.01);
    return g;
  }

  function addCoral(spec, tile, lvl, growAt) {
    lvl ??= spec.utility ? CORAL_MAX_LEVEL : 0;
    tile.userData.occupied = true;
    const group = spec.decor ? makeHideyHole()
      : spec.id === 'goldenTree' ? makeGoldenTree()
      : makeCoral(spec, Math.max(1, lvl));
    group.position.set(tile.position.x, ZONES[tile.userData.biome].floorY + 0.18, tile.position.z);
    const entry = {
      b: tile.userData.biome, c: tile.userData.c, r: tile.userData.r, id: spec.id, level: lvl,
      g: growAt ?? (lvl < CORAL_MAX_LEVEL && !spec.utility ? Date.now() + STAGE_MS[lvl] : 0) };
    group.userData.spec = spec;
    group.userData.entry = entry;
    group.userData.levelScale = spec.decor ? 1 : stageScale(lvl);
    if (BIOLUM_SPECIES.has(spec.id)) {
      // Real light is dealt out from a fixed pool so placing many can't
      // blow the budget. The lantern family are the reef's designated
      // lamps: brighter, longer throw.
      const lamp = LANTERN_CORALS.has(spec.id);
      group.userData.lampBoost = lamp ? 1.7 : 1;
      group.userData.bio = true;
      // Real light comes from the shared pool (see bioPool): the nearest
      // glowing things to where you're looking each carry a PointLight.
    }
    scene.add(group); corals.push(group);
    placedCorals.push(entry);
    seen.add(spec.id);
    if (spec.shelter) { group.userData.homed = new Set(); shelters.push(group); }
    return group;
  }
  // Time-based growth: advance every overdue stage in one pass, then regrow
  // the same individual denser (same seed — new growth, not a new coral).
  function growCoral(group) {
    const e = group.userData.entry, spec = group.userData.spec;
    if (!e || spec.utility || e.level >= CORAL_MAX_LEVEL || !e.g) return;
    let grew = false;
    while (e.level < CORAL_MAX_LEVEL && e.g && Date.now() >= e.g) {
      e.level++;
      e.g = e.level < CORAL_MAX_LEVEL ? e.g + STAGE_MS[e.level] : 0;
      grew = true;
    }
    if (!grew) return;
    if (spec.id !== 'goldenTree') {   // the tree keeps its build; scale carries growth
      clearCoralGroup(group);
      buildCoralInto(group, spec, group.userData.buildSeed, Math.max(1, e.level));
    }
    group.userData.levelScale = stageScale(e.level);
    group.userData.grow = Math.min(group.userData.grow, 0.85);
    recomputeRates(); refreshHud();
  }

  // ── Shelter homes (Classic's Anemone Haven / Reef Grotto) ────────────────────
  // Anemone Haven homes small layer-A fish overnight; the Reef Grotto homes
  // nocturnal crevice-dwellers through the day. Capacity is the spec's homeCap.
  const shelters = [];
  const isNocturnalSpec = (spec) =>
    primaryBiome(spec) === 'deepTwilight' || !!spec.nocturnal;
  // A bed has to be in water the fish actually lives in. Without this the
  // nearest free bed won regardless of biome, and reef fish (chromis!) commuted
  // into the Deep Twilight every night to sleep in its coral.
  const bedBiome = (g) => g.userData.entry?.b
    ?? (Object.keys(ZONE_BAND).find(z => g.position.x >= ZONE_BAND[z][0] && g.position.x < ZONE_BAND[z][1]) ?? 'coral');
  const bedSuits = (f, spec, g) => {
    const b = bedBiome(g);
    return b === f.b || matchesBiome(spec, b);
  };
  function claimHome(f) {
    const spec = FISH_SPECIES[f.id];
    let best = null, bd = Infinity;
    for (const s of shelters) {
      const sp = s.userData.spec;
      const match = sp.homeFor === 'nocturnal' ? f.noct
        : (sp.homeFor === 'A' || sp.homeFor === 'B') ? spec.layer === sp.homeFor
        : true;
      if (!match || !bedSuits(f, spec, s) || s.userData.homed.size >= (sp.homeCap ?? 6)) continue;
      const dx = s.position.x - f.g.position.x, dz = s.position.z - f.g.position.z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = s; }
    }
    if (!best) {
      // Every shelter and Hidey-Hole is full (or missing) — nestle into a
      // grown coral instead (2 sleepers each), so night finds the reef tucked
      // into its coral rather than lying out on the sand.
      for (const g of corals) {
        const e = g.userData.entry;
        if (!e || g.userData.spec?.utility || e.level < 3 || !bedSuits(f, spec, g)) continue;
        const set = (g.userData.homed ??= new Set());
        if (set.size >= 2) continue;
        const dx = g.position.x - f.g.position.x, dz = g.position.z - f.g.position.z;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = g; }
      }
    }
    if (best) { (best.userData.homed ??= new Set()).add(f); f.home = best; }
    return best;
  }
  function releaseHome(f) {
    if (!f.home) return;
    f.home.userData.homed?.delete(f);
    f.home = null;
    f.bed = null;
    // Wake pointing the way we slept, so steering resumes without a snap.
    if (f.hdg !== undefined && f.g) f.hdg = f.g.rotation.y;
  }

  // ── Cleaning stations (Classic's symbiosis mechanic) ─────────────────────────
  // A 2×2 rocky spa. While a cleaner fish is on duty, nearby fish queue up,
  // park at the tendrils for a scrub, and harmony rises with every client.
  const stationGroups = [];
  const placedStations = [];   // { b, c, r, level } (saved; c,r = NW tile)
  const stationQuad = (b, c, r) =>
    [[c, r], [c + 1, r], [c, r + 1], [c + 1, r + 1]].map(([cc, rr]) => tileAt(b, cc, rr));
  function addStation(b, c, r, lvl = 1) {
    const quad = stationQuad(b, c, r);
    if (quad.some(q => !q || q.userData.occupied)) return null;
    for (const q of quad) q.userData.occupied = true;
    const g = makeStation();
    g.position.set(
      (quad[0].position.x + quad[3].position.x) / 2,
      ZONES[b].floorY + 0.18,
      (quad[0].position.z + quad[3].position.z) / 2);
    const entry = { b, c, r, level: lvl };
    g.userData.station = true;
    g.userData.entry = entry;
    g.userData.clients = [];
    refreshStationOrbs(g);
    scene.add(g); stationGroups.push(g); placedStations.push(entry);
    return g;
  }
  function refreshStationOrbs(g) {
    g.userData.orbs.forEach((o, i) => { o.visible = i < g.userData.entry.level; });
  }
  function removeStationGroup(g) {
    const e = g.userData.entry;
    for (const f of g.userData.clients) { f.clean = null; }
    for (const f of fishes) if (f.duty === g) f.duty = null;
    for (const q of stationQuad(e.b, e.c, e.r)) if (q) q.userData.occupied = false;
    const gi = stationGroups.indexOf(g); if (gi >= 0) stationGroups.splice(gi, 1);
    const pi = placedStations.indexOf(e); if (pi >= 0) placedStations.splice(pi, 1);
    scene.remove(g); disposeGroup(g);
    polyps = Math.min(polyps + 15, POLYP_MAX);
    refreshProgress(); refreshHud(); save();
    flash(rateEl, '+15 🪸', '#7fd8b0');
  }
  function tryUpgradeStation(g) {
    const e = g.userData.entry;
    if (e.level >= STATION_MAX_LEVEL) { flash(rateEl, 'max level'); return; }
    const cost = stationUpgradeCost(e.level);
    if (polyps < cost) { flash(rateEl, `need ${cost} 🪸`); return; }
    polyps -= cost;
    e.level++;
    refreshStationOrbs(g);
    refreshHud(); save();
  }

  // BE/polyp rates, recomputed whenever a coral is placed, upgraded, or removed.
  // Classic: BE/tick = base × (1 + (level-1)·POLYP_BE_BONUS); polyps/tick = 0.2 × level.
  // Utility corals (storage/shelter) yield no BE but still drip polyps, and storage
  // corals raise the wallet cap (beMax) by their `storage` value.
  function recomputeRates() {
    let bePerTick = 0, polypPerTick = 0, storage = 0;
    for (const e of placedCorals) {
      const spec = CORAL_SPECIES[e.id] ?? LOCAL_SPECS[e.id];
      if (!spec) continue;
      if (!spec.utility) {
        bePerTick += (BE_PER_TICK[spec.tier] ?? 1) * stageOutput(e.level);
      }
      polypPerTick += POLYP_PER_CORAL_TICK * e.level;
      storage += spec.storage ?? 0;
    }
    incomePerSec = bePerTick / TICK_SEC;
    polypPerSec = polypPerTick / TICK_SEC;
    beMax = BE_MAX + storage;
  }

  // Classic HarmonySystem.computeHarmony (station terms omitted — no stations in 3D).
  function computeHarmony() {
    const coralCount = placedCorals.length;
    if (coralCount === 0) return Math.max(harmony, 20);
    const coralTypes = new Set(placedCorals.map(c => c.id)).size;
    const fishCount = placedFish.length;
    const fishTypes = new Set(placedFish.map(f => f.id)).size;
    let A = 0, B = 0;
    for (const f of placedFish) {
      const ly = FISH_SPECIES[f.id]?.layer;
      if (ly === 'A') A++; else if (ly === 'B') B++;
    }
    let score = Math.min(coralTypes * 8, 40);
    score += Math.min(fishCount * 5, 20) + Math.min(fishTypes * 5, 10);
    score += (A > 0 && B > 0) ? 15 : (A > 0 || B > 0) ? 7 : 0;
    if (fishCount > 0) {
      score += Math.round((Math.min(fishCount, coralCount) / Math.max(fishCount, coralCount)) * 15);
    }
    // Cleaning symbiosis (Classic): active scrubs lift harmony; a fishy reef
    // with no station at all loses up to the missing-station penalty.
    const activeClean = fishes.reduce((n, f) => n + (f.clean ? 1 : 0), 0);
    score += Math.min(activeClean * CLEANING_HARMONY_PER, CLEANING_HARMONY_MAX);
    if (fishCount >= 3 && placedStations.length === 0) {
      score -= Math.min(CLEANING_MISSING_PENALTY, Math.round(fishCount * 1.2));
    }
    score = Math.max(0, score);
    return Math.min(Math.max(score, harmony * 0.9), 100);   // ratchet, cap 100
  }

  function checkLevelUp() {
    const before = level;
    while (level < MAX_LEVEL) {
      const req = LEVEL_REQS[level + 1];
      if (!req) break;
      // Level 2 also asks for the Reef Orientation — finished or skipped.
      if (level + 1 === 2 && !tutDone) break;
      const [c, f, h] = req;
      if (placedCorals.length >= c && placedFish.length >= f && harmony >= h) {
        level++;
        // Every level-up mints a free pack (budget-tight players still climb
        // the whole ladder). From level 12 on that's MYTHIC — its only mint.
        const pt = packTierForLevel(level);
        packs[pt] = (packs[pt] ?? 0) + 1;
      } else break;
    }
    if (level > before) {
      droneTrigger('levelUp');
      refreshPackBtn();
      flash(rateEl,
        level >= MYTHIC_PACK_LEVEL ? '🎁 MYTHIC Pack earned!' : '🎁 Rarity Pack earned!',
        '#ffd27f');
    }
  }

  // Recompute reef-composition stats after any placement/removal.
  function refreshProgress() { harmony = computeHarmony(); checkLevelUp(); ev3Snapshot(); dqSnapshot(); checkAch(); onProgress(); }

  function tryUpgrade(group) {
    // Polyps buy time, not levels: "Grow now" jumps the coral to its next
    // growth stage immediately and restarts the clock for the one after.
    // (Pearls rush eggs; polyps grow coral and fund research.)
    const e = group.userData.entry;
    if (!e || group.userData.spec?.utility) return;
    if (e.level >= CORAL_MAX_LEVEL) { flash(rateEl, 'fully grown'); return; }
    const cost = upgradeCost(e.level + 1);
    if (polyps < cost) { flash(rateEl, `need ${cost} 🪸`); return; }
    polyps -= cost;
    e.level++;
    e.g = e.level < CORAL_MAX_LEVEL ? Date.now() + STAGE_MS[e.level] : 0;
    // Regrow the same individual with more branches/stalks — the stage shows
    // as new growth, not an inflated copy of the old mesh. (The Golden Tree
    // keeps its build; scale carries its growth.)
    if (group.userData.spec?.id !== 'goldenTree') {
      clearCoralGroup(group);
      buildCoralInto(group, group.userData.spec, group.userData.buildSeed, Math.max(1, e.level));
    }
    group.userData.levelScale = stageScale(e.level);
    group.userData.grow = Math.min(group.userData.grow, 0.82);   // small re-grow ease
    recomputeRates(); refreshHud(); save();   // growth affects rates only, not harmony/level inputs
  }
  // A fish circles an anchor inside its own biome's water column.
  function fishState(spec, cx, cz, i, zone) {
    const half = (zone.grid * TILE) / 2 + 3;
    const R = Math.min(3 + (i % 5) * 1.2, half - 1);
    return {
      id: spec.id, b: zone.id,
      cx: clamp(cx, zone.cx - (half - R), zone.cx + (half - R)),
      cz: clamp(cz, zone.cz - (half - R), zone.cz + (half - R)),
      R,
      y: zone.floorY + 1.9 + (i % 4) * 1.1 + (spec.layer === 'B' ? 1.5 : 0),
      w: (0.12 + (i % 4) * 0.05) * (i % 2 ? 1 : -1),
      phase: i * 1.37, bob: 0.4 + (i % 3) * 0.2, bobw: 0.6 + (i % 3) * 0.3,
    };
  }
  function newRoamTarget(f) {
    f.tx = f.bx0 + Math.random() * (f.bx1 - f.bx0);
    const zr = f.wide ? LAGOON.z : 26;
    f.tz = -zr + Math.random() * zr * 2;
    const floorY = terrainHeight(f.tx, f.tz);
    const [lo, hi] = f.alt ?? [1.6, 4.6];
    const ceiling = f.alt ? SURFACE_Y - 0.9 : 11;   // surface-rafters may ride high
    f.ty = clamp(floorY + lo + Math.random() * (hi - lo), floorY + Math.min(lo, 1.2), ceiling);
  }
  // Benthic crawlers wander short hops across the sand around their anchor.
  function newCrawlTarget(f) {
    const zn = ZONES[f.b] ?? ZONES.coral;
    const half = (zn.grid * TILE) / 2 + 4;
    f.tx = clamp(f.cx + (Math.random() - 0.5) * 12, zn.cx - half, zn.cx + half);
    f.tz = clamp(f.cz + (Math.random() - 0.5) * 12, zn.cz - half, zn.cz + half);
  }
  // One school per species + biome; every member steers around a shared
  // drifting waypoint (picked here) plus boids forces (applied per frame).
  const schools = new Map();
  // Chromis of any color shoal as one family — a blue and a green pair up.
  const SCHOOL_GROUP = { blueChromis: 'chromis', chromis: 'chromis' };
  function schoolOf(st) {
    const key = (SCHOOL_GROUP[st.id] ?? st.id) + '|' + st.b;
    let s = schools.get(key);
    if (!s) {
      s = { b: st.b, members: [], tx: st.cx, ty: st.y, tz: st.cz, until: 0 };
      schools.set(key, s);
    }
    return s;
  }
  function newSchoolTarget(s, t) {
    const [x0, x1] = ZONE_BAND[s.b] ?? ZONE_BAND.coral;
    s.tx = x0 + 3 + Math.random() * (x1 - x0 - 6);
    s.tz = -22 + Math.random() * 44;
    const floorY = terrainHeight(s.tx, s.tz);
    s.ty = clamp(floorY + 1.8 + Math.random() * 4, floorY + 1.5, 9);
    s.until = t + 7 + Math.random() * 8;
  }
  function attachFish(spec, st, placed = false) {
    st.g = makeFish(spec);
    Object.assign(st.g.userData, { placed, stateRef: st });   // `placed` fish are player-owned & removable
    st.noct = isNocturnalSpec(spec);
    const prof = roamProfile(spec);
    if (BENTHIC_SPECIES.has(spec.id)) {
      // Crawlers live on the terrain; runtime-only state, not saved.
      st.benthic = true;
      st.px = st.cx; st.pz = st.cz;
      st.lift = (BENTHIC_LIFT[spec.id] ?? 0.2) * st.g.userData.baseScale;
      st.py = terrainHeight(st.px, st.pz) + st.lift;
      st.spd = 0.1 + (spec.speed ?? 0.3) * 0.35;
      st.hdg = st.phase;
      newCrawlTarget(st);
    } else if (SCHOOL_SPECIES.has(spec.id)) {
      st.px = st.cx + (Math.random() - 0.5) * 2;
      st.py = st.y + (Math.random() - 0.5);
      st.pz = st.cz + (Math.random() - 0.5) * 2;
      st.vx = 0; st.vy = 0; st.vz = 0;
      st.spd = 0.8 + (spec.speed ?? 1.5) * 0.9;
      st.hdg = st.phase;
      st.school = schoolOf(st);
      st.school.members.push(st);
    } else if (prof) {
      // Roamers steer between waypoints; runtime-only state, not saved.
      const style = ROAM_STYLE[spec.id];
      st.roam = true;
      st.bx0 = prof.x0; st.bx1 = prof.x1; st.wide = !!prof.wide;
      st.px = st.cx; st.py = st.y; st.pz = st.cz;
      st.spd = (0.6 + (spec.speed ?? 1) * 0.9) * (style?.drift ?? 1);
      st.hdg = st.phase;
      if (style?.alt) st.alt = style.alt;
      st.pitch = style?.pitch ?? 1;
      st.bobAmp = style?.bob ?? 0.15;
      newRoamTarget(st);
    }
    scene.add(st.g); fishes.push(st);
    refreshFishShadows();
    if (placed) seen.add(spec.id);
    return st.g;
  }
  const fishSaveData = st => ({
    id: st.id, b: st.b, cx: st.cx, cz: st.cz, R: st.R, y: st.y, w: st.w,
    phase: st.phase, bob: st.bob, bobw: st.bobw });

  // ── Removal (Classic: 50% BE refund; 0 for pearl/utility items; no restrictions) ──
  function removeCoralGroup(group) {
    const e = group.userData.entry, spec = group.userData.spec;
    if (!e || !spec) return;
    const refund = (spec.pearlCost || spec.utility) ? 0
      : Math.floor((CORAL_COST[spec.tier] ?? 0) / 2);
    be = Math.min(be + refund, beMax);
    for (const f of group.userData.homed ?? []) { f.home = null; f.bed = null; }
    if (spec.shelter) {
      const si = shelters.indexOf(group); if (si >= 0) shelters.splice(si, 1);
    }
    const ci = corals.indexOf(group); if (ci >= 0) corals.splice(ci, 1);
    const pi = placedCorals.indexOf(e); if (pi >= 0) placedCorals.splice(pi, 1);
    const tile = tileAt(e.b ?? 'coral', e.c, e.r); if (tile) tile.userData.occupied = false;
    scene.remove(group); disposeGroup(group);
    recomputeRates(); refreshProgress(); refreshHud(); save();
    if (refund > 0) flash(rateEl, `+${refund} BE`, '#7fd8b0');
  }
  // Every shadow caster is drawn a second time into the shadow map. A few fish
  // shadows sell the depth of the water; two hundred of them halve the frame
  // rate for something nobody can see. Small fish stop casting past 30 fish,
  // big ones past 90. Re-evaluated only when the population crosses a band.
  let fishShadowBand = -1;
  function refreshFishShadows() {
    const n = fishes.length;
    const band = n <= 30 ? 0 : n <= 90 ? 1 : 2;
    const apply = (f) => {
      const cast = band === 0 || (band === 1 && f.g.userData.big);
      f.g.traverse(o => { if (o.isMesh) o.castShadow = cast && !o.userData.noShadow; });
    };
    if (band !== fishShadowBand) { fishShadowBand = band; fishes.forEach(apply); }
    else if (n) apply(fishes[n - 1]);                   // the newcomer joins the current band
  }
  function removeFishGroup(group) {
    const st = group.userData.stateRef;
    if (!st || !group.userData.placed) return;
    const spec = FISH_SPECIES[st.id];
    const refund = spec?.pearlCost ? 0 : Math.floor((FISH_COST[spec?.tier] ?? 0) / 2);
    be = Math.min(be + refund, beMax);
    const fi = fishes.indexOf(st); if (fi >= 0) fishes.splice(fi, 1);
    refreshFishShadows();
    releaseHome(st);
    if (st.school) {
      const mi = st.school.members.indexOf(st);
      if (mi >= 0) st.school.members.splice(mi, 1);
    }
    const pi = placedFish.indexOf(group.userData.saveRef); if (pi >= 0) placedFish.splice(pi, 1);
    scene.remove(group); disposeGroup(group);
    refreshProgress(); refreshHud(); save();
    if (refund > 0) flash(rateEl, `+${refund} BE`, '#7fd8b0');
  }

  // ── Save slots (three independent reefs) ─────────────────────────────────────
  const SLOTS = ['1', '2', '3'];
  let slot = localStorage.getItem(SLOT_KEY) || '1';
  if (!SLOTS.includes(slot)) slot = '1';
  try {
    // Migrate the pre-slots single save into slot 1 the first time.
    const legacy = localStorage.getItem(SAVE_KEY_BASE);
    if (legacy && !localStorage.getItem(slotKey('1'))) {
      localStorage.setItem(slotKey('1'), legacy);
      localStorage.removeItem(SAVE_KEY_BASE);
    }
  } catch (e) { /* ignore */ }

  function save() {
    try {
      localStorage.setItem(slotKey(slot), JSON.stringify({
        savedAt: Date.now(),   // cloud sync: newest save wins per slot
        be, polyps, pearls, harmony, level, timeOfDay,
        corals: placedCorals, fish: placedFish, seen: [...seen], exp: expansions,
        eggs: [...eggsClaimed], stations: placedStations,
        ev3, excl: [...exclOwned], dq,
        ach: [...achUnlocked], sawNight,
        packs, vouchers, seasonPacks,
        nest: nestEggs, starterEggs: starterEggsGiven,
        starterPack: starterPackGiven, survey, coralDisc: true, quiz,
        dailyPack: dailyPackDate, tut: tutDone, tutp: tutPaid }));
      cloudMarkWritten(slotKey(slot));
    } catch (e) { /* storage full / disabled — ignore */ }
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(slotKey(slot))); } catch (e) { return null; }
  }

  // ── HUD refs ─────────────────────────────────────────────────────────────────
  const beEl = document.getElementById('be-count');
  const rateEl = document.getElementById('be-rate');
  const hmEl = document.getElementById('hm-count');
  const lvlEl = document.getElementById('lvl-count');
  const polypEl = document.getElementById('polyp-count');
  const pearlEl = document.getElementById('pearl-count');
  const beBarEl = document.getElementById('be-bar');
  const hmBarEl = document.getElementById('hm-bar');
  const todDialEl = document.getElementById('tod-dial');
  const todIconEl = document.getElementById('tod-icon');

  // A resource change the player should *see*: the chip pops above the modal
  // dim for a beat and a "+N" (or red "−N") floats off it. Used by pack
  // reveals and pack buys — the HUD number ticking alone is too easy to miss.
  const hudEl = document.getElementById('hud');
  function hudGain(key, amt) {
    const valEl = key === 'be' ? beEl : key === 'pearls' ? pearlEl : key === 'polyps' ? polypEl : null;
    const chip = valEl?.closest('.chip');
    if (!chip || !amt) return;
    const icon = key === 'be' ? '🫧' : key === 'pearls' ? '💎' : '🪸';
    const spend = amt < 0;
    const cls = spend ? 'spend' : 'gain';
    hudEl?.classList.add('gain');
    chip.classList.remove('gain', 'spend');
    void chip.offsetWidth;                 // restart the animation if it's mid-flight
    chip.classList.add(cls);
    const r = chip.getBoundingClientRect();
    const f = document.createElement('div');
    f.className = 'hud-float' + (spend ? ' spend' : '');
    f.textContent = `${spend ? '−' : '+'}${Math.abs(Math.round(amt))} ${icon}`;
    f.style.left = `${r.left + r.width / 2}px`;
    f.style.top = `${r.top - 6}px`;
    document.body.appendChild(f);
    setTimeout(() => { f.remove(); chip.classList.remove(cls); }, 1350);
    clearTimeout(hudGain._t);
    hudGain._t = setTimeout(() => hudEl?.classList.remove('gain'), 1500);
  }
  function refreshHud() {
    if (beEl) beEl.textContent = Math.floor(be);
    if (rateEl && !(performance.now() < Number(rateEl.dataset.flashUntil ?? 0))) {
      rateEl.textContent = `+${incomePerSec.toFixed(1)}/s`;
    }
    if (hmEl) hmEl.textContent = Math.round(harmony);
    if (lvlEl) lvlEl.textContent = level;
    if (polypEl) polypEl.textContent = Math.floor(polyps);
    if (pearlEl) pearlEl.textContent = Math.floor(pearls);
    // Style writes below are guarded — refreshHud runs every frame.
    if (beBarEl) {
      const w = Math.round(clamp(be / beMax, 0, 1) * 100);
      if (beBarEl.dataset.w != w) { beBarEl.dataset.w = w; beBarEl.style.width = `${w}%`; }
    }
    if (hmBarEl) {
      const w = Math.round(clamp(harmony, 0, 100));
      if (hmBarEl.dataset.w != w) {
        hmBarEl.dataset.w = w;
        hmBarEl.style.width = `${w}%`;
        hmBarEl.style.background = w >= 70 ? '#46c08a' : w >= 40 ? '#ffd54f' : '#ef8a70';
      }
    }
    if (todDialEl) {
      const p = Math.round(timeOfDay * 100);
      if (todDialEl.dataset.p != p) {
        todDialEl.dataset.p = p;
        todDialEl.style.background = `conic-gradient(#ffd54f ${p}%, rgba(255,255,255,0.14) 0)`;
        if (todIconEl) {
          todIconEl.textContent =
            timeOfDay < 0.17 || timeOfDay >= 0.86 ? '🌙'
              : timeOfDay < 0.33 ? '🌅' : timeOfDay < 0.7 ? '☀️' : '🌇';
        }
      }
    }
  }

  // ── Save-slot switcher — one button opening the slot-select menu ─────────────
  // (fillSlots / slotsMenu are defined with the other menus below.)
  const slotsEl = document.getElementById('slots');
  if (slotsEl) {
    const b = document.createElement('button');
    b.className = 'slot-btn active';
    b.textContent = `💾 Slot ${slot}`;
    b.onclick = () => { fillSlots(); slotsMenu.show(); };
    slotsEl.appendChild(b);
  }

  // ── Palette UI (full Classic catalog, grouped by biome, level-gated) ──────────
  const paletteEl = document.getElementById('palette');
  const coralSpecs = allCorals();
  const fishSpecs = allFish();
  let selected = { type: 'coral', spec: coralSpecs.find(s => !s.utility && !s.pearlCost) };

  // Cost currency by which field the spec carries: pearls 💎, polyps 🪸, else BE 🫧.
  function priceOf(spec, type) {
    if (spec.pearlCost) return { n: spec.pearlCost, unit: '💎' };
    if (spec.polypCost) return { n: spec.polypCost, unit: '🪸' };
    return { n: (type === 'coral' ? CORAL_COST : FISH_COST)[spec.tier] ?? 0, unit: '🫧' };
  }
  // Coral works like the Fish Shop: an UNRECORDED species places only from a
  // banked 🎟 seedling/find — once recorded, it's buyable at its 🫧 price.
  const seedOnly = (spec, type) =>
    type === 'coral' && !spec.utility && !spec.polypCost && !spec.eventId;
  const coralKnown = (spec) =>
    seen.has(spec.id)
    || Math.max(spec.unlockLevel ?? 1, ZONES[primaryBiome(spec)].unlock) <= 1;

  const rows = [];   // { btn, need }  for lock refresh
  const pearlRows = [];   // Skip-7's corals — shown only while a voucher is banked
  let clearSel = () => { rows.forEach(r => r.btn.classList.remove('sel')); };

  function label(text) {
    const l = document.createElement('div');
    l.textContent = text;
    l.style.cssText = 'width:100%;text-align:center;font-size:10px;letter-spacing:3px;'
      + 'text-transform:uppercase;color:#7fb8d4;margin:4px 0 1px;';
    paletteEl.appendChild(l);
  }
  function button(spec, type) {
    const { n, unit } = priceOf(spec, type);
    const need = Math.max(spec.unlockLevel ?? 1, ZONES[primaryBiome(spec)].unlock);
    // Species reachable in more than one biome show all their biome icons.
    const zones = Object.keys(ZONES).filter(id => matchesBiome(spec, id));
    const badge = zones.length > 1 ? ` ${zones.map(id => BIOMES[id].icon).join('')}` : '';
    const btn = document.createElement('button');
    btn.className = 'coral-btn';
    btn.innerHTML = `<span class="dot" style="background:${hex(spec.color)}"></span>`
      + `${spec.name}${badge}<span class="free-badge" style="display:none">🎟 FREE</span>`
      + `<small>${n} ${unit}</small>`
      + (need > 1 ? `<span class="lv">Lv${need}</span>` : '');
    btn.onclick = () => {
      // A pack voucher lets its species be placed even below its unlock level.
      if (need > level && !(vouchers[spec.id] > 0)) {
        flash(rateEl, `unlocks at Lv ${need}`); return;
      }
      if (seedOnly(spec, type) && !coralKnown(spec) && !(vouchers[spec.id] > 0)) {
        flash(rateEl, '🌱 not yet recorded — needs a seedling or a find');
        return;
      }
      selected = { type, spec };
      removeBtn.classList.remove('on');
      clearSel(); btn.classList.add('sel');
    };
    if (spec === selected.spec) btn.classList.add('sel');
    rows.push({ btn, need, spec, type });
    paletteEl.appendChild(btn);
  }
  function refreshLocks() {
    if (pearlRows.length) refreshPearlRows();
    if (exclRows.length) refreshExclRows();
    for (const r of rows) {
      const free = r.spec && vouchers[r.spec.id] > 0;
      r.btn.classList.toggle('locked', r.need > level && !free);
      const fb = r.btn.querySelector('.free-badge');
      if (fb) {
        const n = vouchers[r.spec?.id] ?? 0;
        fb.style.display = n > 0 ? '' : 'none';
        if (n > 0) fb.textContent = `🎟 ×${n}`;
      }
      // Coral discovery gate: standard coral rows hide until the species is
      // recorded (or a seedling/voucher is banked). Level-1 basics start
      // known; utility, pearl, and event rows keep their own rules.
      if (r.type === 'coral' && r.spec && !r.spec.utility && !r.spec.pearlCost && !r.spec.eventId) {
        const known = seen.has(r.spec.id) || free || r.need <= 1;
        r.btn.style.display = known ? '' : 'none';
      }
    }
  }
  // Locked biomes render their grid ghosted until the level unlocks them.
  function refreshZoneLocks() {
    for (const t of tiles) {
      const base = zoneUnlocked(t.userData.biome) ? tileMats[t.userData.biome] : lockedMat;
      t.userData.baseMat = base;
      if (t.material !== hoverMat) t.material = base;
    }
  }

  // Remove-mode toggle (Classic ✕ REMOVE): tap a coral or fish to remove it.
  const removeBtn = document.createElement('button');
  removeBtn.className = 'coral-btn remove-btn';
  removeBtn.innerHTML = '✕ Remove';
  removeBtn.onclick = () => {
    if (selected.type === 'remove') {
      selected = { type: 'coral', spec: coralSpecs.find(s => !s.utility && !s.pearlCost) };
      removeBtn.classList.remove('on');
    } else {
      selected = { type: 'remove' };
      removeBtn.classList.add('on');
    }
    clearSel();
  };
  paletteEl.appendChild(removeBtn);

  // 🍤 Feed mode — click the water to scatter flakes; the reef mobs them.
  const feedBtn = document.createElement('button');
  feedBtn.className = 'coral-btn';
  feedBtn.innerHTML = '🍤 Feed';
  feedBtn.onclick = () => {
    if (selected.type === 'feed') {
      selected = { type: 'coral', spec: coralSpecs.find(s => !s.utility && !s.pearlCost) };
      feedBtn.classList.remove('sel');
    } else {
      selected = { type: 'feed' };
      removeBtn.classList.remove('on');
      clearSel();
      feedBtn.classList.add('sel');
    }
  };
  paletteEl.appendChild(feedBtn);
  const clearSelBase = clearSel;
  clearSel = (...a) => { feedBtn.classList.remove('sel'); return clearSelBase(...a); };

  // Coral grouped by home biome, mirroring Classic's per-biome shop. Fish only
  // appear here once DISCOVERED — hatched from a Market egg or granted by a
  // pack — after which the species can be bought outright like before.
  const stdCorals = coralSpecs.filter(s => !s.utility && !s.pearlCost);
  for (const zid of ['coral', 'seagrass', 'deepTwilight']) {
    const bio = BIOMES[zid];
    const lv = ZONES[zid].unlock > 1 ? ` · Lv${ZONES[zid].unlock}` : '';
    const cs = stdCorals.filter(s => primaryBiome(s) === zid);
    if (zid === 'deepTwilight') cs.push(GOLDEN_SPEC);   // the twilight's native glow
    if (cs.length) {
      label(`${bio.icon} ${bio.shortName}${lv} — coral · click a tile`);
      cs.forEach(s => button(s, 'coral'));
    }
  }
  const fishShopRows = [];
  let fishShopLabel = null;
  {
    label('🐟 Fish Shop — discovered species · click the water');
    fishShopLabel = paletteEl.lastChild;
    for (const s of fishSpecs.filter(s => !s.eventId && !s.pearlCost)) {
      button(s, 'fish');
      fishShopRows.push({ id: s.id, btn: rows[rows.length - 1].btn });
    }
  }
  // Skip-7's corals: bought at the Pearl Market as a free placement, so the
  // rows only surface while a voucher is banked — then hide again once placed.
  let pearlLabel = null;
  {
    label('🤖 Pearl Market finds · click a tile');
    pearlLabel = paletteEl.lastChild;
    for (const s of coralSpecs.filter(s => s.pearlCost && !s.eventId)) {
      button(s, 'coral');
      pearlRows.push({ id: s.id, btn: rows[rows.length - 1].btn });
    }
  }
  function refreshPearlRows() {
    let any = false;
    for (const r of pearlRows) {
      const own = vouchers[r.id] > 0;
      r.btn.style.display = own ? '' : 'none';
      any = any || own;
    }
    if (pearlLabel) pearlLabel.style.display = any ? '' : 'none';
    // The last voucher just went down: fall back to the default coral rather
    // than leave a species selected that can only be bought from Skip-7.
    if (selected.type === 'coral' && selected.spec?.pearlCost && !(vouchers[selected.spec.id] > 0)) {
      selected = { type: 'coral', spec: coralSpecs.find(s => !s.utility && !s.pearlCost) };
      clearSel();
      rows.find(r => r.spec === selected.spec)?.btn.classList.add('sel');
    }
  }
  // A species row surfaces the moment an egg or a pack first reveals it.
  function refreshFishShop() {
    let any = false;
    for (const r of fishShopRows) {
      const own = seen.has(r.id);
      r.btn.style.display = own ? '' : 'none';
      any = any || own;
    }
    if (fishShopLabel) fishShopLabel.style.display = any ? '' : 'none';
  }
  const utilC = coralSpecs.filter(s => s.utility);
  if (utilC.length) {
    label('Utility · 🪸 polyps');
    button(STATION_SPEC, 'station');   // Classic's 2×2 cleaning station
    utilC.forEach(s => button(s, 'coral'));
    button(HIDEY_SPEC, 'coral');       // fish bedroom — a decoration with a bolt-hole
  }
  // Event-pass exclusives: rows exist up front but stay hidden until owned.
  const exclRows = [];
  let exclLabel = null;
  {
    // Events 2.0: event coral is bought at the Event Shop as a free placement,
    // so its row shows only while a voucher is banked; event fish swim in
    // straight from the shop and never appear here.
    const exclSpecs = Object.values(CORAL_SPECIES).filter(s => s.eventId && s.color != null)
      .map(s => [s, 'coral']);
    if (exclSpecs.length) {
      label('🎉 Event Shop finds · click a tile');
      exclLabel = paletteEl.lastChild;
      for (const [s, type] of exclSpecs) {
        button(s, type);
        exclRows.push({ id: s.id, btn: rows[rows.length - 1].btn });
      }
    }
  }
  function refreshExclRows() {
    let any = false;
    for (const r of exclRows) {
      const own = vouchers[r.id] > 0;
      r.btn.style.display = own ? '' : 'none';
      any = any || own;
    }
    if (exclLabel) exclLabel.style.display = any ? '' : 'none';
  }
  refreshExclRows();

  // Sync locks with level-ups; the fish shop follows the discovery set.
  onProgress = () => { refreshLocks(); refreshZoneLocks(); refreshExpMarkers(); refreshFishShop(); };
  onProgress();

  // ── Counter screens ──────────────────────────────────────────────────────────
  // A "counter" is a full-screen shop run by a character: their portrait,
  // speech bubble and the balances stay pinned up top while shelves of cards
  // scroll beneath, and the bubble follows the shelf — whichever card sits in
  // front of you is the one they're talking about. Skip-7's Pearl Market and
  // Bubbles' Nest & Market are both built on it.
  const counters = [];
  function buildCounter({ id, who, face, balances }) {
    const el = document.createElement('div');
    el.className = 'counter'; el.id = id;
    el.innerHTML = '<div class="ct-top">'
      + `<img class="ct-face" alt="${who}">`
      + `<div class="ct-bubble"><span class="ct-who">${who}</span><span class="ct-say"></span></div>`
      + '<div class="ct-side"><button class="ct-close">Close ✕</button><div class="ct-bal"></div></div>'
      + '</div><div class="ct-body"></div>';
    document.body.appendChild(el);
    const c = {
      el, body: el.querySelector('.ct-body'), faceEl: el.querySelector('.ct-face'),
      bubble: el.querySelector('.ct-bubble'), sayEl: el.querySelector('.ct-say'),
      balEl: el.querySelector('.ct-bal'), items: [], shelves: [], focus: null, open: false,
    };
    let sayTimer = 0;
    c.say = (text) => {
      if (c.sayEl.textContent === text) return;
      clearTimeout(sayTimer);
      c.bubble.classList.add('swap');
      sayTimer = setTimeout(() => { c.sayEl.textContent = text; c.bubble.classList.remove('swap'); }, 160);
    };
    c.sayNow = (text) => { clearTimeout(sayTimer); c.sayEl.textContent = text; c.bubble.classList.remove('swap'); };
    c.focusCard = (card) => {
      if (c.focus === card) return;
      c.focus?.classList.remove('focus');
      c.focus = card;
      card?.classList.add('focus');
      if (card?.dataset.say) c.say(card.dataset.say);
    };
    // A shelf is a section heading; cards added after it belong to it. Give a
    // shelf its own line for when it holds no cards (or nothing to focus).
    c.shelf = (title, sub, say) => {
      const h = document.createElement('div');
      h.className = 'ct-shelf';
      h.innerHTML = `<span>${title}</span>` + (sub ? `<small>${sub}</small>` : '');
      c.body.appendChild(h);
      const grid = document.createElement('div'); grid.className = 'ct-grid';
      c.body.appendChild(grid);
      const s = { el: h, grid, say, cards: [] };
      c.shelves.push(s);
      return s;
    };
    // A card: an image or an icon disc, a name, a tag, a line of small text, an
    // optional extra element (a picker, a progress bar) and one or more buttons.
    c.card = (shelf, { key, say, img, icon, color, name, tag, tagColor, sub, extra, buttons = [] }) => {
      const card = document.createElement('div');
      card.className = 'ct-item';
      if (say) card.dataset.say = say;
      let pic;
      if (img !== undefined) { pic = document.createElement('img'); pic.className = 'ct-tank'; pic.alt = ''; if (img) pic.src = img; }
      else {
        pic = document.createElement('div'); pic.className = 'ct-tank ct-disc' + (color == null ? ' plain' : '');
        pic.innerHTML = `<span style="background:${hex(color ?? 0x7fb8d4)}"></span><em>${icon ?? ''}</em>`;
      }
      const nm = document.createElement('div'); nm.className = 'ct-name'; nm.textContent = name;
      card.append(pic, nm);
      let tagEl = null;
      if (tag) { tagEl = document.createElement('div'); tagEl.className = 'ct-tier'; tagEl.textContent = tag; if (tagColor) tagEl.style.color = tagColor; card.appendChild(tagEl); }
      let subEl = null;
      if (sub !== undefined) { subEl = document.createElement('div'); subEl.className = 'ct-sub'; subEl.innerHTML = sub; card.appendChild(subEl); }
      if (extra) card.appendChild(extra);
      const btnEls = buttons.map(b => {
        const btn = document.createElement('button'); btn.className = 'ct-buy';
        btn.textContent = b.label; btn.disabled = !!b.disabled;
        btn.onclick = (e) => { e.stopPropagation(); c.focusCard(card); b.onClick?.(btn); };
        card.appendChild(btn);
        return btn;
      });
      card.onclick = () => c.focusCard(card);
      shelf.grid.appendChild(card);
      const it = { key, card, pic, tagEl, subEl, buttons: btnEls, shelf };
      shelf.cards.push(it); c.items.push(it);
      return it;
    };
    c.clearShelf = (shelf) => {
      for (const it of shelf.cards) { c.items.splice(c.items.indexOf(it), 1); if (c.focus === it.card) c.focus = null; }
      shelf.cards.length = 0; shelf.grid.innerHTML = '';
    };
    // Which shelf is in front of you: the last one whose heading has passed the
    // upper third of the view (or the last of all at the very bottom). Within
    // it, the nearest card speaks; a shelf with no cards speaks for itself.
    let raf = 0;
    c.body.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const top = c.body.getBoundingClientRect().top;
        const line = top + c.body.clientHeight * 0.36;
        const atEnd = c.body.scrollTop > 0 && c.body.scrollTop + c.body.clientHeight >= c.body.scrollHeight - 4;
        let cur = c.shelves[0];
        for (const s of c.shelves) if (s.el.getBoundingClientRect().top < line + 40) cur = s;
        if (atEnd) cur = c.shelves[c.shelves.length - 1];
        if (!cur) return;
        if (!cur.cards.length) { c.focusCard(null); if (cur.say) c.say(cur.say); return; }
        let best = null, bestD = Infinity;
        for (const it of cur.cards) {
          const r = it.card.getBoundingClientRect();
          const d = Math.abs((r.top + r.height / 2) - line);
          if (d < bestD) { bestD = d; best = it.card; }
        }
        if (best) c.focusCard(best);
      });
    }, { passive: true });
    c.refreshBal = () => { c.balEl.innerHTML = balances().map(([ico, v]) => `<span>${ico} ${v}</span>`).join(''); };
    c.show = (greet) => {
      if (!c.faceEl.src) c.faceEl.src = speciesThumb(face);
      hideFishToast();
      c.refreshBal();
      el.classList.add('open'); c.open = true;
      c.body.scrollTop = 0;
      c.focusCard(null);
      c.sayNow(greet);
    };
    c.hide = () => { el.classList.remove('open'); c.open = false; };
    el.querySelector('.ct-close').onclick = () => c.hide();
    counters.push(c);
    return c;
  }
  const pickLine = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // ── 🤖 Skip-7's Pearl Market ─────────────────────────────────────────────────
  // Pearls buy exactly what is shown — never a random roll — and the pearl
  // packs live down here too. In the iOS app the packs are real StoreKit
  // purchases (src/3d/iap.js): names and prices come from the App Store and
  // pearls are granted only after a verified transaction. The website has no
  // store, so it just says so.
  const SKIP7 = {
    greet: ['Welcome.', 'Back again?', "I've acquired a few interesting specimens.",
      'Browse. I will wait. Waiting is most of what I do.'],
    lines: {
      rainbowGoby: 'All those colours in one fish. Efficient.',
      glowfinAngelfish: 'The fins glow. I did not do that. It came like that.',
      neonSeahorse: 'Bright. Slow. Holds onto things. I relate.',
      sunburstWrasse: 'Named for the sunrise. Sleeps through it.',
      mantaRay: 'Graceful. Large. Surprisingly cooperative.',
      giantSquid: "Giant. Squid. I really shouldn't have to sell this one.",
      phantomLionfish: 'Mostly there. Sometimes not. Do not ask me where it goes.',
      twilightWhaleShark: 'The biggest thing I stock. Eats the smallest things in the sea.',
      table: 'Flat on top. Fish rest under it. A shelf, essentially. I respect a shelf.',
      midnightTable: 'A table coral for the deep. Same shelf, less light.',
      rainbowCoral: 'Every colour at once. Subtle, it is not.',
      sunfire: 'It does not actually burn. I checked. Twice.',
    },
    packs: 'Need pearls? Conveniently, I sell those too.',
    shortage: 'You appear to be experiencing a pearl shortage.',
    locked: (n) => `Not yet. Come back at level ${n}. I'll be here. I'm always here.`,
    zone: (name) => `That one needs a home in the ${name} first.`,
    done: ['Transaction complete.', 'An excellent addition to your reef.', 'Pleasure doing business.'],
    coralDone: 'Yours. Tap a tile and it will settle in.',
    cancelled: 'Very well.',
    pending: 'Awaiting approval. The pearls will find you.',
    failed: 'The store declined. Not my department.',
    slow: 'The store is slow today. Also not my department.',
    restoreStart: "Let's see what you've already acquired...",
    restoreFound: 'Found it.',
    restoreNone: 'Nothing new.',
    web: 'Pearls are sold in the app. Out here they come from packs and eggs.',
  };
  const skipCounter = buildCounter({
    id: 'counter-skip7', who: 'Skip-7 · Pearl Market',
    face: { id: '_skip7', color: 0x9aa7b3, accentColor: 0x7fe8ff,
      build: makeSkip7, focus: g => g.userData.head, dir: [0.35, 0.3, 1], zoom: 2.6 },
    balances: () => [['💎', Math.floor(pearls)]],
  });
  const { say } = skipCounter;
  const tierTag = (spec, type) => ({
    tag: `${type === 'fish' ? '🐟' : '🪸'} ${TIER_LABEL[spec.tier] ?? spec.tier}`,
    tagColor: hex(COLORS[`tier_${spec.tier}`] ?? 0xb0bec5),
  });
  {
    const fishShelf = skipCounter.shelf('Specimens', 'so rare they can\'t be hatched');
    fishSpecs.filter(s => s.pearlCost && !s.eventId).sort(byUnlock).forEach(spec =>
      skipCounter.card(fishShelf, { key: spec.id, img: null, name: spec.name, ...tierTag(spec, 'fish'),
        say: SKIP7.lines[spec.id] ?? `${spec.name}. ${TIER_LABEL[spec.tier] ?? ''}. Reasonably priced.`,
        buttons: [{ label: '', onClick: () => buyFromCounter(spec, 'fish') }] }).spec = spec);
    const coralShelf = skipCounter.shelf('Corals', 'placed free once bought');
    coralSpecs.filter(s => s.pearlCost && !s.eventId).sort(byUnlock).forEach(spec =>
      skipCounter.card(coralShelf, { key: spec.id, img: null, name: spec.name, ...tierTag(spec, 'coral'),
        say: SKIP7.lines[spec.id] ?? `${spec.name}. ${TIER_LABEL[spec.tier] ?? ''}. Reasonably priced.`,
        buttons: [{ label: '', onClick: () => buyFromCounter(spec, 'coral') }] }).spec = spec);
  }
  const packShelf = skipCounter.shelf('Pearls', 'support the reef', SKIP7.packs);
  const shopList = document.createElement('div');
  shopList.className = 'ct-packs';
  const shopNote = document.createElement('div');
  shopNote.className = 'ct-note';
  packShelf.grid.replaceWith(shopList);   // packs are rows, not cards
  skipCounter.body.appendChild(shopNote);

  function refreshCounter() {
    skipCounter.refreshBal();
    for (const it of skipCounter.items) {
      const { spec } = it;
      if (!spec) continue;
      const type = spec.layer ? 'fish' : 'coral';
      const need = Math.max(spec.unlockLevel ?? 1, ZONES[primaryBiome(spec)].unlock);
      const avail = type === 'fish' ? fishAvailable(spec) : coralAvailable(spec);
      it.card.classList.toggle('locked', !avail);
      it.buttons[0].textContent = avail ? `💎 ${spec.pearlCost}` : `🔒 Lv ${need}`;
      if (!it.pic.src) it.pic.src = speciesThumb(spec);
    }
  }
  function openCounter() {
    refreshCounter();
    skipCounter.show(bioNight() ? pickLine(['Business improves when everything glows.', 'The night shift is prettier.', ...SKIP7.greet]) : pickLine(SKIP7.greet));
    if (iapIsNative()) renderShopNative(); else renderShopWeb();
  }
  const closeCounter = () => skipCounter.hide();
  function buyFromCounter(spec, type) {
    const need = Math.max(spec.unlockLevel ?? 1, ZONES[primaryBiome(spec)].unlock);
    if (need > level) { say(SKIP7.locked(need)); return; }
    const avail = type === 'fish' ? fishAvailable(spec) : coralAvailable(spec);
    if (!avail) { say(SKIP7.zone(BIOMES[primaryBiome(spec)].shortName)); return; }
    if (pearls < spec.pearlCost) {
      say(SKIP7.shortage);
      packShelf.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    pearls -= spec.pearlCost;
    hudGain('pearls', -spec.pearlCost);
    if (type === 'fish') {
      packSpawnFish(spec);          // the specimen swims straight into its biome
      say(pickLine(SKIP7.done));
      refreshFishShop(); refreshProgress(); refreshHud(); save();
      refreshCounter();
      if (journal.ov.style.display === 'flex') fillJournal();
    } else {
      // Coral is banked as a free placement and handed to the palette; the
      // counter closes so the reef is right there to tap.
      vouchers[spec.id] = (vouchers[spec.id] ?? 0) + 1;
      refreshLocks(); refreshHud(); save();
      const row = rows.find(r => r.spec === spec && r.type === 'coral');
      if (row) row.btn.onclick();
      closeCounter();
      flash(rateEl, `🎟 ${spec.name} — tap a tile to place it`, '#7fd8b0');
      droneQueue.push(`🤖 Skip-7 says: ${SKIP7.coralDone}`);
    }
  }

  function grantPearls(n) {
    pearls += n; save();      // the payout and its persistence come first, unconditionally
    try {
      refreshHud(); hudGain('pearls', n);
      counters.forEach(c => { if (c.open) c.refreshBal(); });
      droneQueue.push(`💎 ${n} pearls added to the reef fund. Spend them wisely. Or not — I'm not your accountant.`);
    } catch (e) { /* cosmetic only */ }
  }
  function shopRow(label, priceText, onBuy) {
    const row = document.createElement('button');
    row.className = 'shop-pack';
    row.innerHTML = `<span>${label}</span><span>${priceText}</span>`;
    row.onclick = onBuy;
    shopList.appendChild(row);
    return row;
  }
  let shopBusy = false;
  function renderShopWeb() {
    shopList.innerHTML = '';
    shopNote.innerHTML = `${SKIP7.web}<br><a href="https://apps.apple.com/app/id6809200807" target="_blank" rel="noopener">Reef Bloom on the App Store</a>`;
  }
  // Native shop: the rows appear at once with the pearl counts, prices fill in
  // when StoreKit answers. The first product fetch after launch can take
  // seconds (longer in the TestFlight sandbox), so it's also kicked off in the
  // background right after the reef loads — by the time anyone opens the shop
  // it's usually already cached. A slow store gets a retry instead of a wait.
  const SHOP_TIMEOUT_MS = 8000;
  let shopOpenSeq = 0;
  function wireShopRow(row, p) {
    row.onclick = async () => {
      if (shopBusy || row.disabled) return;
      shopBusy = true;
      shopList.querySelectorAll('.shop-pack').forEach(b => { b.disabled = true; });
      shopNote.textContent = '';
      let paid = null;
      try { paid = await iapPurchase(p.id); }
      catch (e) {
        // Not every non-success is a failure: an approval can be pending, and an
        // interrupted purchase (new terms, payment update) finishes later — in
        // both cases the pearls arrive through the transaction listener.
        if (e?.cancelled) { say(SKIP7.cancelled); }
        else if (e?.pending) {
          say(SKIP7.pending);
          shopNote.textContent = 'Waiting for approval. Your pearls will arrive as soon as the purchase is approved.';
        } else {
          say(SKIP7.failed);
          shopNote.textContent = 'The App Store couldn\'t finish that purchase'
            + (e?.reason ? ` (${e.reason})` : '') + '. If it completes later, your pearls are added automatically.';
        }
      }
      shopBusy = false;
      shopList.querySelectorAll('.shop-pack').forEach(b => { b.disabled = false; });
      if (paid !== null) {
        if (paid > 0) grantPearls(paid);   // 0: the update stream already paid it out
        say(pickLine(SKIP7.done));
      }
    };
    row.title = p.title ?? '';
  }
  function restoreLink() {
    const b = document.createElement('button');
    b.className = 'ct-link'; b.textContent = 'Restore purchases';
    b.onclick = async () => {
      if (shopBusy) return;
      say(SKIP7.restoreStart);
      const before = pearls;
      try { await iapRestore(); } catch (e) { /* the listener still hears late transactions */ }
      setTimeout(() => say(pearls > before ? SKIP7.restoreFound : SKIP7.restoreNone), 1200);
    };
    shopNote.insertAdjacentElement('afterend', b);
    return b;
  }
  let restoreBtn = null;
  async function renderShopNative() {
    const seq = ++shopOpenSeq;
    shopList.innerHTML = '';
    if (!restoreBtn) restoreBtn = restoreLink();
    const rowsById = new Map();
    // Fast path: StoreKit's last answer is remembered, so real prices are on
    // screen and tappable the instant the shop opens; a fresh fetch then
    // updates them in place without any waiting state.
    const remembered = iapCachedProducts();
    if (remembered.length) {
      shopNote.textContent = '';
      remembered.forEach(p => {
        const row = shopRow(`💎 ${p.pearls} pearls`, p.priceString, () => {});
        wireShopRow(row, p);
        rowsById.set(p.id, row);
      });
      if (shopBusy) rowsById.forEach(r => { r.disabled = true; });
      iapLoadProducts().then(fresh => {
        if (seq !== shopOpenSeq || shopBusy) return;
        if (fresh.some(p => !rowsById.has(p.id)) || fresh.length !== rowsById.size) { renderShopNative(); return; }
        for (const p of fresh) {
          rowsById.get(p.id).innerHTML = `<span>💎 ${p.pearls} pearls</span><span>${p.priceString}</span>`;
        }
      }).catch(() => { /* remembered prices stay; buying still goes through StoreKit */ });
      return;
    }
    // First ever open: right pearl counts, prices pending, nothing tappable yet.
    PEARL_PACKS.forEach(p => {
      const row = shopRow(`💎 ${p.pearls} pearls`, '…', () => {});
      row.disabled = true;
      rowsById.set(p.id, row);
    });
    shopNote.textContent = 'Fetching prices from the App Store…';
    let products = null, failure = null;
    try {
      products = await Promise.race([
        iapLoadProducts(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), SHOP_TIMEOUT_MS)),
      ]);
    } catch (e) { failure = e ?? new Error('unknown'); iapResetProducts(); }
    if (seq !== shopOpenSeq) return;   // the shop was reopened meanwhile
    if (failure || !products) {
      // A stall and an outright failure are different problems — say which, and
      // show the store's own reason so a screenshot is enough to diagnose it.
      const slow = failure?.message === 'timeout';
      const why = !slow && failure?.message ? ` (${String(failure.message).slice(0, 120)})` : '';
      say(SKIP7.slow);
      shopNote.textContent = slow ? 'The App Store is slow to answer. ' : `Couldn't reach the App Store${why}. `;
      shopNote.insertAdjacentHTML('beforeend',
        '<button class="m-tab" data-shop-retry style="margin-left:6px">Try again</button>');
      shopNote.querySelector('[data-shop-retry]').onclick = () => renderShopNative();
      return;
    }
    if (!products.length) { shopNote.textContent = 'Pearl packs are not available right now.'; return; }
    shopNote.textContent = '';
    // Fill prices into the rows that exist; drop any pack the store didn't return.
    const byId = new Map(products.map(p => [p.id, p]));
    for (const [id, row] of rowsById) {
      const p = byId.get(id);
      if (!p) { row.remove(); continue; }
      row.innerHTML = `<span>💎 ${p.pearls} pearls</span><span>${p.priceString}</span>`;
      row.disabled = false;
      wireShopRow(row, p);
    }
  }
  // Warm the price cache shortly after launch so the shop opens ready.
  if (iapIsNative()) setTimeout(() => { iapLoadProducts().catch(() => {}); }, 1500);
  // Purchases can also complete OUTSIDE the buy tap — interrupted purchases,
  // approvals, anything finished while the app was closed. Listen for them, and
  // collect pearls banked while only the Home screen was open. Deferred a tick
  // so the saved reef (and its pearl balance) has been restored first.
  if (iapIsNative()) setTimeout(() => {
    const owed = iapTakePending();
    if (owed > 0) grantPearls(owed);
    iapStartListener((n) => grantPearls(n));
  }, 0);
  document.getElementById('shop-btn')?.addEventListener('click', () => openCounter());

  // ── Menus (Journal / Harmony Advisor / Progress — Classic's menus in DOM) ─────
  const openModals = [];
  function buildMenuModal(title, sub) {
    const ov = document.createElement('div');
    ov.className = 'modal3d';
    const p = document.createElement('div');
    p.className = 'panel';
    p.innerHTML = `<div class="m-title">${title}</div>`
      + (sub ? `<div class="m-sub">${sub}</div>` : '');
    const head = document.createElement('div');   // slot for tabs / summary
    const body = document.createElement('div');
    body.className = 'm-body';
    const close = document.createElement('button');
    close.className = 'shop-close'; close.textContent = 'Close';
    close.onclick = () => { ov.style.display = 'none'; };
    p.append(head, body, close);
    ov.appendChild(p);
    ov.onclick = e => { if (e.target === ov) ov.style.display = 'none'; };
    document.body.appendChild(ov);
    openModals.push(ov);
    return { ov, head, body, show() { ov.style.display = 'flex'; } };
  }
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      openModals.forEach(m => { m.style.display = 'none'; });
      counters.forEach(c => c.hide());
    }
  });
  const bar = (v, max, cls = '') =>
    `<div class="m-bar"><span class="${v >= max ? 'full' : cls}"`
    + ` style="width:${clamp((v / max) * 100, 0, 100)}%"></span></div>`;

  // 📖 Ocean Journal — every species, discovered by placing it once (mirrors
  // Classic's journal), with a rendered thumbnail and quick facts per entry.
  const journal = buildMenuModal('📖 Ocean Journal');
  let journalTab = 'all';
  const journalTabs = document.createElement('div');
  journalTabs.className = 'm-tabs';
  [['all', 'All'], ['coral', 'Coral'], ['fish', 'Fish']].forEach(([id, name]) => {
    const b = document.createElement('button');
    b.className = 'm-tab' + (id === journalTab ? ' active' : '');
    b.textContent = name;
    b.onclick = () => {
      journalTab = id;
      journalTabs.querySelectorAll('.m-tab').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      fillJournal();
    };
    journalTabs.appendChild(b);
  });
  journal.head.appendChild(journalTabs);
  // Thumbnails — each recorded species is photographed once: its real 3D model
  // is built, framed by its bounding box, and rendered offscreen. Data URLs are
  // cached, so every later journal open (and fish toast) is free.
  //
  // The photo is taken with the GAME'S OWN renderer into a render target — never
  // a second WebGL context. WebKit caps a page at 16 live contexts and, at the
  // cap, force-loses the OLDEST one: the reef itself. An earlier version made a
  // context per batch of thumbnails, so enough journal opens and first-time fish
  // taps killed the main view — the screen flashed between the page's blue
  // background and the reef as the context died and revived, until iOS gave up
  // on the app. One context, ever.
  const THUMB_PX = 96, THUMB_SS = 2;               // rendered at 2× and downsampled = cheap AA
  let thumbRig = null;
  const thumbCache = new Map();
  function thumbFallback(spec) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = THUMB_PX;
    const ctx = cv.getContext('2d');
    const grd = ctx.createRadialGradient(34, 30, 4, 48, 48, 46);
    grd.addColorStop(0, hex(spec.accentColor ?? spec.color ?? 0x7fb8d4));
    grd.addColorStop(0.62, hex(spec.color ?? 0x2f6f92));
    grd.addColorStop(1, '#06131d');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(48, 48, 40, 0, Math.PI * 2); ctx.fill();
    return cv.toDataURL();
  }
  // A large one-off portrait (dev/marketing: window.__rb3d.portrait(id, px)) —
  // same rig as the thumbnails, its own render target, not cached.
  function speciesPortrait(spec, px = 512) {
    const saved = thumbRig, savedCache = thumbCache.get(spec.id);
    thumbRig = null;                 // force a fresh rig at the requested size
    THUMB_PX_OVERRIDE = px;
    try {
      thumbCache.delete(spec.id);
      const url = speciesThumb(spec);
      thumbCache.delete(spec.id);
      return url;
    } finally {
      THUMB_PX_OVERRIDE = 0;
      thumbRig?.rt.dispose();
      thumbRig = saved;
      if (savedCache) thumbCache.set(spec.id, savedCache);
    }
  }
  let THUMB_PX_OVERRIDE = 0;
  if (window.__rb3d) window.__rb3d.portrait = (id, px) => speciesPortrait(CORAL_SPECIES[id] ?? FISH_SPECIES[id] ?? LOCAL_SPECS[id], px);
  function speciesThumb(spec) {
    if (thumbCache.has(spec.id)) return thumbCache.get(spec.id);
    const PX = THUMB_PX_OVERRIDE || THUMB_PX;
    let g = null;
    const prevTarget = renderer.getRenderTarget();
    const prevColor = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    try {
      if (renderer.getContext().isContextLost()) throw new Error('context lost');
      if (!thumbRig) {
        const n = PX * THUMB_SS;
        const rt = new THREE.WebGLRenderTarget(n, n);
        rt.texture.colorSpace = THREE.SRGBColorSpace;
        const sc = new THREE.Scene();
        sc.add(new THREE.AmbientLight(0xbfdcee, 1.0));
        const key = new THREE.DirectionalLight(0xffffff, 1.7);
        key.position.set(2, 4, 3); sc.add(key);
        const fill = new THREE.DirectionalLight(0x7fb8d4, 0.5);
        fill.position.set(-3, 1, -2); sc.add(fill);
        const big = document.createElement('canvas'); big.width = big.height = n;
        const small = document.createElement('canvas'); small.width = small.height = PX;
        thumbRig = { rt, sc, cam: new THREE.PerspectiveCamera(30, 1, 0.05, 100),
          buf: new Uint8Array(n * n * 4), big, small, n };
      }
      const { rt, sc, cam, buf, big, small, n } = thumbRig;
      // A "spec" can also be a portrait request — { id, build, focus?, dir?, zoom? }
      // — used for Skip-7's face on the Pearl Market counter.
      g = spec.build ? spec.build() : spec.layer ? makeFish(spec) : makeCoral(spec);
      if (!spec.layer && !spec.build) g.scale.setScalar(1);   // corals spawn at 0.01 to grow in
      sc.add(g);
      g.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(spec.focus ? spec.focus(g) : g);
      const c = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const dist = (maxDim / 2) / Math.tan((cam.fov * Math.PI) / 360) * (spec.zoom ?? 1.2);
      const dir = spec.dir ? new THREE.Vector3(...spec.dir)
        : spec.layer
          ? new THREE.Vector3(1, 0.35, 0.55)     // fish: 3/4 side profile
          : new THREE.Vector3(1, 0.6, 1);        // coral: from above the shoulder
      cam.position.copy(c).addScaledVector(dir.normalize(), dist);
      cam.lookAt(c);
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(sc, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, n, n, buf);
      // GL rows run bottom-up; flip into a 2D canvas, then downsample.
      const bctx = big.getContext('2d');
      const img = bctx.createImageData(n, n);
      for (let y = 0; y < n; y++) {
        img.data.set(buf.subarray((n - 1 - y) * n * 4, (n - y) * n * 4), y * n * 4);
      }
      bctx.putImageData(img, 0, 0);
      const sctx = small.getContext('2d');
      sctx.clearRect(0, 0, PX, PX);
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(big, 0, 0, PX, PX);
      const url = small.toDataURL();
      thumbCache.set(spec.id, url);
      return url;
    } catch (e) {
      return thumbFallback(spec);      // never an error banner; try again next time
    } finally {
      renderer.setRenderTarget(prevTarget);
      renderer.setClearColor(prevColor, prevAlpha);
      if (g) { thumbRig?.sc.remove(g); disposeGroup(g); }
    }
  }

  // Quick facts — a field-guide line derived from the spec and behaviour tables.
  function quickFacts(spec) {
    const facts = [];
    if (spec.layer) {
      const s = spec.size ?? 14;
      facts.push('📏 ' + (s <= 12 ? 'Tiny' : s <= 17 ? 'Small'
        : s <= 24 ? 'Medium' : s <= 34 ? 'Large' : 'Huge'));
      facts.push(spec.nocturnal ? '🌙 Nocturnal'
        : DAY_HIDER_SPECIES.has(spec.id) ? '🌙 Hides by day' : '☀️ Active by day');
      facts.push(SCHOOL_SPECIES.has(spec.id) ? '🐟 Schools'
        : BENTHIC_SPECIES.has(spec.id) ? '🦀 Bottom-dweller'
        : roamProfile(spec) ? '🧭 Wide roamer' : '🌀 Keeps a home patch');
      if (BIOLUM_SPECIES.has(spec.id)) facts.push('✨ Glows at night');
      if ((spec.speed ?? 1) >= 1.3) facts.push('💨 Quick swimmer');
    } else {
      facts.push(spec.tall ? '⬆️ Grows tall' : '🪨 Low mound');
      if (spec.shelter) {
        facts.push(spec.homeFor === 'A' ? '🏠 Shelters small fish'
          : '🏠 Day-roost for nocturnals');
      } else facts.push('🪸 Habitat builder');
    }
    if (spec.eventId) facts.push('🎉 Event exclusive');
    return facts;
  }

  // A journal entry: rendered thumbnail + name, quick facts and field notes
  // once the species has been recorded, biome icons and a tier badge.
  function journalRow(spec) {
    const found = seen.has(spec.id);
    const need = Math.max(spec.unlockLevel ?? 1, ZONES[primaryBiome(spec)].unlock);
    const tierCol = hex(COLORS[`tier_${spec.tier}`] ?? 0xb0bec5);
    const badge = `<span style="font-size:9px;letter-spacing:1px;color:${tierCol};`
      + `border:1px solid ${tierCol};border-radius:4px;padding:1px 4px">`
      + `${TIER_LABEL[spec.tier] ?? '?'}</span>`;
    const thumb = found
      ? `<img class="j-thumb" src="${speciesThumb(spec)}" alt="">`
      : '<span class="j-thumb mystery">?</span>';
    const sci = found && spec.scientific
      ? ` <i style="color:#9fc4dc;font-weight:400">${spec.scientific}</i>` : '';
    const facts = found
      ? `<span class="j-facts">${quickFacts(spec)
          .map(f => `<span class="j-fact">${f}</span>`).join('')}</span>` : '';
    const note = found
      ? (SPECIES_LORE[spec.id] ?? spec.lore ?? 'A specimen of the reef.')
      : need > level ? `🔒 Unlocks at Lv${need}.` : 'Place one to record it.';
    return `<div class="m-row${found ? '' : ' locked'}" data-sp="${spec.id}"`
      + ` style="align-items:flex-start;cursor:pointer">`
      + thumb
      + `<span style="flex:1;min-width:0">${found ? spec.name : '???'}${sci}${facts}`
      + `<span style="display:block;font-size:10.5px;line-height:1.35;color:#8fb4c9">${note}</span></span>`
      + `<small style="margin-top:2px" title="${isRealSpecies(spec.id) ? 'Real species' : 'Reef Bloom original'}">`
      + `${isRealSpecies(spec.id) ? '🌍' : '✨'} ${biomeIcons(spec)} ${badge}</small></div>`;
  }
  function fillJournal() {
    const cs = [...coralSpecs, ...Object.values(LOCAL_SPECS)], fs = fishSpecs;
    const all = [...cs, ...fs];
    const found = all.filter(s => seen.has(s.id)).length;
    journal.ov.querySelector('.m-sub')?.remove();
    journal.ov.querySelector('.m-title').insertAdjacentHTML('afterend',
      `<div class="m-sub">${found} of ${all.length} species recorded${bar(found, all.length)}</div>`);
    const group = (specs, label) => ['coral', 'seagrass', 'deepTwilight'].map(zid => {
      const here = specs.filter(s => primaryBiome(s) === zid);
      return here.length
        ? `<div class="m-sec">${label} · ${BIOMES[zid].icon} ${BIOMES[zid].name}</div>`
          + here.map(journalRow).join('')
        : '';
    }).join('');
    let html = '<div class="m-sec">🔬 Research surveys</div>'
      + '<div class="m-row"><span>Bubbles finds new coral on expeditions — fund one at her nest.</span>'
      + '<button class="pack-open-btn" data-nest>Nest &amp; Market</button></div>';
    const quizDone = quiz.date === EV_TODAY() && quiz.i >= 5;
    html += '<div class="m-sec">🧪 Field ID — real or fiction?</div>'
      + '<div class="m-row"><span>Which of your species truly exist?<br>'
      + '<span style="font-size:10.5px;color:#9fc4dc">+4 🪸 per correct · +1 💎 for a perfect day</span></span>'
      + `<button class="pack-open-btn" data-quiz${quizDone ? ' disabled' : ''}>`
      + `${quizDone ? `${quiz.score}/5 today` : 'Take the quiz'}</button></div>`;
    if (journalTab !== 'fish') html += group(cs, 'Coral');
    if (journalTab !== 'coral') html += group(fs, 'Fish');
    // Event exclusives — recorded ones get full entries; the rest stay a mystery.
    const excl = [
      ...Object.values(CORAL_SPECIES).filter(s => s.eventId && s.color != null),
      ...Object.values(FISH_SPECIES).filter(s => s.eventId && s.color != null && s.layer),
    ];
    if (excl.length) {
      const owned = excl.filter(s => seen.has(s.id));
      const hidden = excl.length - owned.length;
      html += '<div class="m-sec">Event exclusives · 🎉</div>' + owned.map(journalRow).join('');
      if (hidden > 0) {
        html += `<div class="m-row locked"><span class="j-thumb mystery">?</span>`
          + `<span style="flex:1;min-width:0">???`
          + `<span style="display:block;font-size:10.5px;line-height:1.35;color:#8fb4c9">`
          + `${hidden} event ${hidden === 1 ? 'species remains' : 'species remain'} hidden — `
          + `earn ${hidden === 1 ? 'it' : 'them'} in seasonal events.</span></span></div>`;
      }
    }
    journal.body.innerHTML = html;
  }

  // ⚖ Harmony Advisor — the live score broken into Classic's terms, plus tips.
  const advisor = buildMenuModal('⚖ Harmony Advisor');
  function fillAdvisor() {
    const coralTypes = new Set(placedCorals.map(c => c.id)).size;
    const fishCount = placedFish.length;
    const fishTypes = new Set(placedFish.map(f => f.id)).size;
    let A = 0, B = 0;
    for (const f of placedFish) {
      const ly = FISH_SPECIES[f.id]?.layer;
      if (ly === 'A') A++; else if (ly === 'B') B++;
    }
    const pVariety = Math.min(coralTypes * 8, 40);
    const pFish = Math.min(fishCount * 5, 20);
    const pFishTypes = Math.min(fishTypes * 5, 10);
    const pLayers = (A > 0 && B > 0) ? 15 : (A > 0 || B > 0) ? 7 : 0;
    const pBalance = fishCount > 0 && placedCorals.length > 0
      ? Math.round((Math.min(fishCount, placedCorals.length)
        / Math.max(fishCount, placedCorals.length)) * 15) : 0;
    advisor.ov.querySelector('.m-sub')?.remove();
    advisor.ov.querySelector('.m-title').insertAdjacentHTML('afterend',
      `<div class="m-sub">Current harmony: ${Math.round(harmony)} / 100</div>`);
    const line = (name, v, max) => `<div class="m-row" style="border:none;padding-bottom:0">`
      + `<span>${name}</span><small>${v} / ${max}</small></div>${bar(v, max)}`;
    const tips = [];
    if (coralTypes < 5) tips.push('Plant more coral <i>species</i> — each new species is worth +8 harmony, up to 40.');
    if (fishCount < 4) tips.push('Hatch more fish — each is +5 harmony, up to 20.');
    if (fishTypes < 2 && fishCount > 0) tips.push('Vary your fish — each species is +5, up to 10.');
    if (A === 0 || B === 0) tips.push('Keep fish in <i>both</i> water layers (small reef fish + large swimmers) for the full +15.');
    if (fishCount && pBalance < 12) tips.push('Balance the reef — harmony peaks when fish and coral counts are close.');
    if (level >= ZONES.seagrass.unlock && !placedCorals.some(e => e.b === 'seagrass')) {
      tips.push('The 🌿 Seagrass Basin is unlocked and empty — its species only grow there.');
    }
    if (level >= ZONES.deepTwilight.unlock && !placedCorals.some(e => e.b === 'deepTwilight')) {
      tips.push('The 🌌 Deep Twilight shelf is unlocked and empty — bioluminescent species await.');
    }
    if (placedFish.length >= 3 && !placedStations.length && level >= STATION_SPEC.unlockLevel) {
      tips.push('Your fish have nowhere to get cleaned — place a Cleaning Station (utility section) and staff it with a cleaner fish.');
    }
    if (placedStations.length && !placedFish.some(f => FISH_SPECIES[f.id]?.cleaner)) {
      tips.push('Your Cleaning Station has no staff — hatch a cleaner (Cleaner Wrasse, Cleaner Shrimp, or Glow Cleaner Goby).');
    }
    if (!tips.length) tips.push('The reef is thriving. Keep growing it to hold the ratchet at 100.');
    advisor.body.innerHTML =
      line('Coral variety', pVariety, 40)
      + line('Fish population', pFish, 20)
      + line('Fish variety', pFishTypes, 10)
      + line('Water layers', pLayers, 15)
      + line('Fish ⇄ coral balance', pBalance, 15)
      + '<div class="m-sec">How to improve</div>'
      + tips.map(t => `<div class="m-row" style="border:none">• <span>${t}</span></div>`).join('');
  }

  // ⭐ Progress — next-level milestones and biome unlocks (Classic's level panel).
  const progress = buildMenuModal('⭐ Reef Progress');
  function fillProgress() {
    progress.ov.querySelector('.m-sub')?.remove();
    progress.ov.querySelector('.m-title').insertAdjacentHTML('afterend',
      `<div class="m-sub">Level ${level}${level >= MAX_LEVEL ? ' — the reef is fully grown' : ` — next: Lv${level + 1}`}</div>`);
    let html = '';
    if (level < MAX_LEVEL) {
      const [c, f, h] = LEVEL_REQS[level + 1];
      const line = (name, v, max) => `<div class="m-row" style="border:none;padding-bottom:0">`
        + `<span>${name}</span><small>${Math.min(Math.floor(v), max)} / ${max}</small></div>${bar(v, max)}`;
      html += `<div class="m-sec">To reach level ${level + 1}</div>`
        + line('Corals placed', placedCorals.length, c);
      if (f > 0) html += line('Fish hatched', placedFish.length, f);
      if (h > 0) html += line('Harmony', harmony, h);
      if (level === 1) html += line('🎓 Reef Orientation', tutDone ? 1 : 0, 1);
    }
    html += '<div class="m-sec">Biomes</div>';
    for (const zid of ['coral', 'seagrass', 'deepTwilight']) {
      const b = BIOMES[zid], zn = ZONES[zid];
      const open = zoneUnlocked(zid);
      const placedHere = placedCorals.filter(e => (e.b ?? 'coral') === zid).length;
      html += `<div class="m-row${open ? '' : ' locked'}">`
        + `<span>${b.icon} ${b.name}</span>`
        + `<small>${open ? `${placedHere} corals` : `🔒 unlocks at Lv${zn.unlock}`}</small></div>`;
    }
    progress.body.innerHTML = html;
  }

  // 💾 Slot select — three independent reefs with a summary of each.
  const slotsMenu = buildMenuModal('💾 Reef Slots',
    'Three independent reefs — switching saves this one first.');
  function fillSlots() {
    slotsMenu.body.innerHTML = '';
    for (const s of SLOTS) {
      let info = null;
      try { info = JSON.parse(localStorage.getItem(slotKey(s))); } catch (e) { /* corrupt — treat as empty */ }
      const active = s === slot;
      const row = document.createElement('button');
      row.className = 'shop-pack';
      if (active) row.style.borderColor = '#7fd8ff';
      const summary = active
        ? `Lv${level} · ${Math.floor(be)} 🫧 · ${placedCorals.length} 🪸 · ${placedFish.length} 🐠`
        : info
          ? `Lv${info.level ?? 1} · ${Math.floor(info.be ?? 0)} 🫧 · ${(info.corals ?? []).length} 🪸 · ${(info.fish ?? []).length} 🐠`
          : 'empty — start fresh';
      row.innerHTML = `<span>${active ? '▶ ' : ''}Slot ${s}</span><span>${summary}</span>`;
      row.onclick = () => {
        if (s === slot) { slotsMenu.ov.style.display = 'none'; return; }
        save();                              // persist current slot
        localStorage.setItem(SLOT_KEY, s);
        location.reload();                   // clean teardown → reload into the new slot
      };
      slotsMenu.body.appendChild(row);
      if (info && !active) {
        const clr = document.createElement('button');
        clr.className = 'shop-close';
        clr.style.cssText = 'margin:0 0 6px;text-align:right;color:#ffb4ac;';
        clr.textContent = `✕ Erase slot ${s}`;
        clr.onclick = () => {
          if (confirm(`Erase the reef in slot ${s}? This can't be undone.`)) {
            localStorage.removeItem(slotKey(s));
            cloudMarkWritten(slotKey(s), true);
            fillSlots();
          }
        };
        slotsMenu.body.appendChild(clr);
      }
    }
  }

  // 🪸 Coral upgrade modal (Classic's CoralUpgradeModal) — opens on coral tap.
  const upgrade = buildMenuModal('Coral');
  let upgradeTarget = null;
  function fillUpgrade() {
    const g = upgradeTarget;
    if (!g || !g.userData.entry) { upgrade.ov.style.display = 'none'; return; }
    const e = g.userData.entry, spec = g.userData.spec;
    const bio = BIOMES[e.b ?? 'coral'];
    upgrade.ov.querySelector('.m-title').textContent = spec.name;
    upgrade.ov.querySelector('.m-sub')?.remove();
    upgrade.ov.querySelector('.m-title').insertAdjacentHTML('afterend',
      `<div class="m-sub">${bio.icon} ${bio.name}`
      + `${spec.scientific ? ` · <i>${spec.scientific}</i>` : ''}</div>`);
    const max = e.level >= CORAL_MAX_LEVEL;
    const basePerTick = spec.utility ? 0 : (BE_PER_TICK[spec.tier] ?? 1);
    const rate = s => basePerTick * stageOutput(s) / TICK_SEC;
    const cost = upgradeCost(e.level + 1);   // polyps
    const refund = (spec.pearlCost || spec.utility) ? 0
      : Math.floor((CORAL_COST[spec.tier] ?? 0) / 2);
    let html = `<div class="m-row" style="border:none;padding-bottom:0"><span>Growth</span>`
      + `<small>${STAGE_NAMES[e.level]} · ${e.level} / ${CORAL_MAX_LEVEL}</small></div>`
      + bar(e.level, CORAL_MAX_LEVEL);
    if (!max && !spec.utility && e.g) {
      html += `<div class="m-row"><span>Next stage</span>`
        + `<small>${STAGE_NAMES[e.level + 1]} in ${fmtMs(e.g - Date.now())}</small></div>`;
    }
    html += spec.utility
      ? '<div class="m-row"><span>Utility coral</span><small>no BE income</small></div>'
      : `<div class="m-row"><span>Income</span><small>+${rate(e.level).toFixed(1)}/s`
        + `${max ? '' : ` → +${rate(e.level + 1).toFixed(1)}/s`}</small></div>`;
    html += `<div class="m-row"><span>Polyp drip</span>`
      + `<small>+${(POLYP_PER_CORAL_TICK * e.level / TICK_SEC).toFixed(2)}/s</small></div>`;
    upgrade.body.innerHTML = html;
    const up = document.createElement('button');
    up.className = 'shop-pack';
    up.innerHTML = max ? '<span>Full grown</span><span>—</span>'
      : `<span>🌱 Grow now → ${STAGE_NAMES[e.level + 1]}</span><span>${cost} 🪸</span>`;
    up.disabled = max || spec.utility || polyps < cost;
    up.style.opacity = up.disabled ? 0.45 : 1;
    up.onclick = () => { if (!up.disabled) { tryUpgrade(g); fillUpgrade(); } };
    const sell = document.createElement('button');
    sell.className = 'shop-pack';
    sell.innerHTML = `<span>✕ Sell</span><span>${refund > 0 ? `+${refund} 🫧` : 'no refund'}</span>`;
    sell.onclick = () => {
      upgrade.ov.style.display = 'none';
      removeCoralGroup(g);
      upgradeTarget = null;
    };
    upgrade.body.append(up, sell);
  }
  function openUpgrade(g) { upgradeTarget = g; fillUpgrade(); upgrade.show(); tutNote('upgrade'); }

  // Station menu — same modal shell, station-flavoured contents.
  function fillStation(g) {
    const e = g.userData.entry;
    const bio = BIOMES[e.b ?? 'coral'];
    upgrade.ov.querySelector('.m-title').textContent = STATION_SPEC.name;
    upgrade.ov.querySelector('.m-sub')?.remove();
    upgrade.ov.querySelector('.m-title').insertAdjacentHTML('afterend',
      `<div class="m-sub">${bio.icon} ${bio.name} · staffed by cleaner fish</div>`);
    const max = e.level >= STATION_MAX_LEVEL;
    const cost = stationUpgradeCost(e.level);
    upgrade.body.innerHTML =
      `<div class="m-row" style="border:none;padding-bottom:0"><span>Level</span>`
      + `<small>${e.level} / ${STATION_MAX_LEVEL}</small></div>${bar(e.level, STATION_MAX_LEVEL)}`
      + `<div class="m-row"><span>Capacity</span><small>${e.level} fish at once`
      + `${max ? '' : ` → ${e.level + 1}`}</small></div>`
      + `<div class="m-row"><span>Being cleaned now</span>`
      + `<small>${g.userData.clients.length}</small></div>`;
    const up = document.createElement('button');
    up.className = 'shop-pack';
    up.innerHTML = max ? '<span>Max level reached</span><span>—</span>'
      : `<span>⬆ Upgrade to Lv${e.level + 1}</span><span>${cost} 🪸</span>`;
    up.disabled = max || polyps < cost;
    up.style.opacity = up.disabled ? 0.45 : 1;
    up.onclick = () => { if (!up.disabled) { tryUpgradeStation(g); fillStation(g); } };
    const sell = document.createElement('button');
    sell.className = 'shop-pack';
    sell.innerHTML = '<span>✕ Sell</span><span>+15 🪸</span>';
    sell.onclick = () => { upgrade.ov.style.display = 'none'; removeStationGroup(g); };
    upgrade.body.append(up, sell);
  }
  function openStationUpgrade(g) { fillStation(g); upgrade.show(); }

  // ── Seasonal events — Classic's quest sets, tokens, and pass tiers, in 3D ────
  // Progress is per-slot and saved; exclusive unlocks persist forever.
  // Dev builds can pin the calendar (localStorage rb3d_today = 'YYYY-MM-DD') to test any event.
  const EV_TODAY = () => (import.meta.env?.DEV && localStorage.getItem('rb3d_today')) || new Date().toISOString().slice(0, 10);
  function ev3Init() {
    // Events recur yearly; `live` is this year's occurrence with a per-year id,
    // so last year's finished run doesn't mark this year's as already done.
    const live = liveEvent(EV_TODAY());
    if (live && (!ev3 || ev3.id !== live.id)) {
      ev3 = { id: live.id, setIdx: 0, tokens: 0, earned: 0, prog: {},
        setsClaimed: [], tiersClaimed: [], rewardClaimed: false };
    }
    if (ev3 && ev3.earned == null) ev3.earned = ev3.tokens;   // saves from before Events 2.0
  }
  const ev3Def = () => eventById(ev3?.id);
  const ev3Live = () => {
    const d = ev3Def();
    return !!d && EV_TODAY() >= d.startDate && EV_TODAY() <= d.endDate;
  };
  function ev3Record(type, amount = 1) {
    if (!ev3 || !ev3Live() || ev3.setsClaimed.includes(ev3.setIdx)) return;
    const set = ev3Def()?.questSets[ev3.setIdx];
    if (!set) return;
    set.challenges.forEach((c, i) => {
      if (c.type !== type) return;
      ev3.prog[i] = Math.min(c.target, (ev3.prog[i] ?? 0) + amount);
    });
  }
  function ev3Snapshot() {
    if (!ev3 || !ev3Live()) return;
    const set = ev3Def()?.questSets[ev3.setIdx];
    if (!set) return;
    set.challenges.forEach((c, i) => {
      let val = null;
      if (c.type === 'reach_harmony') val = Math.round(harmony);
      if (c.type === 'have_fish') val = placedFish.length;
      if (c.type === 'have_coral') val = placedCorals.length;
      if (val != null) ev3.prog[i] = Math.max(ev3.prog[i] ?? 0, Math.min(c.target, val));
    });
  }
  const ev3SetComplete = () => {
    const set = ev3Def()?.questSets[ev3?.setIdx];
    return !!set && set.challenges.every((c, i) => (ev3.prog[i] ?? 0) >= c.target);
  };
  function ev3GrantTiers() {
    // Milestones pay out on tokens EARNED; species tiers (`shopOnly`) are
    // Classic's direct unlocks — in 3D those live in the Event Shop instead.
    const def = ev3Def();
    if (!def?.pass) return;
    def.pass.tiers.forEach((tier, i) => {
      if (tier.shopOnly || tier.reward?.exclusive) return;
      if (ev3.tiersClaimed.includes(i) || (ev3.earned ?? ev3.tokens) < tier.threshold) return;
      ev3.tiersClaimed.push(i);
      if (tier.reward.be) be = Math.min(be + tier.reward.be, beMax);
      if (tier.reward.pearls) pearls += tier.reward.pearls;
      droneQueue.push(`🎟 Milestone: ${tier.label} for reaching ${tier.threshold} tokens earned.`);
    });
  }
  // Tokens come in two counts: `earned` over the whole event (unlocks shop
  // listings and milestones) and `tokens`, the spendable balance.
  function ev3Earn(n) {
    ev3.tokens += n;
    ev3.earned = (ev3.earned ?? 0) + n;
    ev3GrantTiers();
  }
  function ev3ClaimSet() {
    if (!ev3 || !ev3SetComplete() || ev3.setsClaimed.includes(ev3.setIdx)) return;
    const def = ev3Def();
    ev3.setsClaimed.push(ev3.setIdx);
    ev3Earn(def.questSets[ev3.setIdx].tokenReward ?? 0);
    if (ev3.setIdx + 1 < def.questSets.length) {
      ev3.setIdx++;
      ev3.prog = {};
      ev3Snapshot();
    }
    refreshHud(); save();
  }
  // Event Shop — the event's exclusives, bought with event tokens only, each
  // listing locked until enough tokens have been EARNED. Bought fish swim in
  // at once; bought coral is banked as a free placement. An exclusive stays
  // event-bound: recording it fills the Journal but never the normal market,
  // and every return of the event is a fresh chance to buy more.
  const ev3ShopItems = (def) => (def.shop ?? []).map(it => ({
    ...it, spec: CORAL_SPECIES[it.exclusive] ?? FISH_SPECIES[it.exclusive] ?? null,
  })).filter(it => it.spec);
  const ev3Unlocked = (it) => (ev3?.earned ?? ev3?.tokens ?? 0) >= it.unlockAt;
  function ev3Buy(it) {
    const def = ev3Def();
    if (!ev3 || !def || !ev3Live() || !it?.spec) return false;
    if (!ev3Unlocked(it)) { flash(rateEl, `🔒 unlocks at ${it.unlockAt} 🎟 earned`); return false; }
    if (ev3.tokens < it.cost) { flash(rateEl, `need ${it.cost} 🎟`); return false; }
    ev3.tokens -= it.cost;
    exclOwned.add(it.spec.id);
    if (it.spec.layer) {
      packSpawnFish(it.spec);
      droneQueue.push(`🎉 ${it.spec.name} joins the reef — a ${def.name} exclusive.`);
    } else {
      vouchers[it.spec.id] = (vouchers[it.spec.id] ?? 0) + 1;
      seen.add(it.spec.id);
      refreshLocks();
      rows.find(r => r.spec === it.spec && r.type === 'coral')?.btn.onclick();   // selected, ready to place
      flash(rateEl, `🎟 ${it.spec.name} — tap a tile to place it`, '#7fd8b0');
    }
    refreshExclRows(); refreshProgress(); refreshHud(); save();
    return true;
  }

  // ── Daily quests — Classic's date-seeded trio, in 3D ─────────────────────────
  // Same pool and tiering as Classic (idle-streak skipped: 3D has no idle
  // bonus). Claiming pays the combined reward and adds one event token.
  function dqGenerate() {
    const today = EV_TODAY();
    const tier = Math.min(2, Math.floor((level - 1) / 3));
    let seed = 0;
    for (let i = 0; i < today.length; i++) seed = (seed * 31 + today.charCodeAt(i)) >>> 0;
    const pool = CHALLENGE_POOL.filter(d => d.type !== 'idle_streak');
    const picked = [];
    while (picked.length < 3 && pool.length > 0) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      picked.push(pool.splice(seed % pool.length, 1)[0]);
    }
    return {
      date: today, claimed: false,
      challenges: picked.map(def => ({
        type: def.type,
        label: def.labels[tier].replace('{n}', def.targets[tier]),
        target: def.targets[tier],
        progress: 0,
      })),
      reward: {
        be: picked.reduce((s, d) => s + (d.be?.[tier] ?? 0), 0),
        pearls: picked.reduce((s, d) => s + (d.pearls?.[tier] ?? 0), 0),
      },
    };
  }
  function dqInit() {
    if (!dq || dq.date !== EV_TODAY()) dq = dqGenerate();
  }
  function dqRecord(type, amount = 1) {
    if (!dq || dq.claimed || dq.date !== EV_TODAY()) return;
    for (const c of dq.challenges) {
      if (c.type === type) c.progress = Math.min(c.target, c.progress + amount);
    }
  }
  function dqSnapshot() {
    if (!dq || dq.claimed) return;
    for (const c of dq.challenges) {
      let val = null;
      if (c.type === 'reach_harmony') val = Math.round(harmony);
      if (c.type === 'have_fish') val = placedFish.length;
      if (c.type === 'have_coral') val = placedCorals.length;
      if (val != null) c.progress = Math.max(c.progress, Math.min(c.target, val));
    }
  }
  const dqComplete = () =>
    !!dq && dq.challenges.every(c => c.progress >= c.target);
  function dqClaim() {
    if (!dq || dq.claimed || !dqComplete()) return;
    dq.claimed = true;
    if (dq.reward.be) be = Math.min(be + dq.reward.be, beMax);
    if (dq.reward.pearls) pearls += dq.reward.pearls;
    // Classic parity: each daily claim feeds one bonus event token.
    if (ev3 && ev3Live()) ev3Earn(1);
    flash(rateEl, `+${dq.reward.be} 🫧${dq.reward.pearls ? ` +${dq.reward.pearls} 💎` : ''}`, '#7fd8b0');
    refreshHud(); save();
  }

  // ── Achievements — Classic's milestone goals, tuned for the 3D reef ──────────
  // Auto-unlock with a one-time payout; Bubbles announces each. Breeding and
  // feeding don't exist here, so three 3D milestones stand in for them.
  const ACH3 = [
    { id: 'first_coral', name: 'First Bloom', desc: 'Place your first coral', reward: { be: 50 }, met: () => placedCorals.length >= 1 },
    { id: 'reef_keeper', name: 'Reef Keeper', desc: 'Place 10 coral', reward: { polyps: 15 }, met: () => placedCorals.length >= 10 },
    { id: 'coral_variety', name: 'Coral Connoisseur', desc: 'Place 8 coral species', reward: { pearls: 5 }, met: () => new Set(placedCorals.map(c => c.id)).size >= 8 },
    { id: 'full_house', name: 'Full House', desc: 'Have 10 fish at once', reward: { be: 150 }, met: () => placedFish.length >= 10 },
    { id: 'aquarist', name: 'Aquarist', desc: 'Discover 10 fish species', reward: { pearls: 8 }, met: () => [...seen].filter(id => FISH_SPECIES[id]).length >= 10 },
    { id: 'harmonious', name: 'Harmonious', desc: 'Reach 80 Harmony', reward: { polyps: 20 }, met: () => harmony >= 80 },
    { id: 'thriving', name: 'Thriving Reef', desc: 'Reach 95 Harmony', reward: { pearls: 15 }, met: () => harmony >= 95 },
    { id: 'janitor', name: 'Spotless', desc: 'Build a cleaning station', reward: { be: 80 }, met: () => placedStations.length >= 1 },
    { id: 'collector', name: 'Event Collector', desc: 'Unlock 2 event species', reward: { pearls: 12 }, met: () => exclOwned.size >= 2 },
    { id: 'nightfall', name: 'Night Owl', desc: 'Witness the reef at night', reward: { be: 60 }, met: () => sawNight },
    { id: 'expander', name: 'Homesteader', desc: 'Buy your first grid expansion', reward: { polyps: 20 }, met: () => Object.values(expansions).some(a => a.length > 0) },
    { id: 'deep_roots', name: 'Deep Roots', desc: 'Grow a coral to level 5', reward: { pearls: 10 }, met: () => placedCorals.some(c => (c.level ?? 1) >= 5) },
    { id: 'beachcomber', name: 'Beachcomber', desc: 'Find 3 curiosities beyond the reef', reward: { pearls: 10 }, met: () => eggsClaimed.size >= 3 },
  ];
  function checkAch() {
    for (const a of ACH3) {
      if (achUnlocked.has(a.id) || !a.met()) continue;
      achUnlocked.add(a.id);
      if (a.reward.be) be = Math.min(be + a.reward.be, beMax);
      if (a.reward.polyps) polyps = Math.min(polyps + a.reward.polyps, POLYP_MAX);
      if (a.reward.pearls) pearls += a.reward.pearls;
      const rw = a.reward.be ? `${a.reward.be} 🫧` : a.reward.polyps ? `${a.reward.polyps} 🪸` : `${a.reward.pearls} 💎`;
      flash(rateEl, `🏆 ${a.name} · +${rw}`, '#ffd54f');
      droneQueue.push(`Achievement logged: "${a.name}". ${a.desc}. Reward dispensed. Carry on.`);
      refreshHud(); save();
    }
  }

  function ev3ClaimReward() {
    const def = ev3Def();
    if (!ev3 || !def || ev3.rewardClaimed || ev3.setsClaimed.length < def.questSets.length) return;
    ev3.rewardClaimed = true;
    if (def.reward?.be) be = Math.min(be + def.reward.be, beMax);
    if (def.reward?.pearls) pearls += def.reward.pearls;
    flash(rateEl, `+${def.reward?.be ?? 0} 🫧 +${def.reward?.pearls ?? 0} 💎`, '#ffd54f');
    refreshHud(); save();
  }

  // ── Petting — every family has its own way of saying "again, please" ─────────
  function petFish(f) {
    const id = f.id;
    const nowMs = performance.now();
    if (f.petCd && nowMs < f.petCd) return;
    f.petCd = nowMs + 1200;
    let kind = 'wiggle';
    if (id === 'pufferfish') kind = 'puff';
    else if (['octopus', 'rubyOctopus', 'giantSquid', 'cuttlefish'].includes(id)) kind = 'ink';
    else if (id === 'seaOtter') kind = 'roll';
    f.react = { kind, start: nowMs, until: nowMs + 1500 };
    tutNote('pet');
    heartBurst(f.g.position, 3);
    if (kind === 'ink') inkCloud(f.g.position);
    if (Math.random() < 0.12) droneTrigger('tapped');
  }

  // ── Cleaning assignment — Classic's rhythm, real-time pacing ─────────────────
  // Every beat: cleaners take up post at their nearest station, and each
  // station with a free slot (capacity = level) invites the closest fish that
  // isn't a cleaner, isn't benthic, isn't asleep, and is off cooldown.
  let lastCleanCount = 0;
  const cleanTimer = setInterval(() => {
    const nowMs = performance.now();
    const onDuty = fishes.some(f => FISH_SPECIES[f.id]?.cleaner && !f.home);
    if (stationGroups.length) {
      for (const f of fishes) {
        if (!FISH_SPECIES[f.id]?.cleaner || f.benthic || f.duty) continue;
        let best = null, bd = Infinity;
        for (const s of stationGroups) {
          const d = s.position.distanceToSquared(f.g.position);
          if (d < bd) { bd = d; best = s; }
        }
        if (best) {
          // Clock on: the cleaner loops tight circles around the tendrils.
          f.duty = best;
          f.roam = false;
          f.cx = best.position.x; f.cz = best.position.z;
          f.R = 2.1; f.y = best.position.y + 1.5;
          f.w = (f.w >= 0 ? 1 : -1) * 0.55;
          f.ang = undefined;
        }
      }
    }
    for (const s of stationGroups) {
      s.userData.clients = s.userData.clients.filter(c => fishes.includes(c) && c.clean);
      if (!onDuty || s.userData.clients.length >= s.userData.entry.level) continue;
      let best = null, bd = Infinity;
      for (const f of fishes) {
        const sp = FISH_SPECIES[f.id];
        if (!sp || sp.cleaner || f.benthic || f.home || f.clean) continue;
        if (f.cleanCd && nowMs < f.cleanCd) continue;
        const d = s.position.distanceToSquared(f.g.position);
        if (d < bd) { bd = d; best = f; }
      }
      if (best) {
        best.clean = { s, until: null, slot: s.userData.clients.length };
        s.userData.clients.push(best);
      }
    }
    // Fold the cleaning bonus into harmony only when activity actually changes.
    const active = fishes.reduce((n, f) => n + (f.clean ? 1 : 0), 0);
    if (active !== lastCleanCount) {
      lastCleanCount = active;
      refreshProgress(); refreshHud();
    }
  }, CLEANING_ASSIGN_INTERVAL);

  // 🎉 Events — the seasonal quest sets and pass, mirroring Classic's modal.
  // 🎉 The event, as a counter run by Bubbles: quest sets, milestones and the
  // Event Shop on shelves. Off-season it shows what's next.
  const EVENT_LINES = {
    greet: (def) => [`${def.icon} ${def.name}! ${def.description}`, `Welcome to ${def.name}. Quests earn tokens; tokens buy the specials.`],
    idle: (next, when) => next ? `Nothing on right now. ${next.icon} ${next.name} starts ${when}. I'm already excited. Quietly.` : 'No events on the calendar. Enjoy the quiet.',
    quests: 'Finish a set, claim the tokens. The next set is harder. That\'s how ladders work.',
    milestones: 'Every token you earn counts here, even the ones you\'ve spent.',
    shop: 'Event specials. Tokens only — and each one unlocks once you\'ve earned enough. No shortcuts, not even pearls.',
    claimed: (n) => [`+${n} tokens. Nicely done.`, `${n} tokens, banked. Onward.`],
    locked: (n) => `Not yet — that one opens at ${n} tokens earned.`,
    short: (n) => `You need ${n} tokens for that. Quests, dailies. I believe in you, mostly.`,
    bought: ['Yours. Event-only, remember — nobody else sells these.', 'Sold! A rare one for the Journal.'],
    reward: 'All sets done. Take the bow and the bonus.',
    done: 'Event complete — see you at the next one. 🌊',
  };
  const eventCounter = buildCounter({
    id: 'counter-event', who: 'Bubbles · Events',
    face: { id: '_bubbles', color: 0x8ec5e8, accentColor: 0xffd27f, build: makeDrone, dir: [0.7, 0.35, 1], zoom: 1.15 },
    balances: () => ev3 && ev3Live() ? [['🎟', ev3.tokens], ['earned', ev3.earned ?? ev3.tokens]] : [],
  });
  const evQuestShelf = eventCounter.shelf('Quests', '…', EVENT_LINES.quests);
  const evMileShelf = eventCounter.shelf('Milestones', 'on tokens earned', EVENT_LINES.milestones);
  const evShopShelf = eventCounter.shelf('Event Shop', 'tokens only · unlock by earning', EVENT_LINES.shop);
  let evSig = '';
  function fillEvent() {
    ev3Init(); ev3Snapshot();
    const def = ev3Def();
    const live = !!def && ev3Live();
    eventCounter.el.querySelector('.ct-who').textContent = live ? `Bubbles · ${def.icon} ${def.name}` : 'Bubbles · Events';
    const sig = live ? `${def.id}:${ev3.setIdx}:${ev3.setsClaimed.length}:${ev3.tiersClaimed.length}:${ev3.tokens}:${ev3.earned}:${ev3.rewardClaimed}:${JSON.stringify(ev3.prog)}:${[...exclOwned].length}` : 'off';
    if (sig === evSig) { eventCounter.refreshBal(); return; }
    evSig = sig;
    [evQuestShelf, evMileShelf, evShopShelf].forEach(s => eventCounter.clearShelf(s));
    evQuestShelf.note?.remove(); evQuestShelf.note = null;
    if (!live) {
      const next = nextEvent(EV_TODAY());
      const when = next ? new Date(next.startDate + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : '';
      evQuestShelf.el.querySelector('span').textContent = 'Off season';
      evQuestShelf.el.querySelector('small').textContent = 'events come round every year';
      evMileShelf.el.style.display = 'none'; evShopShelf.el.style.display = 'none';
      if (next) eventCounter.card(evQuestShelf, { key: 'next', icon: next.icon, name: next.name, sub: `${next.description}<br><b>starts ${when}</b>`, say: EVENT_LINES.idle(next, when) });
      eventCounter.refreshBal();
      return;
    }
    evMileShelf.el.style.display = ''; evShopShelf.el.style.display = '';
    const days = Math.max(0, Math.round((new Date(def.endDate + 'T00:00:00') - new Date(EV_TODAY() + 'T00:00:00')) / 864e5));
    evQuestShelf.el.querySelector('span').textContent = 'Quests';
    evQuestShelf.el.querySelector('small').textContent = `${days} day${days === 1 ? '' : 's'} left · set ${Math.min(ev3.setIdx + 1, def.questSets.length)} of ${def.questSets.length}`;
    def.questSets.forEach((set, si) => {
      const claimed = ev3.setsClaimed.includes(si);
      const current = si === ev3.setIdx && !claimed;
      const future = si > ev3.setIdx;
      const lines = set.challenges.map((c, i) => {
        const p = current ? Math.floor(ev3.prog[i] ?? 0) : claimed ? c.target : 0;
        return `${p >= c.target ? '✅' : '▫️'} ${c.label} <b>${Math.min(p, c.target)}/${c.target}</b>`;
      }).join('<br>');
      const it = eventCounter.card(evQuestShelf, { key: `set${si}`, icon: claimed ? '✅' : future ? '🔒' : '🎯', name: set.label,
        tag: `+${set.tokenReward} 🎟`, tagColor: '#ffe9b0', sub: lines,
        say: claimed ? `${set.label}: done and dusted.` : future ? `${set.label} opens after the set before it.` : EVENT_LINES.quests,
        buttons: current ? [{ label: `Claim +${set.tokenReward} 🎟`, disabled: !ev3SetComplete(), onClick: () => {
          const n = set.tokenReward; ev3ClaimSet(); eventCounter.say(pickLine(EVENT_LINES.claimed(n))); fillEvent();
        } }] : [] });
      if (future) it.card.classList.add('locked');
    });
    const allDone = ev3.setsClaimed.length >= def.questSets.length;
    if (allDone) {
      eventCounter.card(evQuestShelf, { key: 'reward', icon: '🏆', name: 'Event reward',
        sub: ev3.rewardClaimed ? EVENT_LINES.done : `+${def.reward?.be ?? 0} 🫧 · +${def.reward?.pearls ?? 0} 💎`,
        say: ev3.rewardClaimed ? EVENT_LINES.done : EVENT_LINES.reward,
        buttons: ev3.rewardClaimed ? [] : [{ label: 'Claim reward', onClick: () => { ev3ClaimReward(); fillEvent(); } }] });
    }
    (def.pass?.tiers ?? []).forEach((tier, i) => {
      if (tier.shopOnly || tier.reward?.exclusive) return;
      const got = ev3.tiersClaimed.includes(i);
      const it = eventCounter.card(evMileShelf, { key: `tier${i}`, icon: got ? '✅' : '🎁', name: tier.label,
        sub: got ? 'claimed' : `at ${tier.threshold} 🎟 earned`, say: EVENT_LINES.milestones });
      if (!got) it.card.classList.add('locked');
    });
    ev3ShopItems(def).forEach((item) => {
      const { spec } = item;
      const unlocked = ev3Unlocked(item);
      const owned = [...placedFish, ...placedCorals].filter(r => r.id === spec.id).length + (vouchers[spec.id] ?? 0);
      const it = eventCounter.card(evShopShelf, { key: `shop:${spec.id}`, img: speciesThumb(spec), name: spec.name,
        ...tierTag(spec, spec.layer ? 'fish' : 'coral'),
        sub: (unlocked ? `${item.cost} 🎟 each` : `🔒 Unlocks at ${item.unlockAt} 🎟 earned<br>Once unlocked: ${item.cost} 🎟`)
          + (owned ? `<br>✓ ${owned} on your reef` : ''),
        say: unlocked ? `${spec.name}. ${item.cost} tokens, as many as you like while the event runs.` : EVENT_LINES.locked(item.unlockAt),
        buttons: [{ label: unlocked ? `🎟 ${item.cost}` : `🔒 ${item.unlockAt} earned`, onClick: () => {
          if (!ev3Unlocked(item)) { eventCounter.say(EVENT_LINES.locked(item.unlockAt)); return; }
          if (ev3.tokens < item.cost) { eventCounter.say(EVENT_LINES.short(item.cost)); return; }
          if (ev3Buy(item)) { eventCounter.say(pickLine(EVENT_LINES.bought)); if (!spec.layer) eventCounter.hide(); }
          fillEvent();
        } }] });
      if (!unlocked) it.card.classList.add('locked');
    });
    eventCounter.refreshBal();
  }
  function openEvent() {
    evSig = '';
    fillEvent();
    const def = ev3Def();
    const next = nextEvent(EV_TODAY());
    const when = next ? new Date(next.startDate + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : '';
    eventCounter.show(def && ev3Live() ? pickLine(EVENT_LINES.greet(def)) : EVENT_LINES.idle(next, when));
  }

  // 📅 Daily quests — three date-seeded challenges, fresh every day.
  const daily = buildMenuModal('📅 Daily Quests');
  function fillDaily() {
    dqInit(); dqSnapshot();
    let html = `<div class="m-sub">${dq.date} — three tasks, one bundle. Resets at midnight.</div>`;
    dq.challenges.forEach(c => {
      const p = Math.floor(c.progress);
      html += `<div class="m-row"><span>${p >= c.target ? '✅' : '▫️'} ${c.label}</span>`
        + `<small>${Math.min(p, c.target)} / ${c.target}</small></div>`;
    });
    html += `<div class="m-row"><span>Reward</span><small>+${dq.reward.be} 🫧`
      + `${dq.reward.pearls ? ` +${dq.reward.pearls} 💎` : ''}`
      + `${ev3 && ev3Live() ? ' +1 🎟' : ''}</small></div>`;
    daily.body.innerHTML = html;
    const claim = document.createElement('button');
    claim.className = 'shop-pack';
    claim.innerHTML = dq.claimed
      ? '<span>✅ Claimed — back tomorrow</span><span>—</span>'
      : `<span>Claim daily reward</span><span>+${dq.reward.be} 🫧</span>`;
    claim.disabled = dq.claimed || !dqComplete();
    claim.style.opacity = claim.disabled ? 0.45 : 1;
    claim.onclick = () => { dqClaim(); fillDaily(); };
    daily.body.append(claim);
  }

  // Species detail popup — tap any Ocean Journal row for the full entry:
  // portrait swatch, facts, wild-abundance status, traits, and field notes.
  // It layers over the journal (created after it, so it paints on top).
  const speciesModal = buildMenuModal('Species');
  const GROWTH_TOTAL_MS = STAGE_MS.reduce((a, b) => a + b, 0);
  const abundanceText = (w) =>
    w >= 2 ? 'Abundant — the ocean is full of them'
      : w >= 1.4 ? 'Common on healthy reefs'
      : w >= 1 ? 'Widespread'
      : w >= 0.7 ? 'Uncommon'
      : w >= 0.45 ? 'Sparse — a lucky find'
      : w > 0.15 ? 'Rare — threatened in the real ocean'
      : 'One of a kind';
  function fillSpecies(spec, kind) {
    const found = seen.has(spec.id);
    const need = Math.max(spec.unlockLevel ?? 1, ZONES[primaryBiome(spec)].unlock);
    const tierCol = hex(COLORS[`tier_${spec.tier}`] ?? 0xb0bec5);
    speciesModal.ov.querySelector('.m-title').textContent = found ? spec.name : '???';
    speciesModal.ov.querySelector('.m-sub')?.remove();
    speciesModal.ov.querySelector('.m-title').insertAdjacentHTML('afterend',
      `<div class="m-sub">${found && spec.scientific ? `<i>${spec.scientific}</i> · ` : ''}`
      + `<span style="color:${tierCol}">${TIER_LABEL[spec.tier] ?? '?'}</span>`
      + ` · ${kind === 'coral' ? '🪸 coral' : '🐟 fish'}</div>`);
    const row = (k, v) => `<div class="m-row"><span>${k}</span><small>${v}</small></div>`;
    const biomes = Object.keys(ZONES).filter(z => matchesBiome(spec, z))
      .map(z => `${BIOMES[z].icon} ${BIOMES[z].shortName}`).join(' · ');
    let html = '<div style="display:flex;align-items:center;gap:12px;margin:6px 0 10px">'
      + `<span style="width:48px;height:48px;border-radius:50%;flex:none;`
      + `background:radial-gradient(circle at 35% 35%, ${hex(spec.accentColor ?? spec.color)} 0%,`
      + ` ${hex(spec.color)} 62%, #06131d 100%)"></span>`
      + `<span style="font-size:11.5px;color:#9fc4dc;line-height:1.4">`
      + (found ? (SPECIES_LORE[spec.id] ?? spec.lore ?? 'A specimen of the reef.')
        : need > level ? `Not yet recorded. 🔒 Unlocks at Lv${need}.`
          : `Not yet recorded — ${kind === 'coral' ? 'place one' : 'hatch one'} to complete this entry.`)
      + '</span></div>';
    html += row('Identity', isRealSpecies(spec.id)
      ? '🌍 Real species — found in Earth’s oceans'
      : '✨ Reef Bloom original — fiction');
    html += row('Home waters', biomes || '—');
    if (kind === 'fish') {
      html += row('Reef layer', BENTHIC_SPECIES.has(spec.id) ? 'Seafloor crawler'
        : spec.layer === 'B' ? 'Open water — big swimmers' : 'Reef shelter — small fish');
    } else if (!spec.utility) {
      html += row('Income (full grown)',
        `+${((BE_PER_TICK[spec.tier] ?? 1) * stageOutput(CORAL_MAX_LEVEL) / TICK_SEC).toFixed(1)}/s 🫧`);
      html += row('Growth', `hatchling → full grown in ${fmtMs(GROWTH_TOTAL_MS)}`);
    }
    if (spec.shelter) html += row('Shelter', `sleeps ${spec.homeCap ?? 6} fish overnight`);
    if (spec.storage) html += row('Storage', `+${spec.storage} 🫧 wallet cap`);
    if (!spec.eventId) {
      if (seedOnly(spec, kind)) {
        const { n, unit } = priceOf(spec, kind);
        html += row('Once recorded', `${n} ${unit} to place`);
        html += row('Seedlings banked', `${vouchers[spec.id] ?? 0}`);
        if (!found) html += row('How to record', '🌱 a seedling find — surveys, foragers, packs, harmony');
      } else {
        const { n, unit } = priceOf(spec, kind);
        if (spec.pearlCost) html += row('Pearl Market', `${n} ${unit} · tap 🤖 Skip-7`);
        else html += row(kind === 'fish' ? 'Fish Shop (once discovered)' : 'Cost', `${n} ${unit}`);
      }
      html += row('In the wild', spec.wildNote ?? abundanceText(wildWeight(spec)));
    } else {
      const evd = eventById(spec.eventId);
      const item = evd?.shop?.find(i => i.exclusive === spec.id);
      html += row('Origin', evd ? `${evd.icon} ${evd.name} exclusive` : '🎉 event exclusive');
      if (item) html += row('Event Shop', `unlocks at ${item.unlockAt} 🎟 earned · ${item.cost} 🎟 each, during the event`);
    }
    const traits = [];
    if (BIOLUM_SPECIES.has(spec.id)) traits.push('✨ lights the water after dark');
    if (DAY_HIDER_SPECIES.has(spec.id)) traits.push('🌙 nocturnal — hides by day');
    if (SCHOOL_SPECIES.has(spec.id)) traits.push('🐟 swims in schools');
    if (spec.chaotic) traits.push('🌀 chaotic');
    if (traits.length) html += row('Traits', traits.join('<br>'));
    const inReef = kind === 'coral'
      ? placedCorals.filter(e => e.id === spec.id).length
      : placedFish.filter(f => f.id === spec.id).length;
    html += row('In your reef', inReef ? `×${inReef}` : 'none yet');
    speciesModal.body.innerHTML = html;
  }
  // 🧪 Field ID quiz modal — one question at a time, feedback with the fact.
  const quizModal = buildMenuModal('🧪 Field ID',
    'Real or fiction? Five species a day from your own journal.'
    + ' +4 🪸 per correct answer, +1 💎 for a perfect day.');
  let quizFeedback = null;   // { right, why } between question and Next
  function fillQuiz() {
    if (quiz.date !== EV_TODAY()) quiz = { date: EV_TODAY(), i: 0, score: 0 };
    const qs = quizQuestions();
    let html = '';
    if (!qs) {
      html = '<div class="m-sub">Record at least three species first — the quiz is'
        + ' written from your own journal.</div>';
    } else if (quizFeedback) {
      html = `<div class="pack-card" style="animation-delay:0s">`
        + `<span class="pc-icon">${quizFeedback.right ? '✅' : '❌'}</span>`
        + `<div><b>${quizFeedback.right ? 'Correct — +4 🪸' : 'Not quite.'}</b><br>`
        + `<small>${quizFeedback.why}</small></div></div>`
        + `<button class="m-tab" data-quiz-next style="margin-top:10px">`
        + `${quiz.i >= 5 ? 'Finish' : 'Next question'}</button>`;
    } else if (quiz.i >= 5) {
      html = `<div class="m-sub">Today's paper is done: <b>${quiz.score} / 5</b>`
        + `${quiz.score === 5 ? ' — perfect! +1 💎 awarded.' : ''}`
        + ' A fresh five arrive tomorrow.</div>';
    } else {
      const q = qs[quiz.i];
      html = `<div class="m-sec">Question ${quiz.i + 1} of 5 · score ${quiz.score}</div>`
        + `<div class="m-row" style="border:none"><span style="font-size:14px">${q.q}</span></div>`
        + '<div style="display:flex;gap:8px;margin-top:8px">'
        + '<button class="pack-open-btn" data-quiz-ans="true" style="flex:1">TRUE</button>'
        + '<button class="pack-open-btn" data-quiz-ans="false" style="flex:1">FALSE</button></div>';
    }
    quizModal.body.innerHTML = html;
  }
  quizModal.body.addEventListener('click', (e) => {
    const nx = e.target.closest('button[data-quiz-next]');
    if (nx) { quizFeedback = null; fillQuiz(); return; }
    const b = e.target.closest('button[data-quiz-ans]');
    if (!b) return;
    const qs = quizQuestions();
    if (!qs || quiz.i >= 5) return;
    const q = qs[quiz.i];
    const right = (b.dataset.quizAns === 'true') === q.a;
    quiz.i++;
    if (right) { quiz.score++; polyps = Math.min(polyps + 4, POLYP_MAX); }
    if (quiz.i >= 5 && quiz.score === 5) {
      pearls += 1;
      flash(rateEl, '🧪 Perfect paper! +1 💎', '#ffd27f');
    }
    quizFeedback = { right, why: q.why };
    refreshHud(); save(); fillQuiz();
  });

  journal.body.addEventListener('click', (e) => {
    const qz = e.target.closest('button[data-quiz]');
    if (qz) { quizFeedback = null; fillQuiz(); quizModal.show(); return; }
    if (e.target.closest('button[data-nest]')) { journal.ov.style.display = 'none'; openNest(); return; }
    const r = e.target.closest('[data-sp]');
    if (!r) return;
    const id = r.dataset.sp;
    const spec = CORAL_SPECIES[id] ?? FISH_SPECIES[id] ?? LOCAL_SPECS[id];
    if (!spec) return;
    fillSpecies(spec, FISH_SPECIES[id] ? 'fish' : 'coral');
    speciesModal.show();
  });

  // 🐟 Fish ID toast — tapping a fish names it at the bottom of the screen for
  // a few seconds (the pet reaction still plays). Tapping the toast opens the
  // species page; coral keeps its full upgrade modal because that's where its
  // actions live, but a fish has nothing to act on — just something to learn.
  const fishToast = document.getElementById('fish-toast');
  let fishToastSpec = null, fishToastTimer = 0;
  function showFishToast(spec) {
    if (!fishToast || !spec) return;
    fishToastSpec = spec;
    const found = seen.has(spec.id);
    const tierCol = hex(COLORS[`tier_${spec.tier}`] ?? 0xb0bec5);
    fishToast.innerHTML = (found
      ? `<img class="ft-thumb" src="${speciesThumb(spec)}" alt="">`
      : '<span class="ft-thumb"></span>')
      + `<span><span class="ft-name">${found ? spec.name : 'Unrecorded fish'}</span><br>`
      + `<span class="ft-sub">${found && spec.scientific ? `<i>${spec.scientific}</i> · ` : ''}`
      + `<span style="color:${tierCol}">${TIER_LABEL[spec.tier] ?? '?'}</span>`
      + `${isRealSpecies(spec.id) ? ' · 🌍 real species' : ''}</span></span>`
      + '<span class="ft-more">Learn more ›</span>';
    fishToast.classList.add('show');
    clearTimeout(fishToastTimer);
    fishToastTimer = setTimeout(hideFishToast, 4500);
  }
  function hideFishToast() {
    clearTimeout(fishToastTimer);
    fishToast?.classList.remove('show');
  }
  fishToast?.addEventListener('click', () => {
    const spec = fishToastSpec;
    hideFishToast();
    if (!spec) return;
    fillSpecies(spec, 'fish');
    speciesModal.show();
  });

  // 🏆 Achievements — milestone list with unlock states and payouts.
  const achModal = buildMenuModal('🏆 Achievements');
  function fillAch() {
    checkAch();
    let html = `<div class="m-sub">${achUnlocked.size} of ${ACH3.length} earned — rewards pay out the moment you qualify.</div>`;
    for (const a of ACH3) {
      const got = achUnlocked.has(a.id);
      const rw = a.reward.be ? `${a.reward.be} 🫧` : a.reward.polyps ? `${a.reward.polyps} 🪸` : `${a.reward.pearls} 💎`;
      html += `<div class="m-row${got ? '' : ' locked'}">`
        + `<span>${got ? '🏆' : '🔒'} <b>${a.name}</b><br><span style="font-size:11px;color:#9fc4dc">${a.desc}</span></span>`
        + `<small>+${rw}</small></div>`;
    }
    achModal.body.innerHTML = html;
  }

  // 🎁 Packs — Rarity Packs from level-ups, Season Packs from event passes.
  // Every roll's odds are published right here, in plain numbers.
  const packModal = buildMenuModal('🎁 Packs',
    'Packs cost 🫧 only — never pearls, never real money — and MYTHIC packs are never sold.'
    + ' All odds published below.');
  function fillPack() {
    const feat = featuredFish();
    let html = '';
    if (feat) {
      html += `<div class="m-sub">⭐ Featured this week: <b>${feat.name}</b>`
        + ` (${TIER_LABEL[feat.tier]}) — takes a fixed 25% of the fish roll in`
        + ` ${TIER_LABEL[feat.tier]} packs.</div>`;
    }
    const dailyOpen = dailyPackDate !== EV_TODAY();
    html += '<div class="m-sec">🌅 Daily Pack — free, once a day</div>'
      + '<div class="m-row"><span>Riches, a seedling from your recorded coral, an egg for the nest<br>'
      + '<span style="font-size:10.5px;color:#9fc4dc">60%: 20–50 🫧 / 40%: 5–12 🪸'
      + ' · 🌱 wild-abundance seedling · 🥚 60/25/15 common/uncommon/rare</span></span>'
      + (dailyOpen
        ? '<button class="pack-open-btn" data-pack="daily">Open</button>'
        : '<small>tomorrow 🌅</small>')
      + '</div>';
    if (packs.starter > 0) {
      html += '<div class="m-sec">Welcome gift</div>'
        + `<div class="m-row"><span><b>STARTER</b> ×${packs.starter}<br>`
        + '<span style="font-size:10.5px;color:#9fc4dc">Guaranteed, no rolls: three Starter'
        + ' Coral seedlings 🎟, a Blue and a Green Chromis, and a Clownfish</span></span>'
        + '<button class="pack-open-btn" data-pack="starter">Open</button></div>';
    }
    html += '<div class="m-sec">Rarity Packs — buy with 🫧, or earn free at level-ups</div>';
    for (const tier of PACK_TIERS) {
      const n = packs[tier] ?? 0;
      const R = PACK_RICHES[tier];
      const fp = packFishPool(tier);
      const price = PACK_PRICE[tier];
      const priceTag = price ? (price.be ? `${price.be} 🫧` : `${price.pearls} 💎`) : null;
      const stocked = fp.length > 0;
      let actions = n ? `<button class="pack-open-btn" data-pack="${tier}">Open</button>` : '';
      if (priceTag) {
        actions += `<button class="pack-open-btn" data-pack-buy="${tier}"`
          + `${stocked ? '' : ' disabled'}>Buy ${priceTag}</button>`;
      } else if (!n) {
        actions = '<small>never sold — Lv 12+ level-ups only</small>';
      }
      html += `<div class="m-row${(n || priceTag) && stocked ? '' : ' locked'}">`
        + `<span><b>${TIER_LABEL[tier]}</b>${n ? ` ×${n}` : ''}<br>`
        + `<span style="font-size:10.5px;color:#9fc4dc">`
        + `60%: ${R.be[0]}–${R.be[1]} 🫧 / 40%: ${R.pearls[0]}–${R.pearls[1]} 💎`
        + ` · a free ${TIER_LABEL[tier]} coral 🎟 · `
        + (stocked
          ? `guaranteed fish (${fp.length} species, wild-abundance odds)`
          : 'no fish in your unlocked waters yet — levels and biomes stock this pack')
        + '</span></span>'
        + `<span style="display:flex;gap:6px;flex:none;margin-left:auto">${actions}</span>`
        + '</div>';
    }
    if (seasonPacks.length) {
      html += '<div class="m-sec">Season Packs</div>';
      seasonPacks.forEach((id, i) => {
        const def = eventById(id);
        html += `<div class="m-row"><span>${def?.icon ?? '🎁'} <b>${def?.name ?? id}</b><br>`
          + '<span style="font-size:10.5px;color:#9fc4dc">'
          + 'Guarantees one event exclusive you don\'t own — even odds among the unowned'
          + '</span></span>'
          + `<button class="pack-open-btn" data-pack="season" data-idx="${i}">Open</button></div>`;
      });
    }
    html += '<div class="m-sub" style="margin-top:10px">Every level-up also mints a free'
      + ' pack, its tier climbing with your level — and MYTHIC packs are never sold:'
      + ' they mint only at level 12 and every level beyond, so the top of the ladder'
      + ' stays skill-gated. Season Packs come only from event pass tiers. Within a'
      + ' tier, species odds follow real-ocean abundance: commoner creatures roll more'
      + ' often, endangered ones stay rare here too.</div>';
    if (packConfirmSkipped()) {
      html += '<div class="m-sub" style="margin-top:8px;display:flex;align-items:center;gap:8px">'
        + 'Packs buy without asking. '
        + '<button class="m-tab" data-pack="askagain">Ask before buying</button></div>';
    }
    packModal.body.innerHTML = html;
  }
  function showPackReveal(cards) {
    packModal.body.innerHTML = cards.map((c, i) => {
      const d = 0.15 + i * 0.55;
      return `<div class="pack-card" style="animation-delay:${d.toFixed(2)}s">`
        + `<span class="pc-icon">${c.icon}</span>`
        + `<div><b>${c.title}</b><br><small>${c.sub}</small></div>`
        + `<span class="pc-added" style="animation-delay:${(d + 0.4).toFixed(2)}s">`
        + `${c.added ?? '✓ added'}</span></div>`;
    }).join('')
      + '<button class="m-tab" data-pack="back" style="margin-top:10px">← Back to packs</button>';
    // The HUD chip pops the moment its card lands, so the number ticking up
    // and the card saying so read as one event.
    cards.forEach((c, i) => {
      if (!c.gain) return;
      const [key, amt] = Object.entries(c.gain)[0];
      setTimeout(() => hudGain(key, amt), (0.15 + i * 0.55 + 0.3) * 1000);
    });
  }
  // Buying asks first — the price leaves the HUD in one tap, which is easy to
  // miss — unless the player has ticked "don't ask again" (a device preference,
  // not part of the save). The Packs footer offers the way back.
  const PACK_CONFIRM_KEY = 'rb3d_pack_confirm';
  const packConfirmSkipped = () => {
    try { return localStorage.getItem(PACK_CONFIRM_KEY) === 'skip'; } catch (e) { return false; }
  };
  const setPackConfirm = (skip) => {
    try { localStorage.setItem(PACK_CONFIRM_KEY, skip ? 'skip' : 'ask'); } catch (e) { /* ignore */ }
  };
  function showBuyConfirm(tier) {
    const price = PACK_PRICE[tier];
    if (!price) return;
    const cost = price.be ?? price.pearls;
    const cur = price.be ? '🫧' : '💎';
    const have = Math.floor(price.be ? be : pearls);
    const lbl = TIER_LABEL[tier] ?? tier;
    const short = have < cost;
    packModal.body.innerHTML = '<div class="pack-confirm">'
      + `<div class="m-sec">Buy a ${lbl} pack?</div>`
      + `<div class="pc-cost">−${cost} ${cur}</div>`
      + (short
        ? `<div class="pc-after">You have ${have} ${cur} — ${cost - have} ${cur} short.</div>`
        : `<div class="pc-after">You have ${have} ${cur} → <b>${have - cost} ${cur}</b> after.</div>`)
      + `<div class="m-sub" style="margin-top:8px">It opens right away: riches, a free ${lbl}`
      + ` coral 🎟, and a guaranteed ${lbl} fish.</div>`
      + '<label class="pc-auto"><input type="checkbox" data-pack-autoconfirm> Don\'t ask again</label>'
      + '<div class="pc-actions">'
      + `<button class="pack-open-btn" data-pack-confirm="${tier}"${short ? ' disabled' : ''}>`
      + `Buy for ${cost} ${cur}</button>`
      + '<button class="m-tab" data-pack="back">Cancel</button></div></div>';
  }
  function buyPackNow(tier) {
    const price = PACK_PRICE[tier];
    const cards = buyRarityPack(tier);
    if (!cards) return;
    if (price?.be) hudGain('be', -price.be); else if (price?.pearls) hudGain('pearls', -price.pearls);
    showPackReveal(cards);
  }
  packModal.body.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-pack], button[data-pack-buy], button[data-pack-confirm]');
    if (!b) return;
    if (b.dataset.packBuy) {
      if (packConfirmSkipped()) buyPackNow(b.dataset.packBuy);
      else showBuyConfirm(b.dataset.packBuy);
      return;
    }
    if (b.dataset.packConfirm) {
      const auto = packModal.body.querySelector('[data-pack-autoconfirm]');
      if (auto?.checked) setPackConfirm(true);
      buyPackNow(b.dataset.packConfirm);
      return;
    }
    if (b.dataset.pack === 'back') { fillPack(); return; }
    if (b.dataset.pack === 'askagain') { setPackConfirm(false); fillPack(); return; }
    const cards = b.dataset.pack === 'season'
      ? openSeasonPack(Number(b.dataset.idx))
      : b.dataset.pack === 'starter'
        ? openStarterPack()
        : b.dataset.pack === 'daily'
          ? openDailyPack()
          : openRarityPack(b.dataset.pack);
    if (cards) showPackReveal(cards);
  });

  // 🥚 Bubbles' Nest & Market — a counter screen (see buildCounter) with three
  // shelves: the eggs warming in the nest (live countdowns, pearl speed-ups),
  // the egg market, and the research surveys Bubbles flies. Fish are never
  // bought outright here: the Market sells rarity-by-rarity eggs that hatch
  // after a real incubation time into a random fish of the egg's tier (odds
  // shown on the card). The Mythic Egg is the one pearl egg, and it hatches
  // exactly the species you choose — pearls buy a choice, never a roll.
  const BUBBLES = {
    greet: ["Hi! The nest is warm and I'm mostly awake.", 'Welcome to the nest. Mind the eggs.',
      'Eggs, expeditions, and me. What more could a reef need?', 'Back so soon? The eggs missed you. I assume.'],
    eggs: {
      common: "A Common Egg. Don't let the name fool you — every reef starts here.",
      uncommon: 'Uncommon. A little more colour, a little more waiting.',
      rare: 'A Rare Egg. Six minutes of suspense. I count every one.',
      superRare: 'Super Rare. Fifteen minutes. Worth it. Usually.',
      epic: 'An Epic Egg. Half an hour of warmth for something with real presence.',
      legendary: 'Legendary. Forty-five minutes. The big ones take their time.',
      mythic: 'A Mythic Egg. You choose what hatches. No surprises — I checked.',
    },
    incubating: ['Warm. Warmer. Almost.', 'Shh. Something in there is dreaming.', 'It wobbles more as it gets close. So do I.'],
    nestEmpty: 'The nest is empty. Pick an egg below and I\'ll keep it warm.',
    rush: 'Impatient? Pearls make the clock run faster. Don\'t tell the eggs.',
    market: 'Rarity by rarity. Within a tier, the common fish come up more — just like out there.',
    surveys: "Send me out and I'll come back with coral you've never seen. Probably.",
    biome: {
      coral: 'The reef. Busy, bright, full of things to record.',
      seagrass: 'The meadows. Quiet. I like quiet.',
      deepTwilight: 'The deep. Dark and strange and wonderful. I am the light.',
    },
    away: (eta, name) => `I'm out there right now — well, most of me. Charting the ${name}. Back in ${eta}.`,
    bought: ['Nestled in. Now we wait.', 'Warm and waiting.', 'In it goes. Don\'t tap the shell.'],
    noBE: 'Not enough bubbles. The coral will make more — they always do.',
    noPearls: (n) => `That one needs ${n} pearls. Skip-7 sells those, if you ask nicely.`,
    full: 'Four eggs is all the nest holds. Even I have limits.',
    noPool: 'Nothing of that rarity swims your waters yet. New biomes stock new eggs.',
    pickOne: 'Choose which species first. It\'s your 50 pearls.',
    rushed: 'And… hatched! Pearls well spent. Probably.',
    funded: (name) => `On my way! Charting the ${name}. Back with something new.`,
    nothingLeft: "Nothing left to find there. You've recorded it all. Show-off.",
    noPolyps: 'Surveys run on polyps. Upgrade a coral or two and come back.',
    busy: "One expedition at a time — I've only got the one propeller.",
  };
  const bubblesCounter = buildCounter({
    id: 'counter-bubbles', who: 'Bubbles · Nest & Market',
    face: { id: '_bubbles', color: 0x8ec5e8, accentColor: 0xffd27f,
      build: makeDrone, dir: [0.7, 0.35, 1], zoom: 1.15 },
    balances: () => [['🫧', Math.floor(be)], ['🪸', Math.floor(polyps)], ['💎', Math.floor(pearls)]],
  });
  const nestShelf = bubblesCounter.shelf('Fish Nest', `${NEST_CAP} slots · eggs keep warm while the reef is closed`, BUBBLES.nestEmpty);
  const marketShelf = bubblesCounter.shelf('Fish Market', 'rarity-by-rarity eggs · all odds shown', BUBBLES.market);
  const surveyShelf = bubblesCounter.shelf('Research Surveys', 'Bubbles finds new coral · paid in polyps', BUBBLES.surveys);
  const eggPicks = {};   // egg type → chosen species id (Mythic Egg)
  let nestSig = '';
  function fillNest() {
    const now = Date.now();
    // Nest shelf: rebuilt when the eggs change, otherwise ticked in place so a
    // countdown never yanks the focus around.
    const sig = nestEggs.map(e => `${e.t}@${e.at}`).join('|');
    if (sig !== nestSig) {
      nestSig = sig;
      bubblesCounter.clearShelf(nestShelf);
      nestShelf.el.querySelector('small').textContent = `${nestEggs.length}/${NEST_CAP} slots · eggs keep warm while the reef is closed`;
      nestEggs.map((egg, i) => ({ egg, i })).sort((a, b) => a.egg.at - b.egg.at).forEach(({ egg, i }) => {
        const et = EGG_TYPES[egg.t] ?? EGG_TYPES.common;
        const prog = document.createElement('div'); prog.className = 'm-bar'; prog.innerHTML = '<span></span>';
        const it = bubblesCounter.card(nestShelf, { key: `nest${i}`, color: et.color, name: et.name,
          say: pickLine(BUBBLES.incubating), sub: '', extra: prog,
          buttons: [{ label: '', onClick: () => { speedUpEgg(i); bubblesCounter.say(BUBBLES.rushed); fillNest(); } }] });
        it.egg = egg; it.prog = prog.firstChild;
      });
    }
    for (const it of nestShelf.cards) {
      const et = EGG_TYPES[it.egg.t] ?? EGG_TYPES.common;
      const left = it.egg.at - now;
      it.subEl.textContent = `🐣 in ${fmtMs(left)}`;
      it.prog.style.width = `${clamp(((et.ms - left) / et.ms) * 100, 0, 100)}%`;
      it.prog.className = left <= 0 ? 'full' : '';
      it.buttons[0].textContent = `⏩ ${eggRushCost(it.egg).pearls} 💎`;
    }
    // Market shelf: built once, refreshed in place (pools change with levels).
    const full = nestEggs.length >= NEST_CAP;
    if (!marketShelf.cards.length) {
      for (const [id, et] of Object.entries(EGG_TYPES)) {
        let extra = null;
        if (et.choose) {
          extra = document.createElement('select'); extra.className = 'egg-pick';
          extra.onchange = () => { eggPicks[id] = extra.value; };
          extra.onclick = (e) => e.stopPropagation();
        }
        const it = bubblesCounter.card(marketShelf, { key: id, color: et.color, name: et.name,
          tag: TIER_LABEL[et.tier] ?? et.tier, tagColor: hex(COLORS[`tier_${et.tier}`] ?? 0xb0bec5),
          say: BUBBLES.eggs[id], sub: '', extra,
          buttons: [{ label: '', onClick: () => {
            if (!eggBuyable(id)) { bubblesCounter.say(BUBBLES.noPool); return; }
            if (nestEggs.length >= NEST_CAP) { bubblesCounter.say(BUBBLES.full); return; }
            if (et.be && be < et.be) { bubblesCounter.say(BUBBLES.noBE); return; }
            if (et.pearls && pearls < et.pearls) { bubblesCounter.say(BUBBLES.noPearls(et.pearls)); return; }
            const want = et.choose ? (eggPicks[id] ?? extra?.value) : undefined;
            if (et.choose && !want) { bubblesCounter.say(BUBBLES.pickOne); return; }
            const before = nestEggs.length;
            buyEgg(id, want);
            if (nestEggs.length > before) {
              hudGain(et.be ? 'be' : 'pearls', -(et.be ?? et.pearls));
              bubblesCounter.say(pickLine(BUBBLES.bought));
            }
            fillNest();
          } }] });
        it.et = et; it.pick = extra;
      }
    }
    for (const it of marketShelf.cards) {
      const { et, key: id } = it;
      const buyable = eggBuyable(id);
      const pool = packFishPool(et.tier);
      const odds = et.choose
        ? `hatches the ${TIER_LABEL[et.tier]} you choose — no roll (${pool.length} to pick from)`
        : `hatches 1 of ${pool.length} ${TIER_LABEL[et.tier]} fish, wild-abundance odds`;
      it.subEl.textContent = `${fmtMs(et.ms)} incubation · `
        + (buyable ? odds : 'no species in your unlocked biomes yet — new biomes stock this egg');
      it.card.classList.toggle('locked', !buyable);
      it.buttons[0].textContent = et.be ? `🫧 ${et.be}` : `💎 ${et.pearls}`;
      it.buttons[0].disabled = full || !buyable;
      if (it.pick) {
        const ids = pool.map(s => s.id).join(',');
        if (it.pick.dataset.ids !== ids) {
          it.pick.dataset.ids = ids;
          it.pick.innerHTML = pool.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
          if (eggPicks[id] && pool.some(s => s.id === eggPicks[id])) it.pick.value = eggPicks[id];
        }
        it.pick.style.display = buyable ? '' : 'none';
      }
    }
    fillSurveys();
  }
  let surveySig = '';
  function fillSurveys() {
    const sig = survey ? `away:${survey.b}:${survey.at}` : 'home:' + ['coral', 'seagrass', 'deepTwilight'].filter(zoneUnlocked).join(',');
    if (sig !== surveySig) {
      surveySig = sig;
      bubblesCounter.clearShelf(surveyShelf);
      if (survey) {
        const bio = BIOMES[survey.b];
        const it = bubblesCounter.card(surveyShelf, { key: 'away', icon: bio.icon,
          name: `${SURVEY_TIERS[survey.d ?? 0].name} · ${bio.shortName}`, sub: '',
          say: BUBBLES.away(fmtMs(survey.at - Date.now()), bio.name) });
        it.away = true;
      } else {
        for (const zid of ['coral', 'seagrass', 'deepTwilight']) {
          if (!zoneUnlocked(zid)) continue;
          const bio = BIOMES[zid];
          const it = bubblesCounter.card(surveyShelf, { key: zid, icon: bio.icon,
            name: bio.shortName, say: BUBBLES.biome[zid], sub: '',
            buttons: SURVEY_TIERS.map((st, i) => ({ label: `${st.name} · ${st.min}m · ${st.cost} 🪸`, onClick: () => {
              if (survey) { bubblesCounter.say(BUBBLES.busy); return; }
              if (!discoverableCorals(zid).length) { bubblesCounter.say(BUBBLES.nothingLeft); return; }
              if (polyps < st.cost) { bubblesCounter.say(BUBBLES.noPolyps); return; }
              polyps -= st.cost;
              hudGain('polyps', -st.cost);
              survey = { b: zid, at: Date.now() + st.min * 60e3, d: i, cost: st.cost };
              droneQueue.push(`🔬 ${st.name} funded. Charting the ${bio.name} — back with something new.`);
              bubblesCounter.say(BUBBLES.funded(bio.name));
              refreshHud(); save(); fillSurveys();
            } })) });
          it.zid = zid;
        }
        const note = document.createElement('div'); note.className = 'ct-note';
        note.textContent = 'One survey at a time. 90% the find is from the surveyed biome — longer expeditions'
          + ' and higher reef levels reach rarer species — and 5% each it’s a drifter from another biome.'
          + ' Every find comes home as a free placement.';
        surveyShelf.grid.insertAdjacentElement('afterend', note);
        surveyShelf.note = note;
      }
    }
    for (const it of surveyShelf.cards) {
      if (it.away) { it.subEl.textContent = `returns in ${fmtMs(survey.at - Date.now())}`; continue; }
      const left = discoverableCorals(it.zid).length;
      it.subEl.textContent = `${left} species unrecorded`;
      it.buttons.forEach((b, i) => { b.disabled = !left || polyps < SURVEY_TIERS[i].cost; });
    }
    bubblesCounter.refreshBal();
  }
  function openNest() {
    fillNest();
    bubblesCounter.show(pickLine(BUBBLES.greet));
  }

  const menuEl = document.getElementById('menu3d');
  if (menuEl) {
    [['📖 Ocean Journal', journal, () => { tutNote('journal'); fillJournal(); }],
     ['🏆', achModal, fillAch],
     ['🎁', packModal, fillPack],
     ['🥚', { show: openNest }, () => {}],
     ['📅 Daily', daily, fillDaily],
     ['🎉 Event', { show: openEvent }, () => {}],
     ['⚖ Advisor', advisor, fillAdvisor],
     ['⭐ Progress', progress, fillProgress]].forEach(([text, modal, fill]) => {
      const b = document.createElement('button');
      b.className = 'menu-btn';
      b.textContent = text;
      b.onclick = () => { fill(); modal.show(); };
      menuEl.appendChild(b);
    });
    packBtn = menuEl.children[2];
    refreshPackBtn();
    // 👤 Account — free Reef Bloom accounts keep every slot in the cloud.
    if (accountsEnabled()) {
      const acctBtn = document.createElement('button');
      acctBtn.className = 'menu-btn';
      acctBtn.textContent = '👤';
      acctBtn.title = 'Account & cloud sync';
      acctBtn.onclick = () => openAccountSheet();
      menuEl.appendChild(acctBtn);
      initCloudSave();
      // A pull that replaced THIS reef's slot (signing in on a second device)
      // reloads so the cloud copy is what's on screen; other slots just sync.
      onCloudSynced((changed) => {
        if (changed.includes(slotKey(slot))) {
          flash(rateEl, '☁️ cloud reef loaded — reloading', '#7fd8ff');
          setTimeout(() => location.reload(), 900);
        }
      });
      onAccountSignedIn(() => save());   // stamp + push the live reef right away
    }
    // 🎵 Ambient music — procedural, starts on first gesture, preference saved.
    const musicBtn = document.createElement('button');
    musicBtn.className = 'menu-btn';
    const musicOn = localStorage.getItem('rb3d_music') !== 'off';
    music.setEnabled(musicOn);
    musicBtn.textContent = musicOn ? '🎵' : '🔇';
    musicBtn.onclick = () => {
      const on = music.toggle();
      musicBtn.textContent = on ? '🎵' : '🔇';
      try { localStorage.setItem('rb3d_music', on ? 'on' : 'off'); } catch (e) { /* ignore */ }
      music.poke();
    };
    menuEl.appendChild(musicBtn);
  }
  // Browsers require a gesture before audio: any press wakes the ambience.
  window.addEventListener('pointerdown', () => music.poke());

  // ── Restore saved reef ───────────────────────────────────────────────────────
  // Pre-biome saves lack `b`: corals default to the coral grid; fish anchors are
  // re-confined to the coral zone. No ambient fish — like Classic, every fish in
  // the reef is one the player hatched.
  const saved = load();
  if (saved) {
    be = saved.be ?? START_BE;
    polyps = saved.polyps ?? START_POLYPS;
    pearls = saved.pearls ?? START_PEARLS;
    harmony = saved.harmony ?? START_HARMONY;
    level = saved.level ?? START_LEVEL;
    timeOfDay = saved.timeOfDay ?? 0.3;
    // Rebuild bought expansions before restoring corals that may sit on them.
    Object.entries(saved.exp ?? {}).forEach(([zid, keys]) =>
      (keys ?? []).forEach(k => buildExpansion(zid, k)));
    (saved.stations ?? []).forEach(({ b, c, r, level: lv }) => {
      if (ZONES[b]) addStation(b, c, r, lv ?? 1);
    });
    (saved.corals ?? []).forEach(({ b, c, r, id, level: lv, g }) => {
      const spec = CORAL_SPECIES[id] ?? LOCAL_SPECS[id] ?? null;
      const tile = tileAt(b ?? 'coral', c, r);
      if (!spec || !tile || tile.userData.occupied) return;
      // Pre-growth-stage saves carry no `g` clock: those corals were adults
      // under the old rules, so they load full grown — never demote a mature
      // reef to hatchlings (or its income to a trickle).
      const stage = g === undefined ? CORAL_MAX_LEVEL : (lv ?? 0);
      addCoral(spec, tile, stage, g);
    });
    (saved.fish ?? []).forEach((d, i) => {
      const spec = FISH_SPECIES[d.id];
      if (!spec) return;
      const zone = ZONES[d.b] ?? ZONES.coral;
      const st = d.b ? { ...d } : fishState(spec, d.cx ?? 0, d.cz ?? 0, i, zone);
      const g = attachFish(spec, st, true);
      const rec = fishSaveData(st); placedFish.push(rec); g.userData.saveRef = rec;
    });
    (saved.seen ?? []).forEach(id => seen.add(id));
    (saved.eggs ?? []).forEach(id => eggsClaimed.add(id));
    ev3 = saved.ev3 ?? null;
    dq = saved.dq ?? null;
    (saved.excl ?? []).forEach(id => exclOwned.add(id));
    (saved.ach ?? []).forEach(id => achUnlocked.add(id));
    sawNight = !!saved.sawNight;
    if (saved.packs) Object.assign(packs, saved.packs);
    else {
      // Pre-pack save: retro-mint the packs its level-ups would have earned.
      for (let l = 2; l <= level; l++) {
        const pt = packTierForLevel(l);
        packs[pt] = (packs[pt] ?? 0) + 1;
      }
    }
    Object.assign(vouchers, saved.vouchers ?? {});
    (saved.seasonPacks ?? []).forEach(id => seasonPacks.push(id));
    (saved.nest ?? []).forEach(e => nestEggs.push(e.t === 'premium' ? { ...e, t: 'legendary' } : e));
    starterEggsGiven = !!saved.starterEggs;
    starterPackGiven = !!saved.starterPack;
    survey = saved.survey ?? null;
    if (saved.quiz) quiz = saved.quiz;
    dailyPackDate = saved.dailyPack ?? '';
    if (!saved.coralDisc) {
      // Pre-discovery save: everything the reef could already buy counts as
      // recorded — veterans lose nothing to the new gate.
      for (const s of [...allCorals(), GOLDEN_SPEC]) {
        if (s.utility || s.pearlCost || s.eventId) continue;
        const need = Math.max(s.unlockLevel ?? 1, ZONES[primaryBiome(s)].unlock);
        if (need <= level) seen.add(s.id);
      }
    }
    // Pre-tutorial saves with a grown reef graduate automatically.
    tutDone = saved.tut ?? (saved.corals?.length ?? 0) > 0;
    tutPaid = saved.tutp ?? tutDone;
  }
  if (!starterPackGiven) {
    // Level-1 welcome, part one: a Starter Pack waiting in 🎁 Packs — fixed
    // contents, and the player's first taste of opening one.
    packs.starter = (packs.starter ?? 0) + 1;
    starterPackGiven = true;
  }
  if (!starterEggsGiven) {
    // The level-1 welcome: two starter eggs already warming in the nest — the
    // player's first fish arrive by hatching, teaching the loop from turn one.
    nestEggs.push({ t: 'common', at: Date.now() + 45e3 });
    nestEggs.push({ t: 'common', at: Date.now() + 120e3 });
    starterEggsGiven = true;
  }
  ev3Init(); ev3Snapshot(); dqInit(); dqSnapshot(); refreshExclRows(); refreshPackBtn();
  recomputeRates(); refreshProgress(); refreshHud();
  refreshExpMarkers(); refreshZoneLocks();

  // ── 🎓 Reef Orientation — Bubbles walks new keepers through the basics ───────
  // A coach card of steps that each watch real game state (or a one-shot
  // tutNote pinged from the mechanic itself) and advance only when the player
  // has actually done the thing. Auto-starts on fresh reefs, skippable,
  // replayable from the 🎓 menu button; completion pays 5 pearls, once.
  const TUT_STEPS = [
    { say: 'Orientation protocol engaged. First: drag to glide around, '
        + 'right-drag or two fingers to orbit. Arrow keys also work. '
        + 'Go on, wiggle the camera. I will know.',
      done: () => tutSeen.has('camera') },
    { say: 'Pick a coral from the Species panel and tap a tile on the 🪸 Coral '
        + 'Reef grid in the centre — the level-1 basics are already on file. '
        + 'I recommend a cheap one. I always recommend the cheap one.',
      glow: '#palette', done: () => placedCorals.length >= 1 },
    { say: 'Coral hatchlings breathe out Bubble Energy 🫧 — that +/s by your '
        + 'counter is your reef working, and it rises as they grow. Plant '
        + 'until you have three corals. Three is a good number. I checked.',
      glow: '#hud', done: () => placedCorals.length >= 3 },
    { say: 'Three corals down. Now, fish: two starter eggs are already warming '
        + 'in the 🥚 nest on the rocky outcrop, south-east. The first hatches '
        + 'any minute — no action required. Feels wrong, I know.',
      glow: '#menu3d', done: () => placedFish.length >= 1 },
    { say: 'Tap your fish to say hello. Every family reacts in its own way. '
        + 'I have logged 11 distinct reactions. Possibly 12.',
      done: () => tutSeen.has('pet') },
    { say: 'Select 🍤 Feed at the bottom of the panel, then tap the water. '
        + 'Stand back — mealtime is not dignified.',
      glow: '#palette', done: () => tutSeen.has('feed') },
    { say: 'Tap a planted coral to open its care panel — it shows the growth '
        + 'stage, and polyps 🪸 spent there regrow it bigger and richer.',
      done: () => tutSeen.has('upgrade') },
    { say: 'Last one: open the 📖 Ocean Journal, top right. Every species you '
        + 'place gets a page. I wrote the field notes. Most are accurate.',
      glow: '#menu3d', done: () => tutSeen.has('journal') },
  ];
  const tutCard = document.createElement('div');
  tutCard.id = 'tut-card';
  tutCard.innerHTML = '<div class="t-head"><span>🤖 Bubbles · Reef Orientation</span>'
    + '<span class="t-step"></span></div><div class="t-text"></div>'
    + '<button class="t-skip">Skip tutorial</button>';
  document.body.appendChild(tutCard);
  const tutStepEl = tutCard.querySelector('.t-step');
  const tutTextEl = tutCard.querySelector('.t-text');
  const hintEl = document.getElementById('hint');
  let tutStep = 0, tutTimer = null, tutGlowEl = null, tutHideTimer = null;

  function tutGlow(sel) {
    tutGlowEl?.classList.remove('tut-glow');
    tutGlowEl = sel ? document.querySelector(sel) : null;
    tutGlowEl?.classList.add('tut-glow');
  }
  function tutShow() {
    const s = TUT_STEPS[tutStep];
    tutStepEl.textContent = `${tutStep + 1} / ${TUT_STEPS.length}`;
    tutTextEl.textContent = s.say;
    tutGlow(s.glow);
    tutCard.classList.remove('pulse');
    void tutCard.offsetWidth;               // restart the advance-pulse animation
    tutCard.classList.add('pulse');
  }
  function tutEnd(graduated) {
    clearInterval(tutTimer); tutTimer = null;
    tutGlow(null);
    tutDone = true;
    refreshProgress();   // orientation gates Level 2 — unlock it on the spot
    tutCard.querySelector('.t-skip').style.display = 'none';
    if (graduated) {
      tutStepEl.textContent = '🎓';
      if (!tutPaid) {
        tutPaid = true;
        pearls += 5;
        tutTextEl.textContent = 'Orientation complete. Dispensing 5 pearls 💎 — '
          + 'and your Starter Pack is still waiting in 🎁 Packs, top right. '
          + 'The reef is yours now. I will be over here, observing. Neutrally.';
      } else {
        tutTextEl.textContent = 'Orientation complete. Again. The pearls were '
          + 'a one-time offer, but the knowledge is forever. Allegedly.';
      }
      droneTrigger('tutorialDone');
      tutHideTimer = setTimeout(() => {
        tutCard.style.display = 'none';
        if (hintEl) hintEl.style.display = '';
      }, 7000);
      refreshHud();
    } else {
      tutCard.style.display = 'none';
      if (hintEl) hintEl.style.display = '';
    }
    save();
  }
  function tutStart() {
    if (tutTimer) return;
    clearTimeout(tutHideTimer);
    tutDone = false;
    tutStep = 0;
    tutSeen.clear();
    // Reloads and replays skip past state the reef already satisfies.
    while (tutStep < TUT_STEPS.length && TUT_STEPS[tutStep].done()) tutStep++;
    if (tutStep >= TUT_STEPS.length) { tutEnd(true); return; }
    tutCard.style.display = 'block';
    tutCard.querySelector('.t-skip').style.display = '';
    if (hintEl) hintEl.style.display = 'none';   // the card is the hint for now
    tutShow();
    tutTimer = setInterval(() => {
      if (!TUT_STEPS[tutStep].done()) return;
      tutStep++;
      if (tutStep >= TUT_STEPS.length) tutEnd(true);
      else tutShow();
    }, 400);
  }
  tutCard.querySelector('.t-skip').onclick = () => tutEnd(false);
  if (menuEl) {
    const b = document.createElement('button');
    b.className = 'menu-btn';
    b.textContent = '🎓';
    b.title = 'Replay the reef orientation';
    b.onclick = tutStart;
    menuEl.appendChild(b);
  }
  // Step 1 watches for a real camera move: a drag on the canvas or arrow keys.
  let tutPtr = null;
  renderer.domElement.addEventListener('pointerdown',
    e => { tutPtr = { x: e.clientX, y: e.clientY }; });
  renderer.domElement.addEventListener('pointermove', e => {
    if (tutPtr && !tutSeen.has('camera')
      && Math.hypot(e.clientX - tutPtr.x, e.clientY - tutPtr.y) > 45) tutNote('camera');
  });
  renderer.domElement.addEventListener('pointerup', () => { tutPtr = null; });
  window.addEventListener('keydown',
    e => { if (e.key.startsWith('Arrow')) tutNote('camera'); });
  if (!tutDone) tutStart();

  // ── Bubbles the drone — dock, speech overlay, and state machine ──────────────
  const drone = makeDrone();
  // Dock sits in the open channel south-east of the reef grid, clear of the
  // tiles, the expansion aprons, and the decor ring around them.
  // ── Wild groves — dense life beyond the grid ─────────────────────────────────
  // Untamed patches outside the buildable footprint: seagrass meadows in the
  // seagrass zone, wild coral heads in the reef, a small grove in the
  // twilight. These are where Bubbles lingers while running a survey.
  const wildCorals = [];
  const wildTufts = [];
  const WILD_PATCH_POS = {};
  {
    const mkWildCoral = (spec, x, z, s) => {
      if (!spec) return;
      const g = makeCoral(spec, 3 + Math.floor(Math.random() * 3));
      g.position.set(x, terrainHeight(x, z) + 0.15, z);
      g.scale.setScalar(s);
      g.userData.grow = 1;
      scene.add(g);
      wildCorals.push(g);
    };
    const sg = ZONES.seagrass;
    const sgSpots = [[-13, 15], [11, -16], [-5, 19]];
    for (const [ox, oz] of sgSpots) {
      for (let i = 0; i < 22; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 4.5;
        wildTufts.push(weedTuft(sg.cx + ox + Math.cos(a) * r, sg.cz + oz + Math.sin(a) * r,
          3 + Math.floor(Math.random() * 3), [0x2e7d52, 0x3f9c63, 0x8d4a4a][i % 3]));
      }
    }
    WILD_PATCH_POS.seagrass = new THREE.Vector3(sg.cx + sgSpots[0][0], 0, sg.cz + sgSpots[0][1]);
    const cr = ZONES.coral;
    const crSpots = [[-14, 14], [13, -15], [6, 18]];
    const crSpecies = ['staghorn', 'brain', 'lettuce', 'finger', 'star', 'toadstool'];
    for (const [ox, oz] of crSpots) {
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 3.5;
        mkWildCoral(CORAL_SPECIES[crSpecies[Math.floor(Math.random() * crSpecies.length)]],
          cr.cx + ox + Math.cos(a) * r, cr.cz + oz + Math.sin(a) * r,
          0.75 + Math.random() * 0.4);
      }
    }
    WILD_PATCH_POS.coral = new THREE.Vector3(cr.cx + crSpots[0][0], 0, cr.cz + crSpots[0][1]);
    const tw = ZONES.deepTwilight;
    const twSpot = [10, 16];
    const twSpecies = ['twilightBrain', 'lanternCoral', 'phantomPolyp', 'wispCoral'];
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 3;
      mkWildCoral(CORAL_SPECIES[twSpecies[i % twSpecies.length]],
        tw.cx + twSpot[0] + Math.cos(a) * r, tw.cz + twSpot[1] + Math.sin(a) * r,
        0.7 + Math.random() * 0.35);
    }
    {   // one wild Golden Tree stands in the twilight grove, as in the papers
      const gt = makeGoldenTree();
      const gx = tw.cx + twSpot[0], gz = tw.cz + twSpot[1];
      gt.position.set(gx, terrainHeight(gx, gz) + 0.15, gz);
      gt.scale.setScalar(0.95);
      gt.userData.grow = 1;
      scene.add(gt);
      wildCorals.push(gt);
    }
    WILD_PATCH_POS.deepTwilight = new THREE.Vector3(tw.cx + twSpot[0], 0, tw.cz + twSpot[1]);
    for (const k of Object.keys(WILD_PATCH_POS)) {
      const p = WILD_PATCH_POS[k];
      p.y = terrainHeight(p.x, p.z) + 2.4;   // Bubbles' working height
    }

    // Cosmetic fringes — untended coral in the channels between the zones and
    // on the outer flats. Pure scenery: no tiles, no income, nothing to tap.
    // Spots sit clear of every buildable footprint and expansion strip
    // (zone x-bands ± the 5-tile aprons), the outcrop, and the vent.
    const fringes = [
      // [x, z, corals, spread, species pool, weed tufts]
      [-16,   12, 6, 4.2, ['lettuce', 'lagoonFan', 'star', 'finger'], 8],
      [-15,  -14, 7, 3.4, ['staghorn', 'brain', 'finger', 'toadstool'], 5],
      [-46,   -6, 4, 2.4, ['lagoonFan', 'lettuce'], 12],
      [14.5, -13, 6, 3.0, ['star', 'toadstool', 'brain', 'lanternCoral'], 4],
      [20,     8, 5, 2.0, ['staghorn', 'star', 'finger'], 4],
      [47,     7, 5, 3.0, ['twilightBrain', 'wispCoral', 'phantomPolyp', 'lanternCoral'], 0],
    ];
    for (const [px, pz, n, spread, pool, tufts] of fringes) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * spread;
        mkWildCoral(CORAL_SPECIES[pool[Math.floor(Math.random() * pool.length)]],
          px + Math.cos(a) * r, pz + Math.sin(a) * r, 0.6 + Math.random() * 0.45);
      }
      for (let i = 0; i < tufts; i++) {
        const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * (spread + 1.5);
        wildTufts.push(weedTuft(px + Math.cos(a) * r, pz + Math.sin(a) * r,
          3 + Math.floor(Math.random() * 3), [0x2e7d52, 0x3f9c63, 0x557f3f][i % 3]));
      }
    }

    // Wild scenery yields to the player's reef. The groves and fringes are
    // seeded with a random spread, and several land on the 5×5 expansion plots
    // (the twilight Golden Tree stands squarely on one). Whenever a plot is
    // owned — bought now, or restored from a save — every wild coral and tuft
    // on it moves out to the open channel beside that biome, at the same
    // north–south position so the grove still reads as a grove. Unowned plots
    // keep their scenery; it's only in the way once there are tiles under it.
    const PLOT_PAD = 0.9;                         // keep clear of the tile edge too
    const KEEP_OUT = [[15, 24, 5.5], [46, -16, 4], [17, -25, 4.5]];   // the outcrop; the vent; Skip-7's counter
    const plotRect = (zn, p) => {
      const half = (zn.grid * TILE) / 2;
      return {
        x0: zn.cx + p.c0 * TILE - half - PLOT_PAD, x1: zn.cx + (p.c0 + EXP_SIZE) * TILE - half + PLOT_PAD,
        z0: zn.cz + p.r0 * TILE - half - PLOT_PAD, z1: zn.cz + (p.r0 + EXP_SIZE) * TILE - half + PLOT_PAD,
      };
    };
    const ownedPlotAt = (x, z) => {
      for (const [zid, keys] of Object.entries(expansions)) {
        for (const key of keys) {
          const r = plotRect(ZONES[zid], EXP_PATCHES[key]);
          if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return ZONES[zid];
        }
      }
      return null;
    };
    const blocked = (x, z) => inBuildArea(x, z, PLOT_PAD)
      || x < -48 || x > 50 || Math.abs(z) > 36
      || KEEP_OUT.some(([kx, kz, kr]) => (x - kx) ** 2 + (z - kz) ** 2 < kr * kr);
    relocateWildDecor = () => {
      for (const g of [...wildCorals, ...wildTufts]) {
        const zn = ownedPlotAt(g.position.x, g.position.z);
        if (!zn) continue;
        // Nearest side channel first, then the far one; walk outward and nudge
        // along z until a free spot turns up. Deterministic per object so a
        // reload puts it back in the same place.
        const half = (zn.grid * TILE) / 2;
        const side = g.position.x >= zn.cx ? 1 : -1;
        const seed = Math.abs(Math.sin(g.position.x * 12.9898 + g.position.z * 78.233)) % 1;
        let spot = null;
        search:
        for (const dir of [side, -side]) {
          for (let out = 1.6; out <= 7; out += 0.9) {
            for (const dz of [0, 1.5, -1.5, 3, -3, 5, -5]) {
              const x = zn.cx + dir * (half + out + seed * 1.2), z = g.position.z + dz;
              if (!blocked(x, z)) { spot = [x, z]; break search; }
            }
          }
        }
        if (!spot) { g.visible = false; continue; }   // nowhere sensible: step out of the way entirely
        const lift = g.position.y - terrainHeight(g.position.x, g.position.z);
        g.position.set(spot[0], terrainHeight(spot[0], spot[1]) + lift, spot[1]);
      }
    };
    relocateWildDecor();   // plots restored from the save are already owned
  }

  const dockY = terrainHeight(15, 24);
  const DOCK_POS = new THREE.Vector3(15, dockY + 1.1, 24);
  // The rocky outcrop — one landmark holding Bubbles' perch, the Fish Nest,
  // and the Market stall, in the open channel south-east of the reef.
  const outcrop = new THREE.Group();
  outcrop.position.set(15, dockY, 24);
  const mkRock = (x, z, s, sy, ry = 0) => {
    const r = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), rockMat);
    r.position.set(x, 0.18, z);
    r.scale.set(s, s * sy, s);
    r.rotation.y = ry;
    outcrop.add(r);
    return r;
  };
  mkRock(0, 0, 1.2, 0.55);            // Bubbles' perch (the old dock rock)
  mkRock(-1.8, 0.8, 0.95, 0.42, 1.3);
  mkRock(1.9, -0.7, 1.0, 0.48, 2.4);
  mkRock(-0.5, -1.6, 0.72, 0.36, 0.7);
  mkRock(1.0, 1.6, 0.78, 0.4, 3.6);
  // Fish Nest — a pebble-ring bowl on the west shoulder.
  const nestGroup = new THREE.Group();
  nestGroup.position.set(-1.8, 0.52, 0.8);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.62, 0.16, 14), rockMat);
  nestGroup.add(dish);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const peb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), rockMat);
    peb.position.set(Math.cos(a) * 0.55, 0.1, Math.sin(a) * 0.55);
    peb.scale.y = 0.75;
    nestGroup.add(peb);
  }
  nestEggGroup = new THREE.Group();
  nestGroup.add(nestEggGroup);
  outcrop.add(nestGroup);
  // Market stall — posts, a tilted canopy, a crate and barrel of wares.
  const marketGroup = new THREE.Group();
  marketGroup.position.set(1.9, 0.55, -0.7);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.8 });
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0xffb74d, roughness: 0.7 });
  for (const sx of [-0.55, 0.55]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.25, 8), postMat);
    post.position.set(sx, 0.62, 0);
    marketGroup.add(post);
  }
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 1.0), canopyMat);
  canopy.position.set(0, 1.28, -0.12);
  canopy.rotation.x = -0.18;
  marketGroup.add(canopy);
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.5), postMat);
  crate.position.set(-0.15, 0.22, 0.15);
  crate.rotation.y = 0.5;
  marketGroup.add(crate);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.5, 10), canopyMat);
  barrel.position.set(0.42, 0.26, 0.28);
  marketGroup.add(barrel);
  outcrop.add(marketGroup);
  outcrop.traverse(o => { if (o.isMesh) o.castShadow = true; });
  scene.add(outcrop);
  refreshNestEggs();
  drone.position.copy(DOCK_POS);
  scene.add(drone);
  // Skip-7's counter stands on the outskirts north of the home reef, turned to
  // face it; tapping anything of his opens the Pearl Market.
  const skip7 = makeSkip7();
  {
    const y = terrainHeight(17, -25);
    skip7.position.set(17, y, -25);
    skip7.lookAt(ZONES.coral.cx, y, ZONES.coral.cz);
  }
  scene.add(skip7);
  if (window.__rb3d) Object.assign(window.__rb3d, { skip7, outcrop });

  // Speak positions hover over the home reef, where the camera usually looks.
  const SPEAK_POS = [
    // Coral Reef
    new THREE.Vector3(0, 4.5, 2), new THREE.Vector3(-4, 3.8, -4),
    new THREE.Vector3(6, 4.2, -3), new THREE.Vector3(3, 4.6, 5),
    new THREE.Vector3(-6, 4, 4),
    // Seagrass flats
    new THREE.Vector3(-28, 4.2, 3), new THREE.Vector3(-36, 3.6, -5),
    new THREE.Vector3(-32, 5, 8),
    // Twilight shelf
    new THREE.Vector3(28, 2.5, -4), new THREE.Vector3(36, 3.2, 5),
    new THREE.Vector3(42, 4, -10),                    // near the vent
    // Up along the surface and over toward the beach
    new THREE.Vector3(-12, SURFACE_Y - 1.2, 6), new THREE.Vector3(-52, SURFACE_Y - 1.5, -8),
    new THREE.Vector3(-58, 8, 12),                    // shoreline shallows
  ];
  const speechEl = document.createElement('div');
  speechEl.id = 'bubbles-speech';
  document.body.appendChild(speechEl);

  let droneState = 'docked';
  const droneTarget = DOCK_POS.clone();
  // Scanning beam — a soft teal cone Bubbles sweeps over the seabed while
  // working a survey spot. Invisible outside surveys.
  const scanCone = new THREE.Mesh(
    new THREE.ConeGeometry(1.5, 3.2, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
  scanCone.position.y = -1.75;
  drone.add(scanCone);
  let surveySpot = null, scanTimer = 0, scanFlash = null;
  const SCAN_COLORS = { red: 0xff5252, yellow: 0xffd54f, green: 0x66ff88 };
  const dronePos = DOCK_POS.clone();
  let speechTimer = 0;
  let flavorTimer = 30 + Math.random() * 45;
  let droneReady = false;          // suppress triggers fired during restore
  let lowBEAt = -999;

  function droneTrigger(event) {
    if (!droneReady) return;
    const pool = BUBBLES_LINES[event];
    if (!pool) return;
    droneQueue.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  function droneSpeak(text) {
    droneState = 'speaking';
    speechEl.textContent = text;
    speechEl.style.display = 'block';
    speechTimer = Math.min(Math.max(text.length * 0.052, 2.5), 6);   // read time
  }
  // Napping — Bubbles picks a free tile, lands, and blocks it until it wakes.
  let napTile = null, napTimer = 0;
  function droneWake(grumpy = false) {
    if (napTile) { napTile.userData.occupied = false; napTile.userData.napped = false; }
    napTile = null;
    drone.rotation.z = 0;
    if (grumpy) droneQueue.push('I was DEFRAGMENTING. Fine. The tile is yours.');
    droneState = 'returning';
    droneTarget.copy(DOCK_POS);
  }
  function droneUpdate(dt, t, nf) {
    // A live survey puts Bubbles to work in the wild groves of that biome.
    if (survey && WILD_PATCH_POS[survey.b] && droneState === 'docked' && droneQueue.length === 0) {
      droneState = 'toSurvey';
      droneTarget.copy(WILD_PATCH_POS[survey.b]);
    }
    if (droneState === 'docked' && droneQueue.length === 0) {
      flavorTimer -= dt;
      if (flavorTimer <= 0) {
        flavorTimer = 45 + Math.random() * 45;
        // Sometimes, instead of a quip, Bubbles just... goes to sleep on a tile.
        if (Math.random() < 0.35) {
          const free = tiles.filter(tl => !tl.userData.occupied && zoneUnlocked(tl.userData.biome));
          if (free.length) {
            napTile = free[Math.floor(Math.random() * free.length)];
            napTile.userData.occupied = true;
            napTile.userData.napped = true;
            droneState = 'toNap';
            droneTarget.set(napTile.position.x, napTile.position.y + 0.55, napTile.position.z);
          }
        } else {
          droneTrigger('flavor');
        }
      }
    }
    if (droneState === 'napping') {
      napTimer -= dt;
      drone.rotation.z = 0.42 + Math.sin(t * 0.9) * 0.03;   // keeled over, snoring
      if (droneQueue.length || napTimer <= 0 || survey) droneWake(false);
    }
    if (droneState === 'docked' && droneQueue.length > 0) {
      droneState = 'floating';
      droneTarget.copy(SPEAK_POS[Math.floor(Math.random() * SPEAK_POS.length)]);
    } else if (droneState === 'toNap' || droneState === 'toSurvey') {
      const step = 5.5 * dt;
      const d = droneTarget.distanceTo(dronePos);
      if (d < Math.max(step, 0.25)) {
        dronePos.copy(droneTarget);
        if (droneState === 'toNap') {
          droneState = 'napping';
          napTimer = 35 + Math.random() * 35;
        } else {
          droneState = 'surveying';
          surveySpot = null;
        }
      } else {
        dronePos.lerp(droneTarget, step / d);
      }
    } else if (droneState === 'surveying') {
      // Work the grove: hop to a random spot in the search area, nose down,
      // sweep the scan beam, then pick the next spot — repeat till done.
      const p = survey ? WILD_PATCH_POS[survey.b] : null;
      if (!p) {
        droneState = 'returning';
        droneTarget.copy(DOCK_POS);
      } else if (droneQueue.length) {
        droneState = 'floating';
        droneTarget.copy(SPEAK_POS[Math.floor(Math.random() * SPEAK_POS.length)]);
      } else if (!surveySpot) {
        const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 4;
        surveySpot = new THREE.Vector3(
          p.x + Math.cos(a) * r, p.y + (Math.random() - 0.5) * 0.8, p.z + Math.sin(a) * r);
        scanTimer = 0;
      } else if (scanTimer <= 0) {
        const step = 3.2 * dt;
        const d = surveySpot.distanceTo(dronePos);
        if (d < Math.max(step, 0.2)) {
          dronePos.copy(surveySpot);
          scanTimer = 3.5 + Math.random() * 2.5;
        } else {
          dronePos.lerp(surveySpot, step / d);
          const dx = surveySpot.x - dronePos.x, dz = surveySpot.z - dronePos.z;
          if (dx * dx + dz * dz > 0.01) {
            let dy = Math.atan2(dx, dz) - drone.rotation.y;
            while (dy > Math.PI) dy -= Math.PI * 2;
            while (dy < -Math.PI) dy += Math.PI * 2;
            drone.rotation.y += dy * Math.min(1, dt * 5);
          }
        }
      } else if (scanFlash) {
        // Verdict flash: red = nothing here; yellow = a species we already
        // know; green = a NEW species — and green ends the search.
        drone.rotation.x += (0.45 - drone.rotation.x) * Math.min(1, dt * 4);
        scanCone.material.opacity = 0.3 + Math.sin(t * 18) * 0.15;
        if (t >= scanFlash.until) {
          const kind = scanFlash.kind;
          scanFlash = null;
          scanCone.material.color.setHex(0x7fd8ff);
          if (kind === 'green' || kind === 'yellowFinal') resolveSurvey();
          else surveySpot = null;   // red or mid-search yellow: keep looking
        }
      } else {
        scanTimer -= dt;
        drone.rotation.x += (0.45 - drone.rotation.x) * Math.min(1, dt * 4);   // nose down
        drone.rotation.y += dt * 0.9;                                          // slow sweep
        scanCone.material.opacity = 0.16 + Math.sin(t * 5) * 0.07;             // beam pulse
        if (scanTimer <= 0) {
          // Scan verdict. The final sweep inside the allotted time is ALWAYS
          // green (something new remains) or yellow (only known species left).
          const expired = Date.now() >= survey.at;
          const canFind = surveyCanFind();
          let kind = 'red';
          if (expired) kind = canFind ? 'green' : 'yellowFinal';
          else if (canFind && Math.random() < 0.045) kind = 'green';   // lucky early find
          else if (Math.random() < 0.16) kind = 'yellow';              // known species
          scanCone.material.color.setHex(
            SCAN_COLORS[kind === 'yellowFinal' ? 'yellow' : kind] ?? SCAN_COLORS.red);
          scanFlash = { kind, until: t + 1.0 };
        }
      }
    } else if (droneState === 'floating' || droneState === 'returning') {
      const step = 5.5 * dt;
      const d = droneTarget.distanceTo(dronePos);
      if (d < Math.max(step, 0.25)) {
        dronePos.copy(droneTarget);
        if (droneState === 'floating') droneSpeak(droneQueue.shift());
        else droneState = 'docked';
      } else {
        dronePos.lerp(droneTarget, step / d);
      }
    } else if (droneState === 'speaking') {
      speechTimer -= dt;
      if (speechTimer <= 0) {
        if (droneQueue.length) droneSpeak(droneQueue.shift());
        else {
          speechEl.style.display = 'none';
          droneState = 'returning';
          droneTarget.copy(DOCK_POS);
        }
      }
    }
    // Bob, face travel direction, spin the prop, light up after dark.
    drone.position.copy(dronePos);
    drone.position.y += Math.sin(t * 1.6) * (droneState === 'docked' ? 0.06 : 0.14);
    if (droneState !== 'surveying') {
      drone.rotation.x += (0 - drone.rotation.x) * Math.min(1, dt * 4);
      scanCone.material.opacity += (0 - scanCone.material.opacity) * Math.min(1, dt * 4);
    }
    const moving = droneState === 'floating' || droneState === 'returning'
      || droneState === 'toSurvey';
    if (moving) {
      const dx = droneTarget.x - dronePos.x, dz = droneTarget.z - dronePos.z;
      if (dx * dx + dz * dz > 0.01) {
        const want = Math.atan2(dx, dz);
        let dy = want - drone.rotation.y;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        drone.rotation.y += dy * Math.min(1, dt * 5);
      }
    }
    drone.rotation.z = Math.sin(t * 1.1) * 0.05;
    drone.userData.prop.rotation.z += dt * (moving ? 22 : 7);
    drone.userData.eyeMat.emissiveIntensity = 0.35 + nf * 1.1;   // headlight at night
    {   // Skip-7 idles: a slow look around, a blink, arms that fidget, lamps up after dark.
      const u = skip7.userData;
      u.head.rotation.y = Math.sin(t * 0.45) * 0.4 + Math.sin(t * 1.9) * 0.04;
      u.head.rotation.x = Math.sin(t * 0.8) * 0.05;
      u.arms[0].rotation.x = -0.35 + Math.sin(t * 1.3) * 0.08;
      u.arms[1].rotation.x = -0.35 + Math.cos(t * 1.1) * 0.08;
      u.eyeMat.emissiveIntensity = (t % 4.7) < 0.12 ? 0.1 : 0.9;
      const bio = nf * bioNight();   // Bioluminescence Night: his lamps go blue
      u.lampMat.emissiveIntensity = 0.25 + nf * 1.2 + bio * 0.8;
      u.lampMat.emissive.setHex(bio > 0.5 ? 0x62c8ff : 0xffd27f);
      u.tanks.forEach((m, i) => { m.position.y = 1.28 + Math.sin(t * 1.5 + i * 2) * 0.02; });
    }
    drone.userData.glowMat.emissiveIntensity = 0.8 + nf * 0.8;
    // Project the speech bubble to screen space above the drone.
    if (droneState === 'speaking') {
      const v = drone.position.clone();
      v.y += 0.85;
      v.project(camera);
      if (v.z < 1) {
        const px = clamp((v.x * 0.5 + 0.5) * window.innerWidth, 130, window.innerWidth - 130);
        const py = clamp((-v.y * 0.5 + 0.5) * window.innerHeight, 90, window.innerHeight - 30);
        speechEl.style.left = `${px}px`;
        speechEl.style.top = `${py}px`;
        speechEl.style.display = 'block';
      } else {
        speechEl.style.display = 'none';
      }
    }
  }
  droneReady = true;

  // ── Pointer picking ──────────────────────────────────────────────────────────
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  let hovered = null;
  function setPtr(ev) {
    ptr.x = (ev.clientX / window.innerWidth) * 2 - 1;
    ptr.y = -(ev.clientY / window.innerHeight) * 2 + 1;
    ray.setFromCamera(ptr, camera);
  }
  renderer.domElement.addEventListener('pointermove', ev => {
    setPtr(ev);
    const t = ray.intersectObjects(tiles, false)[0]?.object ?? null;
    if (hovered && hovered !== t) { hovered.material = hovered.userData.baseMat; hovered = null; }
    const ok = selected.type === 'coral' && t && !t.userData.occupied
      && zoneUnlocked(t.userData.biome) && matchesBiome(selected.spec, t.userData.biome);
    if (ok) { t.material = hoverMat; hovered = t; }
    else if (hovered) { hovered.material = hovered.userData.baseMat; hovered = null; }
  });
  // Deduct a placement cost by currency (pearls / polyps / BE). False if unaffordable.
  function charge(spec, costTable) {
    // A banked seedling/voucher is a free placement, then it's spent.
    if (vouchers[spec.id] > 0) {
      if (--vouchers[spec.id] <= 0) delete vouchers[spec.id];
      refreshLocks();
      flash(rateEl, '🎟 seedling planted', '#7fd8b0');
      return true;
    }
    // An unrecorded coral can't be bought — it needs a seedling or a find.
    // Once recorded, it sells at its normal price like any fish-shop species.
    if (costTable === CORAL_COST && seedOnly(spec, 'coral') && !coralKnown(spec)) {
      flash(rateEl, '🌱 not yet recorded — needs a seedling or a find');
      return false;
    }
    if (spec.pearlCost) {
      // Pearl species are sold only at Skip-7's counter, as a placement voucher.
      flash(rateEl, '💎 sold at the Pearl Market — tap Skip-7');
      return false;
    } else if (spec.eventId) {
      // Event exclusives come only from their event's shop, one voucher a time.
      flash(rateEl, '🎉 sold at the Event Shop, during its event');
      return false;
    } else if (spec.polypCost) {
      if (polyps < spec.polypCost) { flash(rateEl, 'not enough 🪸'); return false; }
      polyps -= spec.polypCost;
    } else {
      const cost = costTable[spec.tier] ?? 0;
      if (be < cost) {
        flash(rateEl, 'not enough 🫧');
        const now = performance.now() / 1000;
        if (now - lowBEAt > 45) { lowBEAt = now; droneTrigger('lowBE'); }
        return false;
      }
      be -= cost;
    }
    return true;
  }
  // A zone accepts a species if it's unlocked and the species lives there.
  function zoneCheck(spec, zid) {
    if (!zoneUnlocked(zid)) {
      flash(rateEl, `${BIOMES[zid].icon} unlocks at Lv ${ZONES[zid].unlock}`);
      return false;
    }
    if (!matchesBiome(spec, zid)) {
      flash(rateEl, `${spec.name} lives in ${biomeIcons(spec)}`);
      return false;
    }
    return true;
  }
  // Resolve a raycast hit to the owning coral / fish group (or null).
  const ancestorWith = (obj, key) => { let g = obj; while (g && !g.userData[key]) g = g.parent; return g; };

  // Picking runs on pointerup, and only for a genuine tap/click — a pointer
  // that stayed put and wasn't part of a multi-touch gesture. Otherwise every
  // camera drag or pinch that starts on a tile would plant a coral.
  let tapStart = null, tapMulti = false, activePtrs = 0;
  renderer.domElement.addEventListener('pointerdown', ev => {
    activePtrs++;
    if (activePtrs > 1) { tapMulti = true; return; }
    tapMulti = false;
    tapStart = { x: ev.clientX, y: ev.clientY };
  });
  renderer.domElement.addEventListener('pointercancel', () => {
    activePtrs = Math.max(0, activePtrs - 1);
    tapMulti = true;
  });
  // Kill the browser's synthesized "ghost click" after a canvas touch — it
  // fires ~instantly at the same spot and would press whatever UI a tap just
  // opened underneath the finger (e.g. the upgrade button of a fresh modal).
  renderer.domElement.addEventListener('touchend', ev => ev.preventDefault(), { passive: false });
  renderer.domElement.addEventListener('pointerup', ev => {
    activePtrs = Math.max(0, activePtrs - 1);
    if (tapMulti || !tapStart || activePtrs > 0) return;
    const touch = ev.pointerType === 'touch';
    const moved = Math.hypot(ev.clientX - tapStart.x, ev.clientY - tapStart.y);
    // Fingers wobble far more than mice — give touch a much looser tap slop,
    // and pick from where the finger LANDED (lift-off drifts).
    const start = tapStart;
    tapStart = null;
    if (moved > (touch ? 22 : 7)) return;
    pick(touch
      ? { clientX: start.x, clientY: start.y, pointerType: 'touch' }
      : ev);
  });
  function pick(ev) {
    // Fat-finger assist: touch taps also try a ring of nearby sample points,
    // so a near-miss still lands on the intended fish/coral/button. Mouse
    // clicks stay pixel-precise (a single sample).
    const pts = [[ev.clientX, ev.clientY]];
    if (ev.pointerType === 'touch') {
      for (const r of [14, 28]) {
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + (r === 28 ? 0.39 : 0);
          pts.push([ev.clientX + Math.cos(a) * r, ev.clientY + Math.sin(a) * r]);
        }
      }
    }
    const setFrom = (pt) => {
      ptr.x = (pt[0] / window.innerWidth) * 2 - 1;
      ptr.y = -(pt[1] / window.innerHeight) * 2 + 1;
      ray.setFromCamera(ptr, camera);
    };
    const castAll = (objs, recursive = false) => {
      for (const pt of pts) {
        setFrom(pt);
        const hit = ray.intersectObjects(objs, recursive)[0]?.object;
        if (hit) return hit;
      }
      return null;
    };
    const castOne = (obj) => {
      for (const pt of pts) {
        setFrom(pt);
        if (ray.intersectObject(obj, true).length) return true;
      }
      return false;
    };

    // A glowing spark (Bioluminescence Night) pops for a bubble of energy.
    if (glowSparks.length) {
      const sp = castAll(glowSparks.map(s => s.m), true);
      if (sp) { const i = glowSparks.findIndex(s => s.m === sp || s.m === sp.parent); if (i >= 0) { popSpark(i); return; } }
    }
    // Poking Bubbles takes priority — it has sensors, and feelings.
    if (castOne(drone)) {
      if (droneState === 'napping') droneWake(true);
      else droneTrigger('tapped');
      return;
    }

    // Expansion plots: tap a "＋" marker to buy that 5×5 patch with polyps.
    const eHit = castAll(expMarkers.filter(m => m.visible));
    if (eHit) { tryBuyExpansion(eHit); return; }

    // Easter eggs — poke the oddities out on the dunes.
    const gHit = castAll(eggs, true);
    if (gHit?.userData.egg) { eggFound(gHit.userData.egg); return; }

    if (selected.type === 'remove') {
      const sHit = castAll(stationGroups, true);
      if (sHit) { const g = ancestorWith(sHit, 'station'); if (g) removeStationGroup(g); return; }
      const cHit = castAll(corals, true);
      if (cHit) { const g = ancestorWith(cHit, 'entry'); if (g) removeCoralGroup(g); return; }
      const fHit = castAll(fishes.map(f => f.g), true);
      if (fHit) { const g = ancestorWith(fHit, 'stateRef'); if (g) removeFishGroup(g); return; }
      return;
    }

    // Petting: tap a fish and it reacts in character.
    {
      const fHit = castAll(fishes.map(f => f.g), true);
      if (fHit) {
        const g = ancestorWith(fHit, 'stateRef');
        const st = g?.userData.stateRef;
        if (st) {
          petFish(st);
          showFishToast(FISH_SPECIES[st.id] ?? LOCAL_SPECS[st.id]);
          return;
        }
      }
    }

    // Tap Skip-7 or his counter to open the Pearl Market.
    if (castAll([skip7], true)) { openCounter(); return; }
    // Tap the outcrop — nest, market stall, or rocks — to open Nest & Market.
    if (castAll([outcrop], true)) { openNest(); return; }
    // Tap a station or placed coral for its upgrade menu — before placement.
    const stHit = castAll(stationGroups, true);
    if (stHit) {
      const g = ancestorWith(stHit, 'station');
      if (g) { openStationUpgrade(g); return; }
    }
    const coralHit = castAll(corals, true);
    if (coralHit) {
      const g = ancestorWith(coralHit, 'entry');
      if (g) { openUpgrade(g); return; }
    }
    // Placement targets (tiles, open water) are large — aim with the primary
    // point only, so assist samples can't shift which tile you tapped.
    setFrom(pts[0]);
    if (selected.type === 'coral') {
      const t = ray.intersectObjects(tiles, false)[0]?.object;
      if (t?.userData.napped) { flash(rateEl, 'Bubbles is napping there 💤'); return; }
      if (!t || t.userData.occupied) return;
      if (!zoneCheck(selected.spec, t.userData.biome)) return;
      if (!charge(selected.spec, CORAL_COST)) return;
      addCoral(selected.spec, t);
      if (placedCorals.length === 1) droneTrigger('firstCoral');
      ev3Record('place_coral'); dqRecord('place_coral');
      recomputeRates(); refreshProgress(); refreshHud(); save();
    } else if (selected.type === 'station') {
      const t = ray.intersectObjects(tiles, false)[0]?.object;
      if (!t) return;
      const { biome: b, c, r } = t.userData;
      if (!zoneCheck(selected.spec, b)) return;
      const quad = stationQuad(b, c, r);
      if (quad.some(q => !q || q.userData.occupied)) {
        flash(rateEl, 'needs a free 2×2 area'); return;
      }
      if (!charge(selected.spec, {})) return;
      addStation(b, c, r, 1);
      refreshProgress(); refreshHud(); save();
    } else if (selected.type === 'feed') {
      const hit = ray.intersectObject(floor, false)[0];
      if (!hit) return;
      const nowMs = performance.now();
      if (nowMs < feedCd) { flash(rateEl, 'the flakes are still settling'); return; }
      feedCd = nowMs + 2500;
      dropFood(hit.point.x, hit.point.z,
        Math.min(hit.point.y + 5, SURFACE_Y - 1.2));
      tutNote('feed');
    } else {
      const hit = ray.intersectObject(floor, false)[0];
      if (!hit) return;
      const zone = zoneAt(hit.point.x);
      if (!zoneCheck(selected.spec, zone.id)) return;
      if (!charge(selected.spec, FISH_COST)) return;
      const st = fishState(selected.spec, hit.point.x, hit.point.z, fishes.length, zone);
      const g = attachFish(selected.spec, st, true);
      const rec = fishSaveData(st); placedFish.push(rec); g.userData.saveRef = rec;
      if (placedFish.length === 1) droneTrigger('firstFish');
      ev3Record('hatch_fish'); dqRecord('hatch_fish');
      refreshProgress(); refreshHud(); save();
    }
  }

  window.addEventListener('beforeunload', save);
  const saveTimer = setInterval(save, 5000);

  // ── Hydrothermal vent — native to the twilight basin ─────────────────────────
  const ventX = 46, ventZ = -16;
  const { plumeUpdate } = buildVent(scene,
    new THREE.Vector3(ventX, terrainHeight(ventX, ventZ), ventZ));

  // ── Marine snow ──────────────────────────────────────────────────────────────
  const SNOW = 380;
  const snowGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(SNOW * 3);
  for (let i = 0; i < SNOW; i++) {
    sp[i * 3] = (Math.cos(i * 12.9) * 0.5 + 0.5) * 104 - 52;
    sp[i * 3 + 1] = (Math.sin(i * 7.3) * 0.5 + 0.5) * 29 - 5;
    sp[i * 3 + 2] = (Math.cos(i * 4.1) * 0.5 + 0.5) * 104 - 52;
  }
  snowGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({
    color: 0xbfe6ff, size: 0.12, transparent: true, opacity: 0.5, depthWrite: false }));
  scene.add(snow);

  // ── Bubbles — essence streaming up from the living reef ─────────────────────
  const BUBBLE_N = 90;
  const brng = mulberry32(2025);
  const bubbleGeo = new THREE.BufferGeometry();
  const bpArr = new Float32Array(BUBBLE_N * 3);
  const bubbleData = [];
  function bubbleSpawn(i) {
    let x, z, y;
    if (corals.length && brng() < 0.8) {
      // Most bubbles rise from placed corals — the reef literally makes essence.
      const src = corals[Math.floor(brng() * corals.length)];
      x = src.position.x + (brng() - 0.5) * 1.2;
      z = src.position.z + (brng() - 0.5) * 1.2;
      y = src.position.y + 0.3 + brng() * 0.8;
    } else {
      x = 1 + (brng() - 0.5) * 100;
      z = (brng() - 0.5) * 44;
      y = terrainHeight(x, z) + 0.3;
    }
    bpArr[i * 3] = x; bpArr[i * 3 + 1] = y; bpArr[i * 3 + 2] = z;
    bubbleData[i] = {
      baseX: x, speed: 0.5 + brng() * 0.9,
      wobA: brng() * 6.28, wobW: 1 + brng() * 2,
      top: Math.min(y + 7 + brng() * 6, SURFACE_Y - 0.15),   // bubbles pop at the surface
    };
  }
  for (let i = 0; i < BUBBLE_N; i++) bubbleSpawn(i);
  bubbleGeo.setAttribute('position', new THREE.BufferAttribute(bpArr, 3));
  const bubbleSprite = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d');
    const grd = ctx.createRadialGradient(16, 16, 2, 16, 16, 15);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd.addColorStop(0.5, 'rgba(220,240,255,0.2)');
    grd.addColorStop(0.85, 'rgba(205,235,255,0.6)');   // bright rim
    grd.addColorStop(1, 'rgba(205,235,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(16, 16, 15, 0, 7); ctx.fill();
    return new THREE.CanvasTexture(c);
  })();
  const bubbles = new THREE.Points(bubbleGeo, new THREE.PointsMaterial({
    map: bubbleSprite, color: 0xcfeeff, size: 0.32, transparent: true,
    opacity: 0.8, depthWrite: false, sizeAttenuation: true }));
  scene.add(bubbles);
  // ── ✨ Bioluminescence Night ────────────────────────────────────────────────
  // For the two winter months the nights are the show: the water goes deep
  // indigo and much darker, every glowing thing burns brighter, countless blue
  // plankton drift through the reef, and now and then a brighter spark floats
  // by — tap it for a pop and a bubble of energy. `bioNight` is 1 while the
  // event runs (daytime is unchanged; everything scales with nf).
  const bioNight = () => (liveEvent(EV_TODAY())?.baseId === 'bioluminescence_night' ? 1 : 0);
  const PLANKTON_N = 700;
  const plGeo = new THREE.BufferGeometry();
  const plArr = new Float32Array(PLANKTON_N * 3);
  const plData = [];
  const prng = mulberry32(4242);
  for (let i = 0; i < PLANKTON_N; i++) {
    const x = (prng() - 0.5) * 110, z = (prng() - 0.5) * 50;
    const y = terrainHeight(x, z) + 0.4 + prng() * 7;
    plArr[i * 3] = x; plArr[i * 3 + 1] = y; plArr[i * 3 + 2] = z;
    plData.push({ x, y, z, a: prng() * 6.28, w: 0.3 + prng() * 0.6, r: 0.3 + prng() * 0.9 });
  }
  plGeo.setAttribute('position', new THREE.BufferAttribute(plArr, 3));
  const plankton = new THREE.Points(plGeo, new THREE.PointsMaterial({
    map: bubbleSprite, color: 0x62c8ff, size: 0.16, transparent: true, opacity: 0,
    depthWrite: false, sizeAttenuation: true, blending: THREE.AdditiveBlending }));
  plankton.visible = false;
  scene.add(plankton);
  // ── Bioluminescent light pool ───────────────────────────────────────────────
  // Glowing coral, fish and sparks cast REAL light on what's around them: a
  // fixed pool of PointLights (a constant count, so shaders never recompile)
  // is dealt out a few times a second to the brightest sources nearest the
  // camera's focus, and follows them every frame. Everything else keeps its
  // halo. Lanterns throw furthest; Bioluminescence Night turns it all up.
  // Pool size is the real cost knob: every light is shaded on every lit
  // fragment. Phones and tablets get fewer; desktops light the whole reef.
  const BIO_POOL_N = (navigator.maxTouchPoints > 1 || /iPhone|iPad|Android/i.test(navigator.userAgent)) ? 10 : 16;
  const bioPool = [];
  for (let i = 0; i < BIO_POOL_N; i++) {
    const pl = new THREE.PointLight(0xffffff, 0, 12, 1.7);
    pl.userData.keep = true;
    scene.add(pl);
    bioPool.push({ pl, src: null });
  }
  let bioDealAt = 0;
  const _bioTmp = new THREE.Vector3();
  function tickBioLights(t, dt, nf, dk) {
    if (nf < 0.04) { for (const s of bioPool) { s.pl.intensity = 0; s.src = null; } return; }
    if (t > bioDealAt) {
      bioDealAt = t + 0.35;
      const focus = controls.target;
      const cands = [];
      for (const g of corals) {
        if (!g.userData.bio || g.userData.grow < 0.3) continue;
        const d = g.position.distanceTo(focus);
        cands.push({ obj: g, y: 0.9, color: g.userData.spec?.accentColor ?? g.userData.spec?.color ?? 0x7fd8ff,
          power: (g.userData.lampBoost ?? 1) * 5.5, range: LANTERN_CORALS.has(g.userData.spec?.id) ? 16 : 11, score: d });
      }
      for (const f of fishes) {
        if (!f.g.userData.bio) continue;
        const spec = FISH_SPECIES[f.id] ?? LOCAL_SPECS[f.id];
        cands.push({ obj: f.g, y: 0.15, color: spec?.accentColor ?? spec?.color ?? 0x7fd8ff,
          power: f.g.userData.big ? 4.5 : 3.0, range: f.g.userData.big ? 13 : 9, score: f.g.position.distanceTo(focus) + 2 });
      }
      for (const sp of glowSparks) cands.push({ obj: sp.m, y: 0, color: 0x9fe8ff, power: 2.6, range: 8, score: sp.m.position.distanceTo(focus) });
      cands.sort((a, b) => a.score - b.score);
      const want = cands.slice(0, BIO_POOL_N);
      // Keep lights already on a chosen source; hand freed lights to newcomers.
      const kept = new Set();
      for (const s of bioPool) {
        const still = s.src && want.find(w => w.obj === s.src.obj);
        if (still) { s.src = still; kept.add(still); } else s.src = null;
      }
      for (const w of want) {
        if (kept.has(w)) continue;
        const free = bioPool.find(s => !s.src);
        if (!free) break;
        free.src = w; free.pl.color.setHex(w.color); free.pl.distance = w.range; free.pl.intensity = 0;
      }
    }
    const boost = 1 + dk * 0.8;
    for (const s of bioPool) {
      const src = s.src;
      if (!src || !src.obj.parent) { s.pl.intensity += (0 - s.pl.intensity) * Math.min(1, dt * 6); continue; }
      src.obj.getWorldPosition(_bioTmp);
      s.pl.position.set(_bioTmp.x, _bioTmp.y + src.y, _bioTmp.z);
      const fl = src.obj.userData.bioFlicker ?? (0.9 + Math.sin(t * 1.7 + (src.obj.id % 7)) * 0.1);
      const target = nf * src.power * fl * boost;
      s.pl.intensity += (target - s.pl.intensity) * Math.min(1, dt * 5);
    }
  }
  const glowSparks = [];   // the tappable ones: { m, born, life, vx, vy, vz }
  const glowSparkMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.95 });
  const glowSparkGeo = new THREE.SphereGeometry(0.16, 8, 6);
  let sparkNext = 0;
  function spawnSpark(t) {
    const m = new THREE.Mesh(glowSparkGeo, glowSparkMat);
    // Starts near where the camera looks, drifting across the view.
    const c = controls.target;
    m.position.set(c.x + (Math.random() - 0.5) * 16, c.y + 1 + Math.random() * 3, c.z + (Math.random() - 0.5) * 12);
    scene.add(m);
    glowSparks.push({ m, born: t, life: 14 + Math.random() * 8, vx: (Math.random() - 0.5) * 0.6, vy: 0.08, vz: (Math.random() - 0.5) * 0.6 });
  }
  function popSpark(i) {
    const s = glowSparks[i];
    scene.remove(s.m);
    glowSparks.splice(i, 1);
    be = Math.min(be + 1, beMax);
    hudGain('be', 1);
    flash(rateEl, '✨ pop! +1 🫧', '#9fe8ff');
    if (ev3 && ev3Live()) ev3Record('earn_be', 1);
  }
  function tickBioNight(t, dt, nf) {
    const bn = bioNight();
    const glow = nf * bn;
    plankton.visible = glow > 0.02;
    if (plankton.visible) {
      plankton.material.opacity = glow * 0.85;
      const pos = plankton.geometry.attributes.position;
      for (let i = 0; i < PLANKTON_N; i++) {
        const d = plData[i];
        pos.setXYZ(i, d.x + Math.sin(t * d.w + d.a) * d.r, d.y + Math.sin(t * d.w * 0.7 + d.a * 2) * 0.3, d.z + Math.cos(t * d.w + d.a) * d.r);
      }
      pos.needsUpdate = true;
    }
    if (bn && nf > 0.6) {
      if (t > sparkNext) { spawnSpark(t); sparkNext = t + 25 + Math.random() * 35; }
    }
    for (let i = glowSparks.length - 1; i >= 0; i--) {
      const s = glowSparks[i];
      const age = t - s.born;
      if (age > s.life || nf < 0.3) { scene.remove(s.m); glowSparks.splice(i, 1); continue; }
      s.m.position.x += s.vx * dt; s.m.position.y += (s.vy + Math.sin(t * 2 + s.born) * 0.15) * dt; s.m.position.z += s.vz * dt;
      const fade = Math.min(1, age / 1.5, (s.life - age) / 1.5);
      s.m.scale.setScalar((0.8 + Math.sin(t * 5 + s.born) * 0.2) * (0.3 + 0.7 * fade));
    }
    return bn;
  }

  // Food pellets — dropped in feed mode, they sink and get mobbed.
  const PELLET_N = 24;
  const pellets = [];             // { x, y, z }
  const pelletGeo = new THREE.BufferGeometry();
  pelletGeo.setAttribute('position',
    new THREE.BufferAttribute(new Float32Array(PELLET_N * 3).fill(-100), 3));
  const pelletPts = new THREE.Points(pelletGeo, new THREE.PointsMaterial({
    map: bubbleSprite, color: 0xd8a05a, size: 0.16, transparent: true,
    opacity: 0.95, depthWrite: false, sizeAttenuation: true }));
  scene.add(pelletPts);
  let feedCd = 0;
  function dropFood(x, z, y) {
    for (let i = 0; i < 8 && pellets.length < PELLET_N; i++) {
      pellets.push({
        x: x + (Math.random() - 0.5) * 1.6,
        y: y + Math.random() * 0.6,
        z: z + (Math.random() - 0.5) * 1.6,
      });
    }
  }

  // Hearts — a little affection burst when a fish gets petted or fed.
  const HEART_N = 16;
  const hearts = [];              // { x, y, z, until }
  const heartGeo = new THREE.BufferGeometry();
  heartGeo.setAttribute('position',
    new THREE.BufferAttribute(new Float32Array(HEART_N * 3).fill(-100), 3));
  const heartPts = new THREE.Points(heartGeo, new THREE.PointsMaterial({
    map: bubbleSprite, color: 0xff8fb3, size: 0.3, transparent: true,
    opacity: 0.9, depthWrite: false, sizeAttenuation: true }));
  scene.add(heartPts);
  function heartBurst(p, n = 3) {
    const nowMs = performance.now();
    for (let i = 0; i < n; i++) {
      hearts.push({ x: p.x + (Math.random() - 0.5) * 0.5, y: p.y + 0.3 + i * 0.15,
        z: p.z + (Math.random() - 0.5) * 0.5, until: nowMs + 1400 });
      if (hearts.length > HEART_N) hearts.shift();
    }
  }

  // Ink clouds — startled cephalopods leave one behind.
  const inkClouds = [];           // { mesh, until }
  function inkCloud(p) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x101018, transparent: true, opacity: 0.55, roughness: 1, depthWrite: false }));
    m.position.copy(p);
    scene.add(m);
    inkClouds.push({ mesh: m, until: performance.now() + 2600 });
  }

  // Cleaning sparkles — golden glints orbiting each fish mid-scrub.
  const SPARK_N = 48;
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position',
    new THREE.BufferAttribute(new Float32Array(SPARK_N * 3).fill(-100), 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    map: bubbleSprite, color: 0xfff2a8, size: 0.22, transparent: true,
    opacity: 0.95, depthWrite: false, sizeAttenuation: true }));
  scene.add(sparks);

  // ── Render loop ──────────────────────────────────────────────────────────────
  const clock = new THREE.Clock();
  const SUN_DAY = new THREE.Color(0xeaf6ff), SUN_NIGHT = new THREE.Color(0x8fb3e8);
  const FOG_DAY = new THREE.Color(0x11486a), FOG_NIGHT = new THREE.Color(0x071726);
  const FOG_BIO = new THREE.Color(0x040a1c);   // Bioluminescence Night: deep indigo
  let running = true;
  let lastSlow = 0;
  // Adaptive resolution. Pixel count is the one cost that scales with nothing
  // the player did, so it's the first thing to give: if frames run slow for a
  // few seconds the render scale steps down (never below 1×), and it steps back
  // up only after a long comfortable stretch, so it can't oscillate.
  const PR_MAX = Math.min(window.devicePixelRatio, 2), PR_STEPS = [1, 1.25, 1.5, 2].filter(v => v <= PR_MAX + 0.01);
  if (!PR_STEPS.includes(PR_MAX)) PR_STEPS.push(PR_MAX);
  let prIdx = PR_STEPS.length - 1, frameAvg = 16, slowFor = 0, fastFor = 0;
  function adaptResolution(dt) {
    if (dt <= 0 || dt > 0.25) return;                   // ignore tab-switch hitches
    while (prIdx > 0 && PR_STEPS[prIdx] > prCeiling) prIdx--;   // a lost context lowers the ceiling for good
    frameAvg += (dt * 1000 - frameAvg) * 0.05;
    slowFor = frameAvg > 27 ? slowFor + dt : 0;          // under ~37 fps
    fastFor = frameAvg < 15 ? fastFor + dt : 0;          // comfortably above 60
    let next = prIdx;
    if (slowFor > 3 && prIdx > 0) next = prIdx - 1;
    else if (fastFor > 20 && prIdx < PR_STEPS.length - 1 && PR_STEPS[prIdx + 1] <= prCeiling) next = prIdx + 1;
    if (next === prIdx) return;
    prIdx = next; slowFor = 0; fastFor = 0; frameAvg = 18;
    renderer.setPixelRatio(PR_STEPS[prIdx]);
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = clock.getDelta();
    const t = clock.getElapsedTime();
    adaptResolution(dt);
    // Slow tick (1 Hz): egg hatching and coral growth run on absolute clocks.
    if (t - lastSlow >= 1) {
      lastSlow = t;
      nestTick();
      for (const g of corals) growCoral(g);
      seedTick();
      // 🔬 Overdue survey with Bubbles not on site (e.g. loaded a save whose
      // clock ran out offline before she reaches the grove): resolve directly.
      // When she IS on site, her scan loop delivers the verdict — the final
      // sweep flashes green (find) or yellow (nothing new left).
      if (survey && Date.now() >= survey.at
          && droneState !== 'surveying' && droneState !== 'toSurvey') {
        resolveSurvey();
      }
      // 🐟 Fragment finders — a few species, incredibly rarely.
      let finders = 0;
      for (const f of fishes) if (FRAGMENT_FINDERS.has(f.id)) finders++;
      if (finders && Math.random() < finders * FRAGMENT_CHANCE) {
        const pool = discoverableCorals();
        if (pool.length) {
          const spec = weightedPick(pool);
          discoverCoral(spec, `A forager surfaced a coral fragment — ${spec.name} recorded!`);
        }
      }
      // ⚖ Harmony settlement — larvae settle wild on a reef held in harmony.
      if (harmony >= SETTLE_HARMONY && Math.random() < SETTLE_CHANCE) {
        const pool = discoverableCorals();
        if (pool.length) {
          const spec = weightedPick(pool);
          const spots = tiles.filter(tl => !tl.userData.occupied
            && zoneUnlocked(tl.userData.biome) && matchesBiome(spec, tl.userData.biome));
          if (spots.length) {
            addCoral(spec, spots[Math.floor(Math.random() * spots.length)], 0);
            droneQueue.push(`Larvae settled while the reef held its harmony — ${spec.name}, wild-grown!`);
            flash(rateEl, `📖 ${spec.name} settled!`, '#ffd27f');
            recomputeRates(); refreshProgress(); refreshHud(); save();
          }
        }
      }
      if (bubblesCounter.open) fillNest();   // live countdowns, ticked in place
      music.setNight(nightFactor);
    }
    // Eggs wobble harder as hatch time closes in.
    if (nestEggGroup) {
      for (const egg of nestEggGroup.children) {
        const d = nestEggs[egg.userData.eggIdx];
        const urg = d ? clamp(1 - (d.at - Date.now()) / 15000, 0, 1) : 0;
        egg.rotation.z = Math.sin(t * (4 + urg * 8) + egg.userData.eggIdx * 2) * (0.05 + urg * 0.22);
      }
    }

    be = Math.min(be + incomePerSec * dt, beMax);
    polyps = Math.min(polyps + polypPerSec * dt, POLYP_MAX);
    ev3Record('earn_be', incomePerSec * dt);
    dqRecord('earn_be', incomePerSec * dt);
    refreshHud();

    // Day/night — Classic's cycle: darken and cool the water, light the biolums.
    timeOfDay = (timeOfDay + (dt * 1000) / DAY_MS) % 1;
    const elevation = Math.sin((timeOfDay - 0.25) * Math.PI * 2);
    const nTarget = clamp(-elevation * 1.6, 0, 1);
    nightFactor += (nTarget - nightFactor) * Math.min(1, dt / 0.6);
    const nf = nightFactor;
    if (!sawNight && nf > 0.9) { sawNight = true; checkAch(); }
    // Bioluminescence Night: the dark goes deeper and the glow goes brighter.
    const bn = tickBioNight(t, dt, nf);
    const dk = nf * bn;
    sun.intensity = 1.7 - nf * 1.35 - dk * 0.25;
    sun.color.copy(SUN_DAY).lerp(SUN_NIGHT, nf);
    hemi.intensity = 1.05 - nf * 0.65 - dk * 0.28;
    fill.intensity = 0.5 - nf * 0.25 - dk * 0.15;
    scene.backgroundIntensity = 1 - nf * 0.72 - dk * 0.2;
    scene.fog.color.copy(FOG_DAY).lerp(FOG_NIGHT, nf).lerp(FOG_BIO, dk);
    // The blue water haze belongs to the water: once the camera climbs out,
    // the air clears and the beach reads in true colors at any distance.
    const wantClear = clamp((camera.position.y - SURFACE_Y) / 3, 0, 1);
    fogEase += (wantClear - fogEase) * Math.min(1, dt * 3);
    scene.fog.density = 0.011 * (1 - fogEase * 0.93);
    floorMat.emissiveIntensity = 0.13 * (1 - nf * 0.75);   // moonlit caustics are faint

    for (const g of corals) {
      const ls = g.userData.levelScale ?? 1;
      if (g.userData.grow < 1) {
        g.userData.grow = Math.min(1, g.userData.grow + dt * 2.2);
        const s = g.userData.grow;
        g.scale.setScalar(s * ls * (1 + 0.12 * (1 - s)));
      } else {
        g.scale.setScalar(ls);   // hold at level-scaled size (updates on upgrade)
      }
      g.rotation.z = Math.sin(t * 0.8 + g.userData.seed) * 0.04;
      if (g.userData.glowMats) {
        for (const m of g.userData.glowMats) m.emissiveIntensity = 0.5 + nf * 0.85 + dk * 0.9;
      }
      if (g.userData.bio) g.userData.bioFlicker = 0.85 + Math.sin(t * 1.3 + g.userData.seed) * 0.15;
    }
    // Schools: refresh each shoal's shared waypoint and flock averages once,
    // then members steer with boids forces in the fish loop below.
    for (const s of schools.values()) {
      const n = s.members.length;
      if (!n) continue;
      let cx = 0, cy = 0, cz = 0, vx = 0, vy = 0, vz = 0;
      for (const m of s.members) {
        cx += m.px; cy += m.py; cz += m.pz; vx += m.vx; vy += m.vy; vz += m.vz;
      }
      s.cx = cx / n; s.cy = cy / n; s.cz = cz / n;
      s.avx = vx / n; s.avy = vy / n; s.avz = vz / n;
      const dx = s.tx - s.cx, dy = s.ty - s.cy, dz = s.tz - s.cz;
      if (t > s.until || dx * dx + dy * dy + dz * dz < 4) newSchoolTarget(s, t);
      if (pellets.length) {
        // Feeding frenzy: the whole school breaks for the nearest flakes.
        let best = null, bd = 900;
        for (const pl of pellets) {
          const d = (s.cx - pl.x) ** 2 + (s.cy - pl.y) ** 2 + (s.cz - pl.z) ** 2;
          if (d < bd) { bd = d; best = pl; }
        }
        if (best) { s.tx = best.x; s.ty = best.y; s.tz = best.z; s.until = t + 1; }
      }
    }
    const frameMs = performance.now();
    for (const f of fishes) {
      // Cleaning visit ends when the timer (or the station) is gone.
      if (f.clean && ((f.clean.until && frameMs > f.clean.until) || !stationGroups.includes(f.clean.s))) {
        const ci = f.clean.s.userData?.clients?.indexOf(f);
        if (ci >= 0) f.clean.s.userData.clients.splice(ci, 1);
        f.cleanCd = frameMs + CLEAN_COOLDOWN_MS;
        f.clean = null;
      }
      // Classic's day/night homing: day-hiders tuck into a Reef Grotto by day;
      // ordinary fish bed down (Anemone Haven if one has room) overnight;
      // nocturnal fish stay out after dark. No home → they just slow down.
      const wantsHide = !f.benthic && !f.clean
        && (f.g.userData.hider ? nf < 0.45 : (nf > 0.55 && !f.noct));
      if (wantsHide && !f.home) claimHome(f);
      else if (!wantsHide && f.home) releaseHome(f);
      const slow = wantsHide && !f.home ? 0.35 : 1;
      if (f.clean) {
        // Travel like a fish, not a ghost: rise to cruising height, swim over
        // the reef to the station, then drop onto a tendril slot and scrub.
        const s = f.clean.s;
        const a = f.clean.slot * 2.1 + 0.7;
        const slotX = s.position.x + Math.cos(a) * 1.4;
        const slotZ = s.position.z + Math.sin(a) * 1.4;
        const cur = f.g.position;
        const spd = f.spd ?? (0.6 + (FISH_SPECIES[f.id]?.speed ?? 1) * 0.9);
        f.clean.phase ??= 'cruise';
        if (f.clean.phase === 'cruise') {
          // Waypoint above the slot, high enough to clear coral and rockwork.
          const cruiseY = Math.max(cur.y, s.position.y + 3.2);
          const dx = slotX - cur.x, dy = cruiseY - cur.y, dz = slotZ - cur.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const step = Math.min(spd * 1.15 * dt, d);
          if (d > 0.001) {
            cur.set(cur.x + (dx / d) * step, cur.y + (dy / d) * step, cur.z + (dz / d) * step);
            const want = Math.atan2(dx, dz);
            let dh = want - f.g.rotation.y;
            while (dh > Math.PI) dh -= Math.PI * 2;
            while (dh < -Math.PI) dh += Math.PI * 2;
            f.g.rotation.y += dh * Math.min(1, dt * 2.2);
            f.g.rotation.x = -Math.asin(clamp(dy / Math.max(d, 0.001), -1, 1)) * 0.4;
          }
          if (dx * dx + dz * dz < 0.5) f.clean.phase = 'descend';
        } else if (f.clean.phase === 'descend') {
          const ty = s.position.y + 1.0;
          const k = Math.min(1, dt * 1.8);
          cur.set(cur.x + (slotX - cur.x) * k, cur.y + (ty - cur.y) * k, cur.z + (slotZ - cur.z) * k);
          f.g.rotation.x *= 0.88;
          if (Math.abs(cur.y - ty) < 0.25) {
            f.clean.phase = 'scrub';
            f.clean.until = frameMs + CLEAN_DURATION_MS;   // the clock starts at the chair
          }
        } else {
          // Scrubbing: hold the slot with a gentle hover.
          const ty = s.position.y + 1.0 + Math.sin(t * 1.4 + f.phase) * 0.08;
          const k = Math.min(1, dt * 2);
          cur.set(cur.x + (slotX - cur.x) * k, cur.y + (ty - cur.y) * k, cur.z + (slotZ - cur.z) * k);
          f.g.rotation.x *= 0.9;
        }
        if (f.px !== undefined) { f.px = cur.x; f.py = cur.y; f.pz = cur.z; }
      } else if (f.home) {
        // Bedding down is a journey, not a teleport: swim to the shelter nose
        // first, then a quick burrow-in wiggle, then a slow-breathing sleep
        // hover (the sideways sleep-lean comes from the roll pass below).
        const hp = f.home.position;
        const tx = hp.x + Math.sin(f.phase * 2.6) * 0.55;
        const tz = hp.z + Math.cos(f.phase * 3.1) * 0.55;
        const cur = f.g.position;
        const dxh = tx - cur.x, dzh = tz - cur.z;
        if (!f.bed && dxh * dxh + dzh * dzh > 2.6) {
          const ty = Math.max(hp.y + 1.4, terrainHeight(cur.x, cur.z) + 0.9);
          const dyh = ty - cur.y;
          const d = Math.sqrt(dxh * dxh + dyh * dyh + dzh * dzh);
          const step = Math.min((f.spd ?? 1.2) * 1.05 * dt, d);
          cur.set(cur.x + (dxh / d) * step, cur.y + (dyh / d) * step, cur.z + (dzh / d) * step);
          const want = Math.atan2(dxh, dzh);
          let dh = want - f.g.rotation.y;
          while (dh > Math.PI) dh -= Math.PI * 2;
          while (dh < -Math.PI) dh += Math.PI * 2;
          f.g.rotation.y += dh * Math.min(1, dt * 2.4);
          f.g.rotation.x = -Math.asin(clamp(dyh / Math.max(d, 0.001), -1, 1)) * 0.4;
        } else {
          if (!f.bed) f.bed = t;                      // arrived — tuck in
          const settle = clamp((t - f.bed) / 1.1, 0, 1);
          const ty = hp.y + 0.5 - 0.14 * settle + Math.sin(t * 0.8 + f.phase) * 0.05;
          const k = Math.min(1, dt * 1.6);
          cur.set(cur.x + (tx - cur.x) * k, cur.y + (ty - cur.y) * k, cur.z + (tz - cur.z) * k);
          f.g.rotation.y += Math.sin(t * 13 + f.phase) * 0.3 * (1 - settle);   // burrow wiggle
          f.g.rotation.x *= 0.9;
        }
        if (f.px !== undefined) { f.px = cur.x; f.py = cur.y; f.pz = cur.z; }
      } else if (f.benthic) {
        // Crawlers: creep along the terrain toward a nearby sand waypoint,
        // pausing between hops. No bob, no pitch, no mid-water anything.
        const dx = f.tx - f.px, dz = f.tz - f.pz;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < 0.35) {
          if (f.rest === undefined) f.rest = t + 3 + (f.phase % 6);
          else if (t > f.rest) { newCrawlTarget(f); f.rest = undefined; }
        } else {
          const step = Math.min(f.spd * dt, d);
          f.px += (dx / d) * step; f.pz += (dz / d) * step;
          const want = Math.atan2(dx, dz);
          let dh = want - f.hdg;
          while (dh > Math.PI) dh -= Math.PI * 2;
          while (dh < -Math.PI) dh += Math.PI * 2;
          f.hdg += dh * Math.min(1, dt * 0.9);
        }
        f.py = terrainHeight(f.px, f.pz) + f.lift;
        f.g.position.set(f.px, f.py, f.pz);
        f.g.rotation.y = f.hdg;
        f.g.rotation.x = 0;
      } else if (f.school) {
        // Boids: seek the shoal's shared waypoint (offset per fish so the
        // school keeps volume), align with and stay near flock-mates, and
        // hold personal space.
        const s = f.school;
        const ox = Math.sin(f.phase * 3.7 + t * 0.4) * 1.3;
        const oy = Math.sin(f.phase * 2.3 + t * 0.3) * 0.7;
        const oz = Math.cos(f.phase * 4.1 + t * 0.35) * 1.3;
        let ax = s.tx + ox - f.px, ay = s.ty + oy - f.py, az = s.tz + oz - f.pz;
        const ad = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
        ax /= ad; ay /= ad; az /= ad;
        ax += (s.cx - f.px) * 0.05 + s.avx * 0.16;
        ay += (s.cy - f.py) * 0.05 + s.avy * 0.16;
        az += (s.cz - f.pz) * 0.05 + s.avz * 0.16;
        for (const m of s.members) {
          if (m === f) continue;
          const sx = f.px - m.px, sy = f.py - m.py, sz = f.pz - m.pz;
          const d2 = sx * sx + sy * sy + sz * sz;
          if (d2 < 1.1 && d2 > 1e-6) {
            const dd = Math.sqrt(d2), k = ((1.05 - dd) * 2.4) / dd;
            ax += sx * k; ay += sy * k; az += sz * k;
          }
        }
        const al = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
        const k = Math.min(1, dt * 2.4);
        const sp = f.spd * slow;
        f.vx += ((ax / al) * sp - f.vx) * k;
        f.vy += ((ay / al) * sp - f.vy) * k;
        f.vz += ((az / al) * sp - f.vz) * k;
        f.px += f.vx * dt; f.py += f.vy * dt; f.pz += f.vz * dt;
        const [bx0, bx1] = ZONE_BAND[f.b] ?? ZONE_BAND.coral;
        f.px = clamp(f.px, bx0 + 1, bx1 - 1);
        f.pz = clamp(f.pz, -25, 25);
        f.py = clamp(f.py, terrainHeight(f.px, f.pz) + 0.9, 10.5);
        const spdNow = Math.sqrt(f.vx * f.vx + f.vz * f.vz);
        if (spdNow > 0.05) {
          const want = Math.atan2(f.vx, f.vz);
          let dh = want - f.hdg;
          while (dh > Math.PI) dh -= Math.PI * 2;
          while (dh < -Math.PI) dh += Math.PI * 2;
          f.hdg += dh * Math.min(1, dt * 3.2);
        }
        f.g.position.set(f.px, f.py, f.pz);
        f.g.rotation.y = f.hdg;
        f.g.rotation.x = -Math.atan2(f.vy, Math.max(spdNow, 0.25)) * 0.5;
      } else if (f.roam) {
        // Waypoint steering: swim toward the target, banking the heading round.
        const dx = f.tx - f.px, dy = f.ty - f.py, dz = f.tz - f.pz;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 1.2) newRoamTarget(f);
        else {
          const step = Math.min(f.spd * dt * slow, d);
          f.px += (dx / d) * step; f.py += (dy / d) * step; f.pz += (dz / d) * step;
        }
        const want = Math.atan2(dx, dz);
        let dh = want - f.hdg;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        f.hdg += dh * Math.min(1, dt * 1.8);
        f.g.position.set(f.px, f.py + Math.sin(t * f.bobw + f.phase) * (f.bobAmp ?? 0.15), f.pz);
        f.g.rotation.y = f.hdg;
        f.g.rotation.x = -Math.asin(clamp(dy / Math.max(d, 0.001), -1, 1)) * 0.45 * (f.pitch ?? 1);
      } else {
        // Accumulated angle (not t-derived) so sleepy fish can slow down.
        if (f.ang === undefined) f.ang = f.phase + t * f.w;
        f.ang += f.w * dt * slow;
        const ang = f.ang;
        const x = Math.cos(ang) * f.R + f.cx;
        const z = Math.sin(ang) * f.R + f.cz;
        f.g.position.set(x, f.y + Math.sin(t * f.bobw + f.phase) * f.bob * slow, z);
        const heading = Math.atan2(-Math.sin(ang) * f.w, Math.cos(ang) * f.w);
        f.g.rotation.y = heading;   // sway comes from the swim pass below
      }
      // Fish with nowhere to shelter bed down on the sand right where they are:
      // ease down to the seabed as sleepiness sets in, drift back up on waking.
      f.sink = (f.sink ?? 0)
        + ((wantsHide && !f.home && !f.benthic ? 1 : 0) - (f.sink ?? 0)) * Math.min(1, dt * 0.6);
      if (f.sink > 0.01 && !f.clean && !f.benthic) {
        const gy = terrainHeight(f.g.position.x, f.g.position.z) + 0.5;
        f.g.position.y += (gy - f.g.position.y) * f.sink;
      }
      // ── Locomotion-aware swimming ────────────────────────────────────────────
      // The tail beats in time with true swim speed (sprinters thrash, sleepers
      // barely stir), the head counter-sways against each stroke, pectorals
      // scull hardest at low speed, and the body banks into turns.
      const gp = f.g.position;
      if (f.lpx !== undefined && dt > 1e-4) {
        const inst = Math.sqrt(
          (gp.x - f.lpx) ** 2 + (gp.y - f.lpy) ** 2 + (gp.z - f.lpz) ** 2) / dt;
        f.swim = (f.swim ?? inst) + (Math.min(inst, 12) - (f.swim ?? inst)) * Math.min(1, dt * 5);
      }
      f.lpx = gp.x; f.lpy = gp.y; f.lpz = gp.z;
      const sw = clamp((f.swim ?? 0) / ((f.spd ?? 1.4) + 0.4), 0, 1.4);
      // Bank is measured from heading change, before the sway is layered on.
      let hd = f.g.rotation.y - (f.lh ?? f.g.rotation.y);
      while (hd > Math.PI) hd -= Math.PI * 2;
      while (hd < -Math.PI) hd += Math.PI * 2;
      f.lh = f.g.rotation.y;
      const rollT = f.bed ? (f.phase % 2 < 1 ? 0.35 : -0.35)
        : f.benthic ? 0
        : clamp((dt > 1e-4 ? -hd / dt : 0) * 0.25, -0.5, 0.5) * Math.min(sw, 1);
      f.roll = (f.roll ?? 0) + (rollT - (f.roll ?? 0)) * Math.min(1, dt * 3);
      const ud = f.g.userData;
      f.tailPh = (f.tailPh ?? f.phase) + dt * (2.2 + 10 * Math.min(sw, 1.2));
      if (ud.animate) ud.animate(t, f.phase);
      else if (ud.tail) {
        const amp = 0.16 + 0.42 * Math.min(sw, 1);
        if (ud.tailAxis === 'x') ud.tail.rotation.x = Math.sin(f.tailPh * 0.75) * amp * 0.65;
        else ud.tail.rotation.y = Math.sin(f.tailPh) * amp;
      }
      if (!f.benthic && !ud.animate) {
        f.g.rotation.y += Math.sin(f.tailPh) * (0.02 + 0.05 * Math.min(sw, 1));
      }
      if (ud.pecs) {
        const scull = Math.sin(f.tailPh * 0.55 + f.phase) * (0.5 - 0.34 * Math.min(sw, 1));
        ud.pecs[0].rotation.y = ud.pecs[0].userData.baseYaw + scull;
        if (ud.pecs[1]) ud.pecs[1].rotation.y = ud.pecs[1].userData.baseYaw - scull;
      }
      // Petting reactions overlay whatever the fish was doing.
      if (f.react) {
        if (frameMs > f.react.until) {
          if (f.react.kind === 'roll') f.g.rotation.z = 0;
          f.react = null;
        } else {
          const p = (frameMs - f.react.start) / (f.react.until - f.react.start);
          if (f.react.kind === 'wiggle') f.g.rotation.y += Math.sin(p * 22) * 0.4 * (1 - p);
          if (f.react.kind === 'ink') f.g.rotation.y += Math.sin(p * 30) * 0.25 * (1 - p);
          if (f.react.kind === 'roll') f.g.rotation.z = p * Math.PI * 2;   // barrel roll
        }
      }
      if (f.react?.kind !== 'roll') f.g.rotation.z = f.roll;   // bank / sleep-lean
      // Nocturnal crevice-dwellers tuck away by day — visibly nestled at a
      // grotto if one has room, otherwise vanished into an unseen crevice.
      // Homed sleepers settle slightly smaller; everyone else stays full size.
      if (ud.hider) {
        const k = f.home ? 0.45 + 0.55 * nf : 0.06 + 0.94 * nf;
        f.g.scale.setScalar(ud.baseScale * k);
      } else {
        const puff = f.react?.kind === 'puff'
          ? 1 + Math.sin(Math.min(1, (frameMs - f.react.start) / (f.react.until - f.react.start)) * Math.PI) * 0.4
          : 1;
        const target = ud.baseScale * (f.home ? 0.8 : 1) * puff;
        f.g.scale.setScalar(f.g.scale.x + (target - f.g.scale.x) * Math.min(1, dt * (puff > 1 ? 8 : 2)));
      }
      if (f.g.userData.glowMat) f.g.userData.glowMat.emissiveIntensity = nf * 1.1 + dk * 0.9;
    }
    tickBioLights(t, dt, nf, dk);
    for (const w of weeds) w.rotation.z = Math.sin(t * 0.9 + w.userData.seed) * 0.12;
    for (const o of orbs) {
      o.material.emissiveIntensity = 0.75 + nf * 0.5 + Math.sin(t * 1.6 + o.userData.seed) * 0.35;
    }
    for (const j of jellies) {
      const pulse = Math.sin(t * 1.9 + j.ph);
      j.bell.scale.set(1 - pulse * 0.08, 1 + pulse * 0.16, 1 - pulse * 0.08);
      j.g.position.set(
        j.x + Math.sin(t * 0.11 + j.ph) * j.drift,
        j.baseY + Math.sin(t * 0.32 + j.ph) * 1.1 + pulse * 0.05,
        j.z + Math.cos(t * 0.09 + j.ph * 2) * j.drift);
      j.g.rotation.y = t * 0.1 + j.ph;
      for (const tnt of j.tentacles) {
        tnt.rotation.x = Math.sin(t * 1.3 + j.ph + tnt.userData.a) * 0.18;
        tnt.rotation.z = Math.cos(t * 1.1 + j.ph + tnt.userData.a) * 0.18;
      }
      j.mat.emissiveIntensity = 0.22 + nf * (j.tw ? 1 : 0.45);
    }

    const bpos = bubbles.geometry.attributes.position;
    for (let i = 0; i < BUBBLE_N; i++) {
      const d = bubbleData[i];
      let y = bpos.getY(i) + d.speed * dt;
      if (y > d.top) { bubbleSpawn(i); y = bpArr[i * 3 + 1]; }
      bpos.setY(i, y);
      bpos.setX(i, d.baseX + Math.sin(t * d.wobW + d.wobA) * 0.18);
    }
    bpos.needsUpdate = true;

    caustics.offset.x = t * 0.012 + Math.sin(t * 0.35) * 0.006;
    caustics.offset.y = t * 0.008 + Math.cos(t * 0.28) * 0.006;

    // Ocean surface: waves ripple about the fixed water level; shimmer drifts;
    // the whole sheet moon-dims after dark.
    for (let i = 0; i < surfPos.count; i++) {
      const sx = surfPos.getX(i), sy = surfPos.getY(i);
      surfPos.setZ(i,
        Math.sin(sx * 0.14 + t * 0.9) * 0.24 + Math.cos(sy * 0.17 - t * 0.7) * 0.18);
    }
    surfPos.needsUpdate = true;
    surfGeo.computeVertexNormals();
    surfTex.offset.x = t * 0.009;
    surfTex.offset.y = -t * 0.006;
    surfMat.emissiveIntensity = 0.35 - nf * 0.24;
    surfMat.opacity = 0.4 - nf * 0.08;
    surfTopMat.emissiveIntensity = 0.3 - nf * 0.2;

    // Beach life: gulls wheel above the shoreline, hermit crabs run circuits.
    for (const gl of gulls) {
      const ang = gl.phase + t * gl.w;
      gl.g.position.set(
        gl.cx + Math.cos(ang) * gl.R,
        gl.y + Math.sin(t * 0.7 + gl.phase) * 0.6,
        gl.cz + Math.sin(ang) * gl.R);
      gl.g.rotation.y = Math.atan2(-Math.sin(ang) * gl.w, Math.cos(ang) * gl.w);
      gl.g.rotation.z = gl.w > 0 ? -0.18 : 0.18;       // bank into the turn
      const flap = Math.sin(t * 5.5 + gl.phase) * 0.45;
      gl.g.userData.wings[0].rotation.z = flap;
      gl.g.userData.wings[1].rotation.z = -flap;
    }
    for (const pm of palms) {
      pm.crown.rotation.z = Math.sin(t * 0.7 + pm.phase) * 0.05;
      pm.crown.rotation.x = Math.cos(t * 0.55 + pm.phase) * 0.04;
    }
    for (const bc of beachCrabs) {
      const ang = bc.phase + t * bc.w;
      const x = bc.cx + Math.cos(ang) * bc.R;
      const z = bc.cz + Math.sin(ang) * bc.R;
      bc.g.position.set(x, terrainHeight(x, z) + 0.08, z);
      bc.g.rotation.y = Math.atan2(-Math.sin(ang) * bc.w, Math.cos(ang) * bc.w) + Math.PI / 2;
      bc.animate?.(t, bc.phase);
    }

    const sposArr = snow.geometry.attributes.position;
    for (let i = 0; i < SNOW; i++) {
      let y = sposArr.getY(i) - dt * 0.35;
      if (y < -5) y += 29;
      sposArr.setY(i, y);
    }
    sposArr.needsUpdate = true;

    // Food: flakes sink, roamers divert to them, anyone close enough eats.
    for (let i = pellets.length - 1; i >= 0; i--) {
      const pl = pellets[i];
      pl.y -= 0.38 * dt;
      if (pl.y < terrainHeight(pl.x, pl.z) + 0.2) { pellets.splice(i, 1); continue; }
      for (const f of fishes) {
        if (f.benthic || f.home || f.clean) continue;
        const dp = f.g.position;
        const dx = dp.x - pl.x, dy = dp.y - pl.y, dz = dp.z - pl.z;
        if (dx * dx + dy * dy + dz * dz < 0.55) {
          be = Math.min(be + 1, beMax);
          heartBurst(pl, 1);
          pellets.splice(i, 1);
          break;
        }
      }
    }
    if (pellets.length) {
      for (const f of fishes) {
        if (!f.roam || f.home || f.clean) continue;
        let best = null, bd = 144;
        for (const pl of pellets) {
          const dp = f.g.position;
          const d = (dp.x - pl.x) ** 2 + (dp.y - pl.y) ** 2 + (dp.z - pl.z) ** 2;
          if (d < bd) { bd = d; best = pl; }
        }
        if (best) { f.tx = best.x; f.ty = best.y; f.tz = best.z; }
      }
    }
    const ppos = pelletGeo.attributes.position;
    for (let i = 0; i < PELLET_N; i++) {
      if (i < pellets.length) ppos.setXYZ(i, pellets[i].x, pellets[i].y, pellets[i].z);
      else ppos.setXYZ(i, 0, -100, 0);
    }
    ppos.needsUpdate = true;

    // Hearts drift up and fade out; ink billows and disperses.
    const hpos = heartGeo.attributes.position;
    for (let i = hearts.length - 1; i >= 0; i--) {
      hearts[i].y += 0.7 * dt;
      if (frameMs > hearts[i].until) hearts.splice(i, 1);
    }
    for (let i = 0; i < HEART_N; i++) {
      if (i < hearts.length) hpos.setXYZ(i, hearts[i].x, hearts[i].y, hearts[i].z);
      else hpos.setXYZ(i, 0, -100, 0);
    }
    hpos.needsUpdate = true;
    for (let i = inkClouds.length - 1; i >= 0; i--) {
      const ic = inkClouds[i];
      const left = (ic.until - frameMs) / 2600;
      ic.mesh.scale.setScalar(1 + (1 - left) * 2.2);
      ic.mesh.material.opacity = 0.55 * Math.max(0, left);
      if (frameMs > ic.until) {
        scene.remove(ic.mesh); disposeGroup(ic.mesh);
        inkClouds.splice(i, 1);
      }
    }

    // The duck bobs on its private patch of surface, slowly rotating.
    const duck = eggs.duckRef;
    if (duck) {
      duck.position.y = duck.userData.floatBase + Math.sin(t * 0.9) * 0.25;
      duck.rotation.y = t * 0.15;
      duck.rotation.z = Math.sin(t * 1.3) * 0.08;
    }

    // Stations: tendrils sway; sparkles orbit every client mid-scrub.
    for (const s of stationGroups) {
      for (const tnd of s.userData.tendrils) {
        tnd.rotation.x = Math.sin(t * 1.6 + tnd.userData.a * 3) * 0.22;
        tnd.rotation.z = Math.cos(t * 1.3 + tnd.userData.a * 2) * 0.22;
      }
    }
    const spos = sparkGeo.attributes.position;
    let si = 0;
    for (const f of fishes) {
      if (!f.clean || f.clean.phase !== 'scrub' || si > SPARK_N - 4) continue;
      const p = f.g.position;
      for (let k = 0; k < 4 && si < SPARK_N; k++, si++) {
        const a = t * 2.2 + k * 1.57 + f.phase;
        spos.setXYZ(si,
          p.x + Math.cos(a) * 0.5,
          p.y + 0.2 + Math.sin(t * 3 + k) * 0.25,
          p.z + Math.sin(a) * 0.5);
      }
    }
    for (; si < SPARK_N; si++) spos.setXYZ(si, 0, -100, 0);
    spos.needsUpdate = true;

    droneUpdate(dt, t, nf);
    plumeUpdate(t, ventIntensity((t / VENT_PERIOD) % 1));
    controls.target.x = clamp(controls.target.x, -70, 52);
    controls.target.z = clamp(controls.target.z, -38, 38);
    controls.target.y = clamp(controls.target.y, -4, 16);   // high enough to eye the beach
    controls.update();
    renderer.render(scene, camera);
  }

  frame();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { stop() { running = false; clearInterval(saveTimer); clearInterval(cleanTimer); music.stop(); save(); } };
}

function flash(el, msg, color = '#ff8a80') {
  if (!el) return;
  // Hold the element for the flash's lifetime so the per-frame HUD refresh
  // doesn't stomp the message before anyone can read it.
  el.dataset.flashUntil = String(performance.now() + 1600);
  el.textContent = msg; el.style.color = color;
  setTimeout(() => {
    if (performance.now() >= Number(el.dataset.flashUntil ?? 0)) {
      delete el.dataset.flashUntil;
      el.style.color = '';
    }
  }, 1650);
}

function disposeGroup(g) {
  g.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      (Array.isArray(o.material) ? o.material : [o.material])
        .forEach(m => { if (!m.userData.shared) m.dispose(); });
    }
  });
}

function buildVent(scene, pos) {
  const vent = new THREE.Group();
  vent.position.copy(pos); vent.scale.setScalar(0.72); scene.add(vent);
  const rock = new THREE.MeshStandardMaterial({
    color: 0x6b6152, roughness: 0.95, flatShading: true, map: rockTex });
  const base = new THREE.Mesh(new THREE.ConeGeometry(2.6, 4.2, 10), rock);
  base.position.y = 2.1; base.castShadow = true; vent.add(base);
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.4, 4, 10), rock);
  stack.position.y = 5.4; stack.castShadow = true; vent.add(stack);
  // Scattered boulders around the foot so the cone doesn't rise from bare sand.
  const brnd = mulberry32(41);
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 + brnd() * 0.7, 0), rock);
    const a = brnd() * Math.PI * 2;
    b.position.set(Math.cos(a) * (2.4 + brnd() * 1.4), 0.15, Math.sin(a) * (2.4 + brnd() * 1.4));
    b.rotation.set(a, a * 2.3, a); b.scale.y = 0.6; b.castShadow = true; vent.add(b);
  }
  const MOUTH_Y = 7.4;
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x120a06, emissive: 0xff6a3d, emissiveIntensity: 0 });
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.65, 16), mouthMat);
  mouth.rotation.x = -Math.PI / 2; mouth.position.y = MOUTH_Y; vent.add(mouth);
  const glow = new THREE.PointLight(0xff7a3a, 0, 30, 2);
  glow.position.y = MOUTH_Y + 0.3; vent.add(glow);
  const PUFFS = 16;
  const puffGeo = new THREE.SphereGeometry(1, 10, 10);
  const puffs = [];
  for (let i = 0; i < PUFFS; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: i % 2 ? 0x2a2d36 : 0x352a20, transparent: true, opacity: 0, roughness: 1 });
    const m = new THREE.Mesh(puffGeo, mat);
    m.userData = { seed: i / PUFFS, sway: (i * 12.9898) % (Math.PI * 2) };
    vent.add(m); puffs.push(m);
  }
  function plumeUpdate(t, k) {
    mouthMat.emissiveIntensity = 2.5 * k;
    glow.intensity = 45 * k;
    for (const m of puffs) {
      const ph = (t / 3.2 + m.userData.seed) % 1;
      m.position.set(Math.sin(t * 1.6 + m.userData.sway) * 0.9 * ph, MOUTH_Y + ph * 9,
        Math.cos(t * 1.1 + m.userData.sway) * 0.6 * ph);
      m.scale.setScalar(0.5 + ph * 2.4);
      m.material.opacity = k * (1 - ph) * 0.55;
    }
  }
  return { plumeUpdate };
}
