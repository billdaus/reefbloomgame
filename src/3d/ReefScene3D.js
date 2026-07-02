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
import {
  CORAL_SPECIES, FISH_SPECIES, CORAL_COST, FISH_COST, BE_PER_TICK,
  START_BE, START_POLYPS, START_PEARLS, START_HARMONY, START_LEVEL,
  BE_MAX, POLYP_MAX, POLYP_BE_BONUS, POLYP_PER_CORAL_TICK, CORAL_MAX_LEVEL, TICK_MS,
  BIOMES, SEAGRASS_UNLOCK_LEVEL, DEEP_TWILIGHT_UNLOCK_LEVEL,
} from '../constants.js';

const TILE = 2;
const VENT_PERIOD = 5.2;
const TICK_SEC = TICK_MS / 1000;        // BE/polyp tick cadence in seconds
const SAVE_KEY_BASE = 'reefbloom_3d_save_v1';
const SLOT_KEY = 'reefbloom_3d_slot';
const slotKey = (s) => `${SAVE_KEY_BASE}_s${s}`;

// Three biome zones on one seafloor. Each has its own grid; the twilight
// basin sits on a deep shelf east of the reef, the seagrass flats a touch
// shallower to the west. Zone membership for free water (fish) is by x band.
const ZONES = {
  seagrass:     { id: 'seagrass',     cx: -26, cz: 0, grid: 6, floorY: 0.5,  unlock: SEAGRASS_UNLOCK_LEVEL },
  coral:        { id: 'coral',        cx: 0,   cz: 0, grid: 7, floorY: -0.1, unlock: 1 },
  deepTwilight: { id: 'deepTwilight', cx: 26,  cz: 0, grid: 6, floorY: -4.5, unlock: DEEP_TWILIGHT_UNLOCK_LEVEL },
};
function zoneAt(x) {
  if (x < -13.5) return ZONES.seagrass;
  if (x > 13.5) return ZONES.deepTwilight;
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

const BIOLUM = ['auroraCoral', 'twilightBrain', 'phantomPolyp', 'wispCoral', 'lanternCoral'];

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

const coralTexCache = new Map();
function coralTexture(spec) {
  let t = coralTexCache.get(spec.id);
  if (t) return t;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const col = new THREE.Color(spec.color).lerp(new THREE.Color(0x8a8a80), 0.18);
  const dark = css(col.clone().multiplyScalar(0.58));
  const light = css(col.clone().lerp(new THREE.Color(0xffffff), 0.4));
  ctx.fillStyle = css(col);
  ctx.fillRect(0, 0, size, size);
  const rnd = mulberry32(hashId(spec.id));
  const shape = shapeOf(spec);
  if (shape === 'brain') {
    // Meandering ridge-and-valley lines.
    ctx.lineWidth = 3.5;
    for (let i = 0; i < 10; i++) {
      const y0 = (i + 0.5) * (size / 10);
      ctx.strokeStyle = i % 2 ? dark : light;
      ctx.beginPath();
      for (let x = -8; x <= size + 8; x += 8) {
        const y = y0 + Math.sin(x * 0.11 + i * 2.2 + rnd() * 0.5) * 4.5;
        if (x === -8) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
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
  coralTexCache.set(spec.id, t);
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
function fishTexture(spec) {
  let t = fishTexCache.get(spec.id);
  if (t) return t;
  const w = 128, h = 64;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const base = new THREE.Color(spec.color);
  const acc = new THREE.Color(spec.accentColor ?? 0xffffff);
  ctx.fillStyle = css(base);
  ctx.fillRect(0, 0, w, h);
  // Counter-shading: darker dorsal (top of texture = top of fish).
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, css(base.clone().multiplyScalar(0.6)));
  grad.addColorStop(0.45, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  const rnd = mulberry32(hashId(spec.id));
  ctx.fillStyle = css(acc);
  if (FISH_BANDED.has(spec.id)) {
    const bands = 3 + (hashId(spec.id) % 2);
    for (let i = 0; i < bands; i++) {
      const x = ((i + 0.5) / bands) * w;
      const bw = 7 + rnd() * 6;
      ctx.fillRect(x - bw / 2, 0, bw, h);
    }
  } else if (FISH_SPOTTED.has(spec.id)) {
    ctx.globalAlpha = 0.85;
    for (let i = 0; i < 26; i++) {
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * h, 1.6 + rnd() * 2.6, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else {
    // Lateral stripe along the flank.
    ctx.globalAlpha = 0.7;
    ctx.fillRect(0, h * 0.52, w, 4);
    ctx.globalAlpha = 1;
  }
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  fishTexCache.set(spec.id, t);
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
  h -= smoothstep(13, 21, x) * 4.4;
  h += smoothstep(13, 20, -x) * 0.7;
  const d = Math.max(Math.abs(x) - 46, Math.abs(z) - 28);
  if (d > 0) {
    h += Math.min(d * 0.3, 10) * (0.72 + 0.28 * Math.sin(x * 0.07 + Math.cos(z * 0.09) * 2));
  }
  for (const zn of Object.values(ZONES)) {
    const half = (zn.grid * TILE) / 2 + 1.4;
    const dist = Math.max(Math.abs(x - zn.cx) - half, Math.abs(z - zn.cz) - half);
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
  if (['staghorn', 'finger', 'firetip', 'elkhorn', 'candycane', 'pillar'].includes(id)) return 'branch';
  if (['lettuce', 'toadstool', 'table'].includes(id)) return 'plate';
  if (['star', 'starter'].includes(id)) return 'polyp';
  if (['bubble'].includes(id)) return 'bubble';
  if (['brain', 'ghost'].includes(id)) return 'brain';
  if (['seaweed', 'seagrass', 'redSeagrass', 'kelp'].includes(id)) return 'grass';
  return spec.tall ? 'branch' : 'brain';
}

// Each builder gets ({ mat, tipMat, darkMat }, rnd) — rnd is a per-coral PRNG so
// every placement has its own silhouette instead of six identical clones.
const BODY = {
  branch(g, { mat, tipMat }, rnd) {
    const N = 7 + Math.floor(rnd() * 3);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + rnd() * 0.6;
      const lean = 0.18 + rnd() * 0.35;
      const h1 = 0.7 + rnd() * 0.9;
      const r0 = 0.05 + rnd() * 0.025;
      // Lower segment: tapered, leaning outward from the base.
      const arm = new THREE.Group();
      arm.position.set(Math.cos(a) * 0.18, 0.2, Math.sin(a) * 0.18);
      arm.rotation.z = Math.cos(a) * lean;
      arm.rotation.x = -Math.sin(a) * lean;
      const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 0.65, r0, h1, 6), mat);
      seg1.position.y = h1 / 2; arm.add(seg1);
      // Upper segment: thinner, kinked a bit further out, pale grow-tip.
      const fork = new THREE.Group();
      fork.position.y = h1;
      fork.rotation.z = (rnd() - 0.3) * 0.8;
      fork.rotation.x = (rnd() - 0.5) * 0.6;
      const h2 = 0.35 + rnd() * 0.5;
      const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 0.3, r0 * 0.62, h2, 6), mat);
      seg2.position.y = h2 / 2; fork.add(seg2);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(r0 * 0.55, 6, 6), tipMat);
      tip.position.y = h2; fork.add(tip);
      arm.add(fork);
      g.add(arm);
      // Occasional short side nub low on the arm.
      if (rnd() < 0.5) {
        const nh = 0.2 + rnd() * 0.25;
        const nub = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 0.25, r0 * 0.5, nh, 5), mat);
        nub.position.set(0, h1 * (0.35 + rnd() * 0.3), 0);
        nub.rotation.z = 0.9 + rnd() * 0.5;
        arm.add(nub);
      }
    }
  },
  brain(g, { mat, darkMat }, rnd) {
    // Lumpy hemisphere: displace vertices with layered sine noise.
    const geo = new THREE.SphereGeometry(0.62, 26, 18, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const pos = geo.attributes.position;
    const o1 = rnd() * 10, o2 = rnd() * 10;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = Math.sin(v.x * 9 + o1) * Math.cos(v.z * 8 + o2) * 0.5
        + Math.sin(v.x * 17 + v.z * 15 + o1) * 0.5;
      v.multiplyScalar(1 + n * 0.09);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const dome = new THREE.Mesh(geo, mat);
    dome.position.y = 0.18; dome.scale.y = 0.72; g.add(dome);
    // Meandering darker grooves hugging the dome.
    for (let i = 0; i < 6; i++) {
      const groove = new THREE.Mesh(
        new THREE.TorusGeometry(0.34 + rnd() * 0.2, 0.035, 6, 22, 2 + rnd() * 3), darkMat);
      groove.position.y = 0.2 + rnd() * 0.16;
      groove.rotation.set(Math.PI / 2 + (rnd() - 0.5) * 0.7, rnd() * Math.PI * 2, rnd() * 0.6);
      groove.scale.y = 0.8;
      g.add(groove);
    }
  },
  plate(g, { mat, tipMat }, rnd) {
    // A stem holding two or three broad, thin, tilted tables.
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, 0.7, 7), mat);
    stem.position.y = 0.4; g.add(stem);
    const n = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      const r = 0.6 - i * 0.16 + rnd() * 0.08;
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, 0.05, 20), mat);
      disc.position.set((rnd() - 0.5) * 0.24, 0.55 + i * 0.38, (rnd() - 0.5) * 0.24);
      disc.rotation.x = (rnd() - 0.5) * 0.5; disc.rotation.z = (rnd() - 0.5) * 0.5;
      g.add(disc);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 6, 26), tipMat);
      rim.rotation.x = Math.PI / 2;
      disc.add(rim);
      rim.position.y = 0.02;
    }
  },
  polyp(g, { mat, tipMat }, rnd) {
    const mound = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mat);
    mound.position.y = 0.1; mound.scale.y = 0.55; g.add(mound);
    for (let i = 0; i < 12; i++) {
      const a = rnd() * Math.PI * 2, rr = 0.06 + rnd() * 0.34;
      const h = 0.22 + rnd() * 0.16;
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.065, h, 6), mat);
      tube.position.set(Math.cos(a) * rr, 0.28 + h / 2, Math.sin(a) * rr); g.add(tube);
      const t = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), tipMat);
      t.position.set(Math.cos(a) * rr, 0.3 + h, Math.sin(a) * rr); g.add(t);
    }
  },
  bubble(g, { mat }, rnd) {
    const m = mat.clone(); m.transparent = true; m.opacity = 0.82; m.roughness = 0.25;
    for (let i = 0; i < 11; i++) {
      const a = rnd() * Math.PI * 2, rr = 0.05 + rnd() * 0.3;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.13 + rnd() * 0.11, 12, 12), m);
      b.position.set(Math.cos(a) * rr, 0.2 + rnd() * 0.26, Math.sin(a) * rr);
      g.add(b);
    }
  },
  // Seagrass vegetation: a clump of tall, slightly bowed blades.
  grass(g, { mat, tipMat }, rnd) {
    const N = 9 + Math.floor(rnd() * 5);
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
function makeCoral(spec) {
  const g = new THREE.Group();
  const rnd = mulberry32(spec.id.length * 977 + coralCounter++ * 7919);
  // Slightly desaturated, rough, and barely emissive — real corals aren't neon;
  // bioluminescent species genuinely glow.
  const glow = BIOLUM.includes(spec.id) ? 0.55 : 0.04;
  const color = new THREE.Color(spec.color).lerp(new THREE.Color(0x8a8a80), 0.18);
  // The species skin carries the color; white base keeps the pattern true.
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: coralTexture(spec), roughness: 0.75,
    emissive: color, emissiveIntensity: glow,
    bumpMap: bumpTex, bumpScale: 0.015 });
  const tipMat = new THREE.MeshStandardMaterial({
    color: color.clone().lerp(new THREE.Color(0xfff6e8), 0.45), roughness: 0.6,
    emissive: color, emissiveIntensity: glow + 0.06 });
  const darkMat = new THREE.MeshStandardMaterial({
    color: color.clone().multiplyScalar(0.45), roughness: 0.85 });
  const base = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), coralRock);
  base.scale.set(1, 0.35, 1); base.position.y = 0.08;
  base.rotation.y = rnd() * Math.PI; g.add(base);
  (BODY[shapeOf(spec)] || BODY.brain)(g, { mat, tipMat, darkMat }, rnd);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.rotation.y = rnd() * Math.PI * 2;
  g.scale.setScalar(0.01);
  g.userData = { grow: 0, seed: rnd() * 6.28 };
  return g;
}

