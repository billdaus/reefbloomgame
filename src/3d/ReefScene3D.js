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
import { EVENT_SCHEDULE, eventDaysRemaining } from '../systems/EventSystem.js';
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
function matchesBiome(spec, biomeId) {
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
function roamProfile(spec) {
  const zs = Object.keys(ZONES).filter(id => matchesBiome(spec, id));
  const big = (spec.size ?? 14) >= 22;
  if (zs.length < 2 && !big) return null;
  return {
    x0: Math.min(...zs.map(z => ZONE_BAND[z][0])) + 2,
    x1: Math.max(...zs.map(z => ZONE_BAND[z][1])) - 2,
  };
}

// Bottom-dwellers that aren't fish at all — an arthropod, echinoderms, a
// gastropod, a shrimp. They crawl the seafloor instead of swimming the column.
const BENTHIC_SPECIES = new Set([
  'horseshoeCrab', 'sandDollar', 'conch', 'seaUrchin', 'cleanerShrimp',
  'hermitCrab', 'flamingoTongue',
  'sculpin', 'ochreStar', 'chiton', 'tidepoolCrab',
]);
// How high each benthic body's origin sits above the sand (× its base scale).
const BENTHIC_LIFT = {
  horseshoeCrab: 0.16, sandDollar: 0.06, conch: 0.22, seaUrchin: 0.28, cleanerShrimp: 0.18,
  hermitCrab: 0.22, flamingoTongue: 0.14,
  sculpin: 0.16, ochreStar: 0.08, chiton: 0.12, tidepoolCrab: 0.16,
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
  'mullet', 'sergeantMajor',
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
    : raw === 'kelp' ? 'grass'
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
  'clownfish', 'zebraGoby', 'zebrafish', 'banggaiCardinalfish', 'pajamaCardinalfish',
  'harlequinTuskfish', 'butterflyfish', 'moorishIdol', 'seaUrchin']);
const FISH_SPOTTED = new Set([
  'spottedEagleRay', 'pufferfish', 'mandarinfish', 'rainbowGoby', 'twilightWhaleShark',
  'flashlightFish', 'giantSquid']);
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
  if (FISH_BANDED.has(spec.id)) {
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
  if (['kelp', 'mangroveSapling'].includes(id)) return 'kelp';
  if (['abyssalFan', 'lagoonFan', 'sunsetFan'].includes(id)) return 'fan';
  if (id === 'barnacles') return 'barnacles';
  if (id === 'anemoneHome') return 'anemone';
  if (['wispCoral', 'phantomPolyp'].includes(id)) return 'wisp';
  if (id === 'lanternCoral') return 'lantern';
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
  // Giant kelp: tall stalks with leaf blades and float bulbs.
  kelp(g, { mat, tipMat, lvl = 1 }, rnd) {
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
function clearCoralGroup(g) {
  for (let i = g.children.length - 1; i >= 0; i--) {
    const c = g.children[i];
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
function fishEyes(g, x, y, z, s = 1) {
  for (const side of [-1, 1]) {
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.042 * s, 10, 8), scleraMat);
    sclera.position.set(side * x, y, z); g.add(sclera);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.026 * s, 8, 8), pupilMat);
    pupil.position.set(side * (x + 0.018 * s), y, z + 0.014 * s); g.add(pupil);
  }
}