function makeFish(spec) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: fishTexture(spec), roughness: 0.45,
    bumpMap: bumpTex, bumpScale: 0.006 });
  const finMat = new THREE.MeshStandardMaterial({
    color: spec.accentColor ?? spec.color, roughness: 0.5,
    side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0a1420, roughness: 0.2 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), bodyMat);
  body.scale.set(0.42, 0.55, 1.15); g.add(body);               // nose points +z
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), eyeMat);
    eye.position.set(s * 0.17, 0.1, 0.42); g.add(eye);
    const pec = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.32, 4), finMat);
    pec.position.set(s * 0.22, -0.05, 0.12);
    pec.rotation.set(-Math.PI / 2, 0, s * 0.9); pec.scale.set(0.35, 1, 1); g.add(pec);
  }
  // Caudal fin as its own pivot so the render loop can wag it.
  const tailPivot = new THREE.Group();
  tailPivot.position.z = -0.5; g.add(tailPivot);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.55, 3), finMat);
  tail.rotation.x = -Math.PI / 2; tail.position.z = -0.28; tail.scale.set(0.14, 1, 1);
  tailPivot.add(tail);
  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 4), finMat);
  dorsal.position.set(0, 0.3, -0.05); dorsal.scale.set(0.24, 1, 1.5);
  dorsal.rotation.x = -0.25; g.add(dorsal);
  g.scale.setScalar(((spec.size ?? 14) / 16) * 0.55);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData.tail = tailPivot;
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

  // ── Lighting ────────────────────────────────────────────────────────────────
  scene.add(new THREE.HemisphereLight(0xcdeefc, 0x46483a, 1.05));
  const sun = new THREE.DirectionalLight(0xeaf6ff, 1.7);
  sun.position.set(6, 22, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -46; sun.shadow.camera.right = 46;
  sun.shadow.camera.top = 34; sun.shadow.camera.bottom = -34;
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
  const cTwi = new THREE.Color(0x22344f);   // dark twilight silt
  const tint = new THREE.Color();
  for (let i = 0; i < fp.count; i++) {
    const x = fp.getX(i), z = -fp.getY(i);   // plane is rotated -90° about X
    fp.setZ(i, terrainHeight(x, z));
    tint.copy(cCor)
      .lerp(cSea, smoothstep(12, 20, -x))
      .lerp(cTwi, smoothstep(11, 19, x));
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

  // Coral-zone scatter: rocks and a few weed tufts around the reef grid.
  for (let i = 0; i < 22; i++) {
    const a = i * 2.399, r = 8.5 + (i % 5) * 0.9;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
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
      const a = rnd() * Math.PI * 2, r = 7.6 + rnd() * 8.5;
      const x = clamp(zn.cx + Math.cos(a) * r, -44, -14.5), z = clamp(Math.sin(a) * r, -24, 24);
      weedTuft(x, z, 4 + Math.floor(rnd() * 3), [0x2f7d54, 0x3f8f4f, 0x557f3f][i % 3]);
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
      const a = rnd() * Math.PI * 2, r = 8 + rnd() * 8;
      const x = clamp(zn.cx + Math.cos(a) * r, 14.5, 44), z = clamp(Math.sin(a) * r, -24, 24);
      const spire = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), spireMat);
      spire.position.set(x, terrainHeight(x, z) + 1.2, z);
      spire.scale.set(0.7 + rnd() * 0.7, 2.2 + rnd() * 2.6, 0.7 + rnd() * 0.7);
      spire.rotation.y = rnd() * Math.PI;
      spire.castShadow = true; scene.add(spire);
    }
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2, r = 5 + rnd() * 10;
      const x = clamp(zn.cx + Math.cos(a) * r, 15, 43), z = clamp(Math.sin(a) * r, -22, 22);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16 + rnd() * 0.14, 10, 10),
        new THREE.MeshStandardMaterial({
          color: 0x11202e, emissive: 0x40e0ff, emissiveIntensity: 0.9, roughness: 0.4 }));
      orb.position.set(x, terrainHeight(x, z) + 0.25, z);
      orb.userData.seed = rnd() * 6.28;
      scene.add(orb); orbs.push(orb);
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
  for (const zn of Object.values(ZONES)) {
    const half = (zn.grid * TILE) / 2;
    for (let r = 0; r < zn.grid; r++) {
      for (let c = 0; c < zn.grid; c++) {
        const t = new THREE.Mesh(tileGeo, tileMats[zn.id]);
        t.position.set(
          zn.cx + c * TILE - half + TILE / 2, zn.floorY + 0.16,
          zn.cz + r * TILE - half + TILE / 2);
        t.userData = { biome: zn.id, c, r, occupied: false, baseMat: tileMats[zn.id] };
        t.receiveShadow = true;
        scene.add(t); tiles.push(t);
      }
    }
  }
  const tileAt = (b, c, r) => tiles.find(t =>
    t.userData.biome === b && t.userData.c === c && t.userData.r === r);

  // ── State + persistence ──────────────────────────────────────────────────────
  const corals = [];          // THREE groups; userData { grow, seed, spec, entry, levelScale }
  const fishes = [];          // motion state incl. .g mesh
  const placedCorals = [];    // { b, c, r, id, level }   (saved)
  const placedFish = [];      // { id, b, cx, cz, R, y, w, phase, bob, bobw } (saved)
  const seen = new Set();     // journal — every species ever placed (saved)
  let be = START_BE, polyps = START_POLYPS, pearls = START_PEARLS;
  let harmony = START_HARMONY, level = START_LEVEL;
  let incomePerSec = 0, polypPerSec = 0, beMax = BE_MAX;
  let onProgress = () => {};   // set once the palette exists — refreshes lock states

  const zoneUnlocked = (zid) => level >= ZONES[zid].unlock;

  function levelScaleFor(lvl) { return 1 + (lvl - 1) * 0.14; }

  function addCoral(spec, tile, lvl = 1) {
    tile.userData.occupied = true;
    const group = makeCoral(spec);
    group.position.set(tile.position.x, ZONES[tile.userData.biome].floorY + 0.18, tile.position.z);
    const entry = {
      b: tile.userData.biome, c: tile.userData.c, r: tile.userData.r, id: spec.id, level: lvl };
    group.userData.spec = spec;
    group.userData.entry = entry;
    group.userData.levelScale = levelScaleFor(lvl);
    scene.add(group); corals.push(group);
    placedCorals.push(entry);
    seen.add(spec.id);
    return group;
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
    score = Math.max(0, score);
    return Math.min(Math.max(score, harmony * 0.9), 100);   // ratchet, cap 100
  }

  function checkLevelUp() {
    while (level < MAX_LEVEL) {
      const req = LEVEL_REQS[level + 1];
      if (!req) break;
      const [c, f, h] = req;
      if (placedCorals.length >= c && placedFish.length >= f && harmony >= h) level++;
      else break;
    }
  }

  // Recompute reef-composition stats after any placement/removal.
  function refreshProgress() { harmony = computeHarmony(); checkLevelUp(); onProgress(); }

  function tryUpgrade(group) {
    const e = group.userData.entry;
    if (!e) return;
    if (e.level >= CORAL_MAX_LEVEL) { flash(rateEl, 'max level'); return; }
    const cost = upgradeCost(e.level);
    if (polyps < cost) { flash(rateEl, `need ${cost} 🌱`); return; }
    polyps -= cost;
    e.level++;
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
  function attachFish(spec, st, placed = false) {
    st.g = makeFish(spec);
    Object.assign(st.g.userData, { placed, stateRef: st });   // `placed` fish are player-owned & removable
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
    const pi = placedFish.indexOf(group.userData.saveRef); if (pi >= 0) placedFish.splice(pi, 1);
    scene.remove(group); disposeGroup(group);
    refreshProgress(); refreshHud(); save();
    if (refund > 0) flash(rateEl, `+${refund} BE`, '#7fd8b0');
  }

  // ── Save slots (two independent reefs) ───────────────────────────────────────
  let slot = localStorage.getItem(SLOT_KEY) || '1';
  if (slot !== '1' && slot !== '2') slot = '1';
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
        be, polyps, pearls, harmony, level,
        corals: placedCorals, fish: placedFish, seen: [...seen] }));
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
    if (rateEl) rateEl.textContent = `+${incomePerSec.toFixed(1)}/s`;
    if (hmEl) hmEl.textContent = Math.round(harmony);
    if (lvlEl) lvlEl.textContent = level;
    if (polypEl) polypEl.textContent = Math.floor(polyps);
    if (pearlEl) pearlEl.textContent = Math.floor(pearls);
  }

  // ── Save-slot switcher (two independent reefs) ────────────────────────────────
  const slotsEl = document.getElementById('slots');
  if (slotsEl) {
    ['1', '2'].forEach(s => {
      const b = document.createElement('button');
      b.className = 'slot-btn' + (s === slot ? ' active' : '');
      b.textContent = `Slot ${s}`;
      b.onclick = () => {
        if (s === slot) return;
        save();                              // persist current slot
        localStorage.setItem(SLOT_KEY, s);
        location.reload();                   // clean teardown → reload into the new slot
      };
      slotsEl.appendChild(b);
    });
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
  function clearSel() { rows.forEach(r => r.btn.classList.remove('sel')); }

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
  if (utilC.length) { label('Utility coral · 🪸 polyps'); utilC.forEach(s => button(s, 'coral')); }

  onProgress = () => { refreshLocks(); refreshZoneLocks(); };   // sync locks with level-ups
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
  function journalRow(spec, type) {
    const need = Math.max(spec.unlockLevel ?? 1, ZONES[primaryBiome(spec)].unlock);
    const found = seen.has(spec.id);
    const locked = need > level;
    const count = type === 'coral'
      ? placedCorals.filter(e => e.id === spec.id).length
      : placedFish.filter(f => f.id === spec.id).length;
    const status = found ? (count ? `×${count} in reef` : '✓ discovered')
      : locked ? `🔒 Lv${need}` : 'not yet placed';
    const zones = Object.keys(ZONES).filter(id => matchesBiome(spec, id));
    return `<div class="m-row${locked && !found ? ' locked' : ''}">`
      + `<span class="dot" style="background:${hex(spec.color)}"></span>`
      + `<span>${found || !locked ? spec.name : '???'}`
      + ` ${zones.map(id => BIOMES[id].icon).join('')}</span>`
      + `<small>${status}</small></div>`;
  }
  function fillJournal() {
    const cs = coralSpecs, fs = fishSpecs;
    const all = [...cs, ...fs];
    const found = all.filter(s => seen.has(s.id)).length;
    journal.ov.querySelector('.m-sub')?.remove();
    journal.ov.querySelector('.m-title').insertAdjacentHTML('afterend',
      `<div class="m-sub">Discovered ${found} of ${all.length} species — place one to record it.</div>`);
    let html = '';
    if (journalTab !== 'fish') {
      html += '<div class="m-sec">Coral & structures</div>'
        + cs.map(s => journalRow(s, 'coral')).join('');
    }
    if (journalTab !== 'coral') {
      html += '<div class="m-sec">Fish</div>' + fs.map(s => journalRow(s, 'fish')).join('');
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
      : `<span>⬆ Upgrade to Lv${e.level + 1}</span><span>${cost} 🌱</span>`;
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

  const menuEl = document.getElementById('menu3d');
  if (menuEl) {
    [['📖 Journal', journal, fillJournal],
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
  }
  recomputeRates(); refreshProgress(); refreshHud();

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
      if (be < cost) { flash(rateEl, 'not enough 🫧'); return false; }
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

  renderer.domElement.addEventListener('pointerdown', ev => {
    setPtr(ev);

    if (selected.type === 'remove') {
      const cHit = ray.intersectObjects(corals, true)[0]?.object;
      if (cHit) { const g = ancestorWith(cHit, 'entry'); if (g) removeCoralGroup(g); return; }
      const fHit = ray.intersectObjects(fishes.map(f => f.g), true)[0]?.object;
      if (fHit) { const g = ancestorWith(fHit, 'stateRef'); if (g) removeFishGroup(g); return; }
      return;
    }

    // Click a placed coral to open its upgrade menu — takes priority over placement.
    const coralHit = ray.intersectObjects(corals, true)[0]?.object;
    if (coralHit) {
      const g = ancestorWith(coralHit, 'entry');
      if (g) { openUpgrade(g); return; }
    }
    if (selected.type === 'coral') {
      const t = ray.intersectObjects(tiles, false)[0]?.object;
      if (!t || t.userData.occupied) return;
      if (!zoneCheck(selected.spec, t.userData.biome)) return;
      if (!charge(selected.spec, CORAL_COST)) return;
      addCoral(selected.spec, t);
      recomputeRates(); refreshProgress(); refreshHud(); save();
    } else {
      const hit = ray.intersectObject(floor, false)[0];
      if (!hit) return;
      const zone = zoneAt(hit.point.x);
      if (!zoneCheck(selected.spec, zone.id)) return;
      if (!charge(selected.spec, FISH_COST)) return;
      const st = fishState(selected.spec, hit.point.x, hit.point.z, fishes.length, zone);
      const g = attachFish(selected.spec, st, true);
      const rec = fishSaveData(st); placedFish.push(rec); g.userData.saveRef = rec;
      refreshProgress(); refreshHud(); save();
    }
  });

  window.addEventListener('beforeunload', save);
  const saveTimer = setInterval(save, 5000);

  // ── Hydrothermal vent — native to the twilight basin ─────────────────────────
  const ventX = 33, ventZ = -13;
  const { plumeUpdate } = buildVent(scene,
    new THREE.Vector3(ventX, terrainHeight(ventX, ventZ), ventZ));

  // ── Marine snow ──────────────────────────────────────────────────────────────
  const SNOW = 380;
  const snowGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(SNOW * 3);
  for (let i = 0; i < SNOW; i++) {
    sp[i * 3] = (Math.cos(i * 12.9) * 0.5 + 0.5) * 92 - 46;
    sp[i * 3 + 1] = (Math.sin(i * 7.3) * 0.5 + 0.5) * 29 - 5;
    sp[i * 3 + 2] = (Math.cos(i * 4.1) * 0.5 + 0.5) * 92 - 46;
  }
  snowGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({
    color: 0xbfe6ff, size: 0.12, transparent: true, opacity: 0.5, depthWrite: false }));
  scene.add(snow);

  // ── Render loop ──────────────────────────────────────────────────────────────
  const clock = new THREE.Clock();
  let running = true;
  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = clock.getDelta();
    const t = clock.getElapsedTime();

    be = Math.min(be + incomePerSec * dt, beMax);
    polyps = Math.min(polyps + polypPerSec * dt, POLYP_MAX);
    refreshHud();

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
    }
    for (const f of fishes) {
      const ang = f.phase + t * f.w;
      const x = Math.cos(ang) * f.R + f.cx;
      const z = Math.sin(ang) * f.R + f.cz;
      f.g.position.set(x, f.y + Math.sin(t * f.bobw + f.phase) * f.bob, z);
      const heading = Math.atan2(-Math.sin(ang) * f.w, Math.cos(ang) * f.w);
      f.g.rotation.y = heading + Math.sin(t * 6 + f.phase) * 0.1;
      if (f.g.userData.tail) f.g.userData.tail.rotation.y = Math.sin(t * 7 + f.phase) * 0.5;
    }
    for (const w of weeds) w.rotation.z = Math.sin(t * 0.9 + w.userData.seed) * 0.12;
    for (const o of orbs) o.material.emissiveIntensity = 0.75 + Math.sin(t * 1.6 + o.userData.seed) * 0.35;

    caustics.offset.x = t * 0.012 + Math.sin(t * 0.35) * 0.006;
    caustics.offset.y = t * 0.008 + Math.cos(t * 0.28) * 0.006;

    const sposArr = snow.geometry.attributes.position;
    for (let i = 0; i < SNOW; i++) {
      let y = sposArr.getY(i) - dt * 0.35;
      if (y < -5) y += 29;
      sposArr.setY(i, y);
    }
    sposArr.needsUpdate = true;

    plumeUpdate(t, ventIntensity((t / VENT_PERIOD) % 1));
    controls.update();
    renderer.render(scene, camera);
  }

  frame();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { stop() { running = false; clearInterval(saveTimer); save(); } };
}

function flash(el, msg, color = '#ff8a80') {
  if (!el) return;
  const prev = el.textContent;
  el.textContent = msg; el.style.color = color;
  setTimeout(() => { el.textContent = prev; el.style.color = ''; }, 900);
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