// ── Species body builders — each returns { tail?, tailAxis?, animate? } ───────
const FISH_BODY = {
  generic(g, { bodyMat, finMat, rnd }) {
    const body = fusiformBody(bodyMat);
    const deep = 0.85 + rnd() * 0.35;
    body.scale.set(0.36 * (0.85 + rnd() * 0.3), 0.62 * deep, 1.18 * (0.9 + rnd() * 0.25));
    g.add(body);
    fishEyes(g, 0.11, 0.13, 0.3);
    for (const s of [-1, 1]) {
      const pec = finMesh([
        [0, 0], [0.16, 0.08, 0.27, 0.02], [0.2, -0.1, 0.24, -0.13], [0.08, -0.1, 0, 0]],
        finMat, s > 0 ? 1.15 : 1.98);
      pec.position.set(s * 0.15, -0.02, 0.22);
      pec.scale.setScalar(0.85 + rnd() * 0.4);
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
  if (['seahorse', 'neonSeahorse', 'twilightSeahorse', 'moonSeahorse', 'goldenSeahorse'].includes(id)) return 'seahorse';
  if (id === 'seaTurtle') return 'turtle';
  if (['shark', 'frilledShark', 'twilightWhaleShark', 'lemonShark'].includes(id)) return 'shark';
  if (['morayEel', 'giantMoray', 'blueRibbonEel', 'glowEel', 'gulperEel',
    'oarfish', 'ribbonfish'].includes(id)) return 'eel';
  if (['octopus', 'giantSquid', 'rubyOctopus'].includes(id)) return 'octopus';
  if (id === 'dolphin') return 'dolphin';
  if (id === 'cuttlefish') return 'cuttlefish';
  if (['manatee', 'dugong'].includes(id)) return 'sirenian';
  if (id === 'seaOtter') return 'otter';
  if (id === 'pufferfish') return 'puffer';
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
  const { tail, tailAxis, animate } = build(g, { bodyMat, finMat, spec, rnd }) ?? {};

  g.scale.setScalar(((spec.size ?? 14) / 16) * 0.55 * (0.92 + rnd() * 0.16));
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData.tail = tail ?? null;
  g.userData.tailAxis = tailAxis;
  g.userData.animate = animate ?? null;
  g.userData.baseScale = g.scale.x;
  g.userData.glowMat = biolum ? bodyMat : null;
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
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
      'Gavin does not talk. Gavin observes.'],
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
  let ev3 = null;                // live event progress (saved)
  let dq = null;                 // today's daily quest (saved)
  const achUnlocked = new Set(); // achievement ids earned (saved)
  const droneQueue = [];         // Bubbles' pending speech lines
  let sawNight = false;          // has this reef been seen after dark (saved)
  let be = START_BE, polyps = START_POLYPS, pearls = START_PEARLS;
  let harmony = START_HARMONY, level = START_LEVEL;
  let timeOfDay = 0.3, nightFactor = 0;   // day/night cycle (saved)
  let fogEase = 0;                        // 1 = camera above the surface (clear air)
  let incomePerSec = 0, polypPerSec = 0, beMax = BE_MAX;
  let onProgress = () => {};   // set once the palette exists — refreshes lock states

  const zoneUnlocked = (zid) => level >= ZONES[zid].unlock;

  function levelScaleFor(lvl) { return 1 + (lvl - 1) * 0.04; }   // bulk comes from regrown geometry

  function addCoral(spec, tile, lvl = 1) {
    tile.userData.occupied = true;
    const group = makeCoral(spec, lvl);
    group.position.set(tile.position.x, ZONES[tile.userData.biome].floorY + 0.18, tile.position.z);
    const entry = {
      b: tile.userData.biome, c: tile.userData.c, r: tile.userData.r, id: spec.id, level: lvl };
    group.userData.spec = spec;
    group.userData.entry = entry;
    group.userData.levelScale = levelScaleFor(lvl);
    scene.add(group); corals.push(group);
    placedCorals.push(entry);
    seen.add(spec.id);
    if (spec.shelter) { group.userData.homed = new Set(); shelters.push(group); }
    return group;
  }

  // ── Shelter homes (Classic's Anemone Haven / Reef Grotto) ────────────────────
  // Anemone Haven homes small layer-A fish overnight; the Reef Grotto homes
  // nocturnal crevice-dwellers through the day. Capacity is the spec's homeCap.
  const shelters = [];
  const isNocturnalSpec = (spec) =>
    primaryBiome(spec) === 'deepTwilight' || !!spec.nocturnal;
  function claimHome(f) {
    const spec = FISH_SPECIES[f.id];
    let best = null, bd = Infinity;
    for (const s of shelters) {
      const sp = s.userData.spec;
      const match = sp.homeFor === 'nocturnal' ? f.noct
        : (sp.homeFor === 'A' || sp.homeFor === 'B') ? spec.layer === sp.homeFor
        : true;
      if (!match || s.userData.homed.size >= (sp.homeCap ?? 6)) continue;
      const dx = s.position.x - f.g.position.x, dz = s.position.z - f.g.position.z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = s; }
    }
    if (best) { best.userData.homed.add(f); f.home = best; }
    return best;
  }
  function releaseHome(f) {
    if (!f.home) return;
    f.home.userData.homed?.delete(f);
    f.home = null;
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
      const spec = CORAL_SPECIES[e.id];
      if (!spec) continue;
      if (!spec.utility) {
        bePerTick += (BE_PER_TICK[spec.tier] ?? 1) * (1 + (e.level - 1) * POLYP_BE_BONUS);
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
      const [c, f, h] = req;
      if (placedCorals.length >= c && placedFish.length >= f && harmony >= h) level++;
      else break;
    }
    if (level > before) droneTrigger('levelUp');
  }

  // Recompute reef-composition stats after any placement/removal.
  function refreshProgress() { harmony = computeHarmony(); checkLevelUp(); ev3Snapshot(); dqSnapshot(); checkAch(); onProgress(); }

  function tryUpgrade(group) {
    const e = group.userData.entry;
    if (!e) return;
    if (e.level >= CORAL_MAX_LEVEL) { flash(rateEl, 'max level'); return; }
    const cost = upgradeCost(e.level);
    if (polyps < cost) { flash(rateEl, `need ${cost} 🪸`); return; }
    polyps -= cost;
    e.level++;
    // Regrow the same individual with more branches/stalks — the level shows
    // as new growth, not an inflated copy of the old mesh.
    clearCoralGroup(group);
    buildCoralInto(group, group.userData.spec, group.userData.buildSeed, e.level);
    group.userData.levelScale = levelScaleFor(e.level);
    group.userData.grow = Math.min(group.userData.grow, 0.82);   // small re-grow ease
    recomputeRates(); refreshHud(); save();   // upgrade affects rates only, not harmony/level inputs
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
    f.tz = -26 + Math.random() * 52;
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
  function schoolOf(st) {
    const key = st.id + '|' + st.b;
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
      st.bx0 = prof.x0; st.bx1 = prof.x1;
      st.px = st.cx; st.py = st.y; st.pz = st.cz;
      st.spd = (0.6 + (spec.speed ?? 1) * 0.9) * (style?.drift ?? 1);
      st.hdg = st.phase;
      if (style?.alt) st.alt = style.alt;
      st.pitch = style?.pitch ?? 1;
      st.bobAmp = style?.bob ?? 0.15;
      newRoamTarget(st);
    }
    scene.add(st.g); fishes.push(st);
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
    const refund = (spec.pearlCost || spec.utility) ? 0 : Math.floor((CORAL_COST[spec.tier] ?? 0) / 2);
    be = Math.min(be + refund, beMax);
    if (spec.shelter) {
      for (const f of group.userData.homed ?? []) f.home = null;
      const si = shelters.indexOf(group); if (si >= 0) shelters.splice(si, 1);
    }
    const ci = corals.indexOf(group); if (ci >= 0) corals.splice(ci, 1);
    const pi = placedCorals.indexOf(e); if (pi >= 0) placedCorals.splice(pi, 1);
    const tile = tileAt(e.b ?? 'coral', e.c, e.r); if (tile) tile.userData.occupied = false;
    scene.remove(group); disposeGroup(group);
    recomputeRates(); refreshProgress(); refreshHud(); save();
    if (refund > 0) flash(rateEl, `+${refund} BE`, '#7fd8b0');
  }
  function removeFishGroup(group) {
    const st = group.userData.stateRef;
    if (!st || !group.userData.placed) return;
    const spec = FISH_SPECIES[st.id];
    const refund = spec?.pearlCost ? 0 : Math.floor((FISH_COST[spec?.tier] ?? 0) / 2);
    be = Math.min(be + refund, beMax);
    const fi = fishes.indexOf(st); if (fi >= 0) fishes.splice(fi, 1);
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
        be, polyps, pearls, harmony, level, timeOfDay,
        corals: placedCorals, fish: placedFish, seen: [...seen], exp: expansions,
        eggs: [...eggsClaimed], stations: placedStations,
        ev3, excl: [...exclOwned], dq,
        ach: [...achUnlocked], sawNight }));
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

  function refreshHud() {
    if (beEl) beEl.textContent = Math.floor(be);
    if (rateEl && !(performance.now() < Number(rateEl.dataset.flashUntil ?? 0))) {
      rateEl.textContent = `+${incomePerSec.toFixed(1)}/s`;
    }
    if (hmEl) hmEl.textContent = Math.round(harmony);
    if (lvlEl) lvlEl.textContent = level;
    if (polypEl) polypEl.textContent = Math.floor(polyps);
    if (pearlEl) pearlEl.textContent = Math.floor(pearls);
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

  const rows = [];   // { btn, need }  for lock refresh
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
      + `${spec.name}${badge}<small>${n} ${unit}</small>`
      + (need > 1 ? `<span class="lv">Lv${need}</span>` : '');
    btn.onclick = () => {
      if (need > level) { flash(rateEl, `unlocks at Lv ${need}`); return; }
      selected = { type, spec };
      removeBtn.classList.remove('on');
      clearSel(); btn.classList.add('sel');
    };
    if (spec === selected.spec) btn.classList.add('sel');
    rows.push({ btn, need });
    paletteEl.appendChild(btn);
  }
  function refreshLocks() { for (const r of rows) r.btn.classList.toggle('locked', r.need > level); }
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

  // Species grouped by home biome, mirroring Classic's per-biome shop.
  const stdCorals = coralSpecs.filter(s => !s.utility && !s.pearlCost);
  const stdFish = fishSpecs.filter(s => !s.pearlCost);
  for (const zid of ['coral', 'seagrass', 'deepTwilight']) {
    const bio = BIOMES[zid];
    const lv = ZONES[zid].unlock > 1 ? ` · Lv${ZONES[zid].unlock}` : '';
    const cs = stdCorals.filter(s => primaryBiome(s) === zid);
    const fs = stdFish.filter(s => primaryBiome(s) === zid);
    if (cs.length) {
      label(`${bio.icon} ${bio.shortName}${lv} — coral · click a tile`);
      cs.forEach(s => button(s, 'coral'));
    }
    if (fs.length) {
      label(`${bio.icon} ${bio.shortName}${lv} — fish · click the water`);
      fs.forEach(s => button(s, 'fish'));
    }
  }
  const pearlC = coralSpecs.filter(s => s.pearlCost);
  const pearlF = fishSpecs.filter(s => s.pearlCost);
  if (pearlC.length || pearlF.length) {
    label('Pearl species · 💎');
    pearlC.forEach(s => button(s, 'coral'));
    pearlF.forEach(s => button(s, 'fish'));
  }
  const utilC = coralSpecs.filter(s => s.utility);
  if (utilC.length) {
    label('Utility · 🪸 polyps');
    button(STATION_SPEC, 'station');   // Classic's 2×2 cleaning station
    utilC.forEach(s => button(s, 'coral'));
  }
  // Event-pass exclusives: rows exist up front but stay hidden until owned.
  const exclRows = [];
  let exclLabel = null;
  {
    const exclSpecs = [
      ...Object.values(CORAL_SPECIES).filter(s => s.eventId && s.color != null)
        .map(s => [s, 'coral']),
      ...Object.values(FISH_SPECIES).filter(s => s.eventId && s.color != null && s.layer)
        .map(s => [s, 'fish']),
    ];
    if (exclSpecs.length) {
      label('Event exclusives · 🎉');
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
      const own = exclOwned.has(r.id);
      r.btn.style.display = own ? '' : 'none';
      any = any || own;
    }
    if (exclLabel) exclLabel.style.display = any ? '' : 'none';
  }
  refreshExclRows();

  onProgress = () => { refreshLocks(); refreshZoneLocks(); refreshExpMarkers(); };   // sync locks with level-ups
  onProgress();

  // ── Pearl shop (basic hook — packs grant pearls, mirroring Classic) ───────────
  const shopOverlay = document.createElement('div');
  shopOverlay.id = 'shop-overlay';
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = '<div style="font-size:16px;font-weight:700;">💎 Pearl Shop</div>'
    + '<div style="font-size:11px;color:#9fc4dc;margin:4px 0 12px;">'
    + 'Support the reef — each pack grants pearls.</div>';
  [{ pearls: 10, price: '$0.99' }, { pearls: 35, price: '$2.99' }, { pearls: 60, price: '$4.99' }]
    .forEach(p => {
      const row = document.createElement('button');
      row.className = 'shop-pack';
      row.innerHTML = `<span>💎 ${p.pearls} pearls</span><span>${p.price}</span>`;
      row.onclick = () => { pearls += p.pearls; refreshHud(); save(); };
      panel.appendChild(row);
    });
  const closeBtn = document.createElement('button');
  closeBtn.className = 'shop-close'; closeBtn.textContent = 'Close';
  closeBtn.onclick = () => { shopOverlay.style.display = 'none'; };
  panel.appendChild(closeBtn);
  shopOverlay.appendChild(panel);
  shopOverlay.onclick = e => { if (e.target === shopOverlay) shopOverlay.style.display = 'none'; };
  document.body.appendChild(shopOverlay);
  document.getElementById('shop-btn')?.addEventListener('click',
    () => { shopOverlay.style.display = 'flex'; });

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
      shopOverlay.style.display = 'none';
    }
  });
  const bar = (v, max, cls = '') =>
    `<div class="m-bar"><span class="${v >= max ? 'full' : cls}"`
    + ` style="width:${clamp((v / max) * 100, 0, 100)}%"></span></div>`;

  // 📖 Journal — every species, discovered by placing it once (mirrors Classic's journal).
  const journal = buildMenuModal('📖 Species Journal');
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
  // A journal entry: tier dot + name, scientific name and field notes once the
  // species has been recorded, biome icons and a tier badge on the right.
  function journalRow(spec) {
    const found = seen.has(spec.id);
    const need = Math.max(spec.unlockLevel ?? 1, ZONES[primaryBiome(spec)].unlock);
    const tierCol = hex(COLORS[`tier_${spec.tier}`] ?? 0xb0bec5);
    const badge = `<span style="font-size:9px;letter-spacing:1px;color:${tierCol};`
      + `border:1px solid ${tierCol};border-radius:4px;padding:1px 4px">`
      + `${TIER_LABEL[spec.tier] ?? '?'}</span>`;
    const sci = found && spec.scientific
      ? ` <i style="color:#9fc4dc;font-weight:400">${spec.scientific}</i>` : '';
    const note = found
      ? (SPECIES_LORE[spec.id] ?? 'A specimen of the reef.')
      : need > level ? `🔒 Unlocks at Lv${need}.` : 'Place one to record it.';
    return `<div class="m-row${found ? '' : ' locked'}" style="align-items:flex-start">`
      + `<span class="dot" style="background:${tierCol};margin-top:3px"></span>`
      + `<span style="flex:1;min-width:0">${found ? spec.name : '???'}${sci}`
      + `<span style="display:block;font-size:10.5px;line-height:1.35;color:#8fb4c9">${note}</span></span>`
      + `<small style="margin-top:2px">${biomeIcons(spec)} ${badge}</small></div>`;
  }
  function fillJournal() {
    const cs = coralSpecs, fs = fishSpecs;
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
    let html = '';
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
        html += `<div class="m-row locked"><span class="dot" style="background:#546e7a"></span>`
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
    const rate = lvl => basePerTick * (1 + (lvl - 1) * POLYP_BE_BONUS) / TICK_SEC;
    const cost = upgradeCost(e.level);
    const refund = (spec.pearlCost || spec.utility) ? 0
      : Math.floor((CORAL_COST[spec.tier] ?? 0) / 2);
    let html = `<div class="m-row" style="border:none;padding-bottom:0"><span>Level</span>`
      + `<small>${e.level} / ${CORAL_MAX_LEVEL}</small></div>${bar(e.level, CORAL_MAX_LEVEL)}`;
    html += spec.utility
      ? '<div class="m-row"><span>Utility coral</span><small>no BE income</small></div>'
      : `<div class="m-row"><span>Income</span><small>+${rate(e.level).toFixed(1)}/s`
        + `${max ? '' : ` → +${rate(e.level + 1).toFixed(1)}/s`}</small></div>`;
    html += `<div class="m-row"><span>Polyp drip</span>`
      + `<small>+${(POLYP_PER_CORAL_TICK * e.level / TICK_SEC).toFixed(2)}/s</small></div>`;
    upgrade.body.innerHTML = html;
    const up = document.createElement('button');
    up.className = 'shop-pack';
    up.innerHTML = max ? '<span>Max level reached</span><span>—</span>'
      : `<span>⬆ Upgrade to Lv${e.level + 1}</span><span>${cost} 🪸</span>`;
    up.disabled = max || polyps < cost;
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
  function openUpgrade(g) { upgradeTarget = g; fillUpgrade(); upgrade.show(); }

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
  const EV_TODAY = () => new Date().toISOString().slice(0, 10);
  function ev3Init() {
    const live = EVENT_SCHEDULE.find(e => EV_TODAY() >= e.startDate && EV_TODAY() <= e.endDate);
    if (live && (!ev3 || ev3.id !== live.id)) {
      ev3 = { id: live.id, setIdx: 0, tokens: 0, prog: {},
        setsClaimed: [], tiersClaimed: [], rewardClaimed: false };
    }
  }
  const ev3Def = () => EVENT_SCHEDULE.find(e => e.id === ev3?.id) ?? null;
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
    const def = ev3Def();
    if (!def?.pass) return;
    def.pass.tiers.forEach((tier, i) => {
      if (ev3.tiersClaimed.includes(i) || ev3.tokens < tier.threshold) return;
      ev3.tiersClaimed.push(i);
      if (tier.reward.be) be = Math.min(be + tier.reward.be, beMax);
      if (tier.reward.pearls) pearls += tier.reward.pearls;
      if (tier.reward.exclusive) {
        exclOwned.add(tier.reward.exclusive);
        refreshExclRows();
        droneQueue.push(`Pass tier unlocked: ${tier.label}. The reef gains a legend.`);
      }
    });
  }
  function ev3ClaimSet() {
    if (!ev3 || !ev3SetComplete() || ev3.setsClaimed.includes(ev3.setIdx)) return;
    const def = ev3Def();
    ev3.tokens += def.questSets[ev3.setIdx].tokenReward ?? 0;
    ev3.setsClaimed.push(ev3.setIdx);
    ev3GrantTiers();
    if (ev3.setIdx + 1 < def.questSets.length) {
      ev3.setIdx++;
      ev3.prog = {};
      ev3Snapshot();
    }
    refreshHud(); save();
  }
  // Event shop: pearls buy this event's exclusives outright, plus two themed
  // bundles. Each item can be bought once per event.
  function ev3ShopItems(def) {
    const items = [
      { label: `${def.icon} 250 🫧 bundle`, pearls: 15, reward: { be: 250 } },
      { label: `${def.icon} 120 🪸 bundle`, pearls: 20, reward: { polyps: 120 } },
    ];
    (def.pass?.tiers ?? []).forEach((t) => {
      if (t.reward?.exclusive) {
        items.push({
          label: t.label, pearls: 45 + items.length * 5,
          reward: { exclusive: t.reward.exclusive },
        });
      }
    });
    return items;
  }
  function ev3Buy(i) {
    const def = ev3Def();
    if (!ev3 || !def || !ev3Live()) return;
    ev3.shopBought ??= [];
    if (ev3.shopBought.includes(i)) return;
    const item = ev3ShopItems(def)[i];
    if (!item || pearls < item.pearls) { flash(rateEl, `need ${item?.pearls ?? '?'} 💎`); return; }
    if (item.reward.exclusive && exclOwned.has(item.reward.exclusive)) return;
    pearls -= item.pearls;
    ev3.shopBought.push(i);
    if (item.reward.be) be = Math.min(be + item.reward.be, beMax);
    if (item.reward.polyps) polyps = Math.min(polyps + item.reward.polyps, POLYP_MAX);
    if (item.reward.exclusive) {
      exclOwned.add(item.reward.exclusive);
      refreshExclRows();
      droneQueue.push(`Purchased from the event shop: ${item.label}. Money well spent. Probably.`);
    }
    refreshHud(); save();
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
    if (ev3 && ev3Live()) { ev3.tokens += 1; ev3GrantTiers(); }
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
  const eventModal = buildMenuModal('🎉 Event');
  function fillEvent() {
    ev3Init(); ev3Snapshot();
    const def = ev3Def();
    if (!def || !ev3Live()) {
      const next = EVENT_SCHEDULE.find(e => e.startDate > EV_TODAY());
      eventModal.body.innerHTML = '<div class="m-sub">No event is running right now.</div>'
        + (next ? `<div class="m-row"><span>${next.icon} ${next.name}</span>`
          + `<small>starts ${next.startDate}</small></div>` : '');
      return;
    }
    const days = eventDaysRemaining(def.endDate);
    const set = def.questSets[ev3.setIdx];
    const allSetsDone = ev3.setsClaimed.length >= def.questSets.length;
    let html = `<div class="m-sub">${def.icon} <b>${def.name}</b> · ${days} day${days === 1 ? '' : 's'} left</div>`
      + `<div class="m-sub">${def.description}</div>`
      + `<div class="m-row"><span>Tokens</span><small>🎟 ${ev3.tokens}</small></div>`;
    if (!allSetsDone && set) {
      html += `<div class="m-sec">Quest set ${ev3.setIdx + 1}/${def.questSets.length} — ${set.label}</div>`;
      set.challenges.forEach((c, i) => {
        const p = Math.floor(ev3.prog[i] ?? 0);
        html += `<div class="m-row"><span>${p >= c.target ? '✅' : '▫️'} ${c.label}</span>`
          + `<small>${Math.min(p, c.target)} / ${c.target}</small></div>`;
      });
    }
    html += `<div class="m-sec">Event pass</div>`;
    def.pass.tiers.forEach((tier, i) => {
      const got = ev3.tiersClaimed.includes(i);
      html += `<div class="m-row${got ? '' : ' locked'}"><span>${got ? '✅' : '🔒'} ${tier.label}</span>`
        + `<small>${tier.threshold} 🎟</small></div>`;
    });
    eventModal.body.innerHTML = html;
    // Event shop — limited stock, pearls only, gone when the tide goes out.
    ev3.shopBought ??= [];
    eventModal.body.insertAdjacentHTML('beforeend',
      '<div class="m-sec">Event shop · 💎 · one of each</div>');
    ev3ShopItems(def).forEach((item, i) => {
      const owned = item.reward.exclusive && exclOwned.has(item.reward.exclusive);
      const bought = ev3.shopBought.includes(i) || owned;
      const btn = document.createElement('button');
      btn.className = 'shop-pack';
      btn.innerHTML = bought
        ? `<span>✅ ${item.label}</span><span>sold</span>`
        : `<span>${item.label}</span><span>${item.pearls} 💎</span>`;
      btn.disabled = bought || pearls < item.pearls;
      btn.style.opacity = btn.disabled ? 0.45 : 1;
      btn.onclick = () => { ev3Buy(i); fillEvent(); };
      eventModal.body.append(btn);
    });
    if (!allSetsDone && set) {
      const claim = document.createElement('button');
      claim.className = 'shop-pack';
      claim.innerHTML = `<span>Claim "${set.label}"</span><span>+${set.tokenReward} 🎟</span>`;
      claim.disabled = !ev3SetComplete();
      claim.style.opacity = claim.disabled ? 0.45 : 1;
      claim.onclick = () => { ev3ClaimSet(); fillEvent(); };
      eventModal.body.append(claim);
    } else if (!ev3.rewardClaimed) {
      const grand = document.createElement('button');
      grand.className = 'shop-pack';
      grand.innerHTML = `<span>🏆 Claim event reward</span>`
        + `<span>+${def.reward?.be ?? 0} 🫧 +${def.reward?.pearls ?? 0} 💎</span>`;
      grand.onclick = () => { ev3ClaimReward(); fillEvent(); };
      eventModal.body.append(grand);
    } else {
      eventModal.body.insertAdjacentHTML('beforeend',
        '<div class="m-sub">Event complete — see you at the next one. 🌊</div>');
    }
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

  const menuEl = document.getElementById('menu3d');
  if (menuEl) {
    [['📖 Journal', journal, fillJournal],
     ['🏆', achModal, fillAch],
     ['📅 Daily', daily, fillDaily],
     ['🎉 Event', eventModal, fillEvent],
     ['⚖ Advisor', advisor, fillAdvisor],
     ['⭐ Progress', progress, fillProgress]].forEach(([text, modal, fill]) => {
      const b = document.createElement('button');
      b.className = 'menu-btn';
      b.textContent = text;
      b.onclick = () => { fill(); modal.show(); };
      menuEl.appendChild(b);
    });
  }

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
    (saved.corals ?? []).forEach(({ b, c, r, id, level: lv }) => {
      const spec = CORAL_SPECIES[id], tile = tileAt(b ?? 'coral', c, r);
      if (spec && tile && !tile.userData.occupied) addCoral(spec, tile, lv ?? 1);
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
  }
  ev3Init(); ev3Snapshot(); dqInit(); dqSnapshot(); refreshExclRows();
  recomputeRates(); refreshProgress(); refreshHud();
  refreshExpMarkers(); refreshZoneLocks();

  // ── Bubbles the drone — dock, speech overlay, and state machine ──────────────
  const drone = makeDrone();
  // Dock sits in the open channel south-east of the reef grid, clear of the
  // tiles, the expansion aprons, and the decor ring around them.
  const dockY = terrainHeight(15, 24);
  const DOCK_POS = new THREE.Vector3(15, dockY + 1.1, 24);
  const dockRock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), rockMat);
  dockRock.position.set(15, dockY + 0.2, 24);
  dockRock.scale.y = 0.55; dockRock.castShadow = true; scene.add(dockRock);
  drone.position.copy(DOCK_POS);
  scene.add(drone);

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
      if (droneQueue.length || napTimer <= 0) droneWake(false);
    }
    if (droneState === 'docked' && droneQueue.length > 0) {
      droneState = 'floating';
      droneTarget.copy(SPEAK_POS[Math.floor(Math.random() * SPEAK_POS.length)]);
    } else if (droneState === 'toNap') {
      const step = 5.5 * dt;
      const d = droneTarget.distanceTo(dronePos);
      if (d < Math.max(step, 0.25)) {
        dronePos.copy(droneTarget);
        droneState = 'napping';
        napTimer = 35 + Math.random() * 35;
      } else {
        dronePos.lerp(droneTarget, step / d);
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
    const moving = droneState === 'floating' || droneState === 'returning';
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
    if (spec.pearlCost) {
      if (pearls < spec.pearlCost) { flash(rateEl, 'not enough 💎'); return false; }
      pearls -= spec.pearlCost;
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
        if (st) { petFish(st); return; }
      }
    }

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
  let running = true;
  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = clock.getDelta();
    const t = clock.getElapsedTime();

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
    sun.intensity = 1.7 - nf * 1.35;
    sun.color.copy(SUN_DAY).lerp(SUN_NIGHT, nf);
    hemi.intensity = 1.05 - nf * 0.65;
    fill.intensity = 0.5 - nf * 0.25;
    scene.backgroundIntensity = 1 - nf * 0.72;
    scene.fog.color.copy(FOG_DAY).lerp(FOG_NIGHT, nf);
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
        for (const m of g.userData.glowMats) m.emissiveIntensity = 0.5 + nf * 0.85;
      }
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
        // Settle beside the shelter with a gentle hover.
        const hp = f.home.position;
        const tx = hp.x + Math.sin(f.phase * 2.6) * 0.55;
        const tz = hp.z + Math.cos(f.phase * 3.1) * 0.55;
        const ty = hp.y + 0.5 + Math.sin(t * 0.8 + f.phase) * 0.06;
        const k = Math.min(1, dt * 1.4);
        const cur = f.g.position;
        cur.set(cur.x + (tx - cur.x) * k, cur.y + (ty - cur.y) * k, cur.z + (tz - cur.z) * k);
        f.g.rotation.x *= 0.92;
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
        f.g.rotation.y = heading + Math.sin(t * 6 + f.phase) * 0.1 * slow;
      }
      const ud = f.g.userData;
      if (ud.animate) ud.animate(t, f.phase);
      else if (ud.tail) {
        if (ud.tailAxis === 'x') ud.tail.rotation.x = Math.sin(t * 4.5 + f.phase) * 0.28;
        else ud.tail.rotation.y = Math.sin(t * 7 + f.phase) * 0.5;
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
      if (f.g.userData.glowMat) f.g.userData.glowMat.emissiveIntensity = nf * 0.9;
    }
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

  return { stop() { running = false; clearInterval(saveTimer); clearInterval(cleanTimer); save(); } };
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
