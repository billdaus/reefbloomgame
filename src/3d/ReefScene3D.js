// Reef Bloom — 3D reef (Phase 1 of the three.js render track).
// A playable slice of the actual game in 3D: a seafloor grid you click to
// place distinct coral species on, placeable fish, a live Bubble-Essence
// economy using Classic's numbers, its own saved reef, and the vent.
// No biomes yet — this is the coral reef only.
//
// Self-contained: reuses Classic's DATA (species, costs, income) and its own
// localStorage slot, but not Classic's save. Run `npm run dev` → /threed.html.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  CORAL_SPECIES, FISH_SPECIES, CORAL_COST, FISH_COST, BE_PER_TICK, START_BE,
} from '../constants.js';

const GRID = 7;
const TILE = 2;
const HALF = (GRID * TILE) / 2;
const VENT_PERIOD = 5.2;
const INCOME_SCALE = 0.5;
const SAVE_KEY = 'reefbloom_3d_save_v1';

const BIOLUM = ['auroraCoral', 'twilightBrain', 'phantomPolyp', 'wispCoral', 'lanternCoral'];

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

function starterCorals() {
  return Object.values(CORAL_SPECIES)
    .filter(s => (!s.biome || s.biome === 'coral')
      && !s.pearlCost && !s.polypCost && !s.utility
      && CORAL_COST[s.tier] != null)
    .slice(0, 7);
}
function starterFish() {
  return Object.values(FISH_SPECIES)
    .filter(s => (!s.biome || s.biome === 'coral' || s.biome === 'both')
      && s.layer && s.color != null && FISH_COST[s.tier] != null && !s.pearlCost)
    .slice(0, 6);
}

// ── Coral geometry — a distinct silhouette per species family ──────────────────
const coralRock = new THREE.MeshStandardMaterial({ color: 0x1c3c4c, roughness: 1, flatShading: true });

function shapeOf(spec) {
  const id = spec.id;
  if (['staghorn', 'finger', 'firetip', 'elkhorn', 'candycane', 'pillar'].includes(id)) return 'branch';
  if (['lettuce', 'toadstool', 'table'].includes(id)) return 'plate';
  if (['star', 'starter'].includes(id)) return 'polyp';
  if (['bubble'].includes(id)) return 'bubble';
  if (['brain', 'ghost'].includes(id)) return 'brain';
  return spec.tall ? 'branch' : 'brain';
}

const BODY = {
  branch(g, mat) {
    const N = 6;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + (i % 2) * 0.5;
      const h = 1.0 + (i % 3) * 0.55;
      const br = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, h, 4, 8), mat);
      br.position.set(Math.cos(a) * 0.22, 0.28 + h / 2, Math.sin(a) * 0.22);
      br.rotation.z = Math.cos(a) * 0.3; br.rotation.x = -Math.sin(a) * 0.3;
      g.add(br);
      const h2 = 0.5 + (i % 2) * 0.3;
      const fk = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, h2, 4, 6), mat);
      fk.position.set(Math.cos(a) * 0.34, 0.28 + h, Math.sin(a) * 0.34);
      fk.rotation.z = Math.cos(a) * 0.7;
      g.add(fk);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), mat);
      tip.position.set(Math.cos(a) * 0.42, 0.34 + h + h2 * 0.4, Math.sin(a) * 0.42);
      g.add(tip);
    }
  },
  brain(g, mat) {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), mat);
    dome.position.y = 0.16; dome.scale.y = 0.9; g.add(dome);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5 - i * 0.15, 0.05, 8, 26), mat);
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.44 + i * 0.12; g.add(ring);
    }
  },
  plate(g, mat) {
    for (let i = 0; i < 4; i++) {
      const r = 0.32 + i * 0.15;
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.86, 0.08, 18), mat);
      disc.position.set(Math.sin(i * 2.1) * 0.1, 0.3 + i * 0.27, Math.cos(i * 2.1) * 0.1);
      disc.rotation.x = Math.sin(i) * 0.22; disc.rotation.z = Math.cos(i) * 0.22;
      g.add(disc);
    }
  },
  polyp(g, mat) {
    const mound = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mat);
    mound.position.y = 0.1; mound.scale.y = 0.55; g.add(mound);
    for (let i = 0; i < 11; i++) {
      const a = i * 0.66, rr = 0.1 + ((i * 37) % 30) / 100;
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 6), mat);
      tube.position.set(Math.cos(a) * rr, 0.34, Math.sin(a) * rr); g.add(tube);
      const t = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), mat);
      t.position.set(Math.cos(a) * rr, 0.49, Math.sin(a) * rr); g.add(t);
    }
  },
  bubble(g, mat) {
    const m = mat.clone(); m.transparent = true; m.opacity = 0.85;
    for (let i = 0; i < 9; i++) {
      const a = i * 0.9, rr = 0.08 + ((i * 53) % 25) / 100;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.15 + ((i * 17) % 10) / 100, 12, 12), m);
      b.position.set(Math.cos(a) * rr, 0.24 + ((i * 29) % 22) / 100, Math.sin(a) * rr);
      g.add(b);
    }
  },
};

function makeCoral(spec) {
  const g = new THREE.Group();
  const glow = BIOLUM.includes(spec.id) ? 0.5 : 0.16;
  const mat = new THREE.MeshStandardMaterial({
    color: spec.color, roughness: 0.45, emissive: spec.color, emissiveIntensity: glow });
  const base = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), coralRock);
  base.scale.set(1, 0.35, 1); base.position.y = 0.08; g.add(base);
  (BODY[shapeOf(spec)] || BODY.brain)(g, mat);
  g.scale.setScalar(0.01);
  g.userData = { grow: 0, seed: (spec.id.length * 1.7) % 6.28 };
  return g;
}

function makeFish(spec) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: spec.color, roughness: 0.5, emissive: spec.color, emissiveIntensity: 0.05 });
  const finMat = new THREE.MeshStandardMaterial({
    color: spec.accentColor ?? spec.color, roughness: 0.6, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), bodyMat);
  body.scale.set(0.6, 0.5, 1.25); g.add(body);                 // nose points +z
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.6, 4), finMat);
  tail.rotation.x = -Math.PI / 2; tail.position.z = -0.8; tail.scale.set(0.22, 1, 1); g.add(tail);
  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 4), finMat);
  dorsal.position.set(0, 0.28, 0); dorsal.scale.set(0.4, 1, 1.4); g.add(dorsal);
  g.scale.setScalar(((spec.size ?? 14) / 16) * 0.55);
  return g;
}

export function initReefScene3D(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.background = gradientTexture([[0.0, '#1d6c8f'], [0.45, '#0e456a'], [1.0, '#041826']]);
  scene.fog = new THREE.FogExp2(0x0c3c5a, 0.02);

  const camera = new THREE.PerspectiveCamera(
    50, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.position.set(0, 11, 21);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 2, 0);
  controls.enableDamping = true; controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 7; controls.maxDistance = 70;

  // ── Lighting ────────────────────────────────────────────────────────────────
  scene.add(new THREE.HemisphereLight(0xbfeaff, 0x0a2233, 1.05));
  const sun = new THREE.DirectionalLight(0xdff2ff, 1.15);
  sun.position.set(6, 22, 8); scene.add(sun);
  const fill = new THREE.DirectionalLight(0x2f7fae, 0.4);
  fill.position.set(-10, 6, -6); scene.add(fill);

  // ── Seafloor ─────────────────────────────────────────────────────────────────
  const floorGeo = new THREE.PlaneGeometry(240, 240, 60, 60);
  const fp = floorGeo.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    const x = fp.getX(i), y = fp.getY(i);
    fp.setZ(i, Math.sin(x * 0.08) * Math.cos(y * 0.07) * 1.1 + Math.sin(x * 0.21 + y * 0.13) * 0.35);
  }
  floorGeo.computeVertexNormals();
  const floor = new THREE.Mesh(floorGeo,
    new THREE.MeshStandardMaterial({ color: 0x17506a, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.2; scene.add(floor);

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x1a3d4f, roughness: 1, flatShading: true });
  const weeds = [];
  for (let i = 0; i < 26; i++) {
    const a = i * 2.399, r = HALF + 3 + (i % 6) * 2.4;
    if (i % 3) {
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 + (i % 4) * 0.4, 0), rockMat);
      rock.position.set(Math.cos(a) * r, -0.1, Math.sin(a) * r);
      rock.rotation.set(a, a * 1.7, a * 0.5); rock.scale.y = 0.65; scene.add(rock);
    } else {
      const weed = new THREE.Group();
      const blades = 3 + (i % 3);
      for (let b = 0; b < blades; b++) {
        const h = 1.6 + (b % 3) * 0.7;
        const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.14, h, 5),
          new THREE.MeshStandardMaterial({ color: 0x2f7d54, roughness: 0.8 }));
        blade.position.set((b - blades / 2) * 0.18, h / 2, 0); weed.add(blade);
      }
      weed.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      weed.userData.seed = a; scene.add(weed); weeds.push(weed);
    }
  }

  // ── Grid tiles ───────────────────────────────────────────────────────────────
  const tileGeo = new THREE.BoxGeometry(TILE * 0.9, 0.12, TILE * 0.9);
  const sandMat = new THREE.MeshStandardMaterial({ color: 0x1f5f7c, roughness: 1 });
  const hoverMat = new THREE.MeshStandardMaterial({
    color: 0x39c9d8, roughness: 0.8, emissive: 0x2aa6c4, emissiveIntensity: 0.55 });
  const tiles = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const t = new THREE.Mesh(tileGeo, sandMat);
      t.position.set(c * TILE - HALF + TILE / 2, 0.06, r * TILE - HALF + TILE / 2);
      t.userData = { c, r, occupied: false };
      scene.add(t); tiles.push(t);
    }
  }
  const tileAt = (c, r) => tiles.find(t => t.userData.c === c && t.userData.r === r);

  // ── State + persistence ──────────────────────────────────────────────────────
  const corals = [];          // { group, seed, grow }
  const fishes = [];          // motion state incl. .g mesh
  const placedCorals = [];    // { c, r, id }   (saved)
  const placedFish = [];      // { id, cx, cz, R, y, w, phase, bob, bobw } (saved)
  let be = START_BE, incomePerSec = 0;

  function addCoral(spec, tile) {
    tile.userData.occupied = true;
    const group = makeCoral(spec);
    group.position.set(tile.position.x, 0.1, tile.position.z);
    scene.add(group); corals.push(group);
    incomePerSec += (BE_PER_TICK[spec.tier] ?? 1) * INCOME_SCALE;
  }
  function fishState(spec, cx, cz, i) {
    return {
      id: spec.id, cx, cz, R: 4 + (i % 5) * 1.6, y: 2.2 + (i % 4) * 1.4,
      w: (0.12 + (i % 4) * 0.05) * (i % 2 ? 1 : -1),
      phase: i * 1.37, bob: 0.4 + (i % 3) * 0.2, bobw: 0.6 + (i % 3) * 0.3,
    };
  }
  function attachFish(spec, st) { st.g = makeFish(spec); scene.add(st.g); fishes.push(st); }
  const fishSaveData = st => ({
    id: st.id, cx: st.cx, cz: st.cz, R: st.R, y: st.y, w: st.w,
    phase: st.phase, bob: st.bob, bobw: st.bobw });

  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        be, corals: placedCorals, fish: placedFish }));
    } catch (e) { /* storage full / disabled — ignore */ }
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; }
  }

  // ── Palette UI (coral + fish groups) ─────────────────────────────────────────
  const beEl = document.getElementById('be-count');
  const rateEl = document.getElementById('be-rate');
  const paletteEl = document.getElementById('palette');
  const coralSpecs = starterCorals();
  const fishSpecs = starterFish();
  let selected = { type: 'coral', spec: coralSpecs[0] };

  function label(text) {
    const l = document.createElement('div');
    l.textContent = text;
    l.style.cssText = 'width:100%;text-align:center;font-size:10px;letter-spacing:3px;'
      + 'text-transform:uppercase;color:#7fb8d4;margin:2px 0;';
    paletteEl.appendChild(l);
  }
  function button(spec, type, cost) {
    const btn = document.createElement('button');
    btn.className = 'coral-btn';
    btn.innerHTML = `<span class="dot" style="background:${hex(spec.color)}"></span>`
      + `${spec.name}<small>${cost} BE</small>`;
    btn.onclick = () => {
      selected = { type, spec };
      [...paletteEl.querySelectorAll('.coral-btn')].forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
    };
    if (spec === selected.spec) btn.classList.add('sel');
    paletteEl.appendChild(btn);
  }
  label('Coral · click a tile');
  coralSpecs.forEach(s => button(s, 'coral', CORAL_COST[s.tier]));
  label('Fish · click the water');
  fishSpecs.forEach(s => button(s, 'fish', FISH_COST[s.tier]));

  function refreshHud() {
    if (beEl) beEl.textContent = Math.floor(be);
    if (rateEl) rateEl.textContent = `+${incomePerSec.toFixed(1)}/s`;
  }

  // ── Restore saved reef ───────────────────────────────────────────────────────
  const saved = load();
  if (saved) {
    be = saved.be ?? START_BE;
    (saved.corals ?? []).forEach(({ c, r, id }) => {
      const spec = CORAL_SPECIES[id], tile = tileAt(c, r);
      if (spec && tile && !tile.userData.occupied) { addCoral(spec, tile); placedCorals.push({ c, r, id }); }
    });
    (saved.fish ?? []).forEach(d => {
      const spec = FISH_SPECIES[d.id];
      if (spec) { const st = { ...d }; attachFish(spec, st); placedFish.push(fishSaveData(st)); }
    });
  }
  // Ambient school for baseline life (not saved)
  for (let i = 0; i < 8; i++) {
    const spec = fishSpecs[i % fishSpecs.length];
    attachFish(spec, fishState(spec, (i % 3 - 1) * 1.5, (i % 2 ? 1 : -1) * 1.2, i + 20));
  }
  refreshHud();

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
    if (hovered && hovered !== t) hovered.material = sandMat;
    if (selected.type === 'coral' && t && !t.userData.occupied) { t.material = hoverMat; hovered = t; }
    else { if (hovered) hovered.material = sandMat; hovered = null; }
  });
  renderer.domElement.addEventListener('pointerdown', ev => {
    setPtr(ev);
    if (selected.type === 'coral') {
      const t = ray.intersectObjects(tiles, false)[0]?.object;
      if (!t || t.userData.occupied) return;
      const cost = CORAL_COST[selected.spec.tier];
      if (be < cost) { flash(rateEl, 'not enough BE'); return; }
      be -= cost; addCoral(selected.spec, t);
      placedCorals.push({ c: t.userData.c, r: t.userData.r, id: selected.spec.id });
      refreshHud(); save();
    } else {
      const hit = ray.intersectObject(floor, false)[0];
      if (!hit) return;
      const cost = FISH_COST[selected.spec.tier];
      if (be < cost) { flash(rateEl, 'not enough BE'); return; }
      be -= cost;
      const st = fishState(selected.spec, hit.point.x, hit.point.z, fishes.length);
      attachFish(selected.spec, st); placedFish.push(fishSaveData(st));
      refreshHud(); save();
    }
  });

  window.addEventListener('beforeunload', save);
  const saveTimer = setInterval(save, 5000);

  // ── Ambient vent ─────────────────────────────────────────────────────────────
  const { plumeUpdate } = buildVent(scene, new THREE.Vector3(HALF + 5, -0.2, -HALF - 3));

  // ── Render loop ──────────────────────────────────────────────────────────────
  const clock = new THREE.Clock();
  let running = true;
  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = clock.getDelta();
    const t = clock.getElapsedTime();

    be += incomePerSec * dt; refreshHud();

    for (const g of corals) {
      if (g.userData.grow < 1) {
        g.userData.grow = Math.min(1, g.userData.grow + dt * 2.2);
        const s = g.userData.grow;
        g.scale.setScalar(s * (1 + 0.12 * (1 - s)));
      }
      g.rotation.z = Math.sin(t * 0.8 + g.userData.seed) * 0.04;
    }
    for (const f of fishes) {
      const ang = f.phase + t * f.w;
      const x = Math.cos(ang) * f.R + f.cx;
      const z = Math.sin(ang) * f.R + f.cz;
      f.g.position.set(x, f.y + Math.sin(t * f.bobw + f.phase) * f.bob, z);
      const heading = Math.atan2(-Math.sin(ang) * f.w, Math.cos(ang) * f.w);
      f.g.rotation.y = heading + Math.sin(t * 6 + f.phase) * 0.16;
    }
    for (const w of weeds) w.rotation.z = Math.sin(t * 0.9 + w.userData.seed) * 0.12;

    const sposArr = snow.geometry.attributes.position;
    for (let i = 0; i < SNOW; i++) {
      let y = sposArr.getY(i) - dt * 0.35;
      if (y < 0) y += 24;
      sposArr.setY(i, y);
    }
    sposArr.needsUpdate = true;

    plumeUpdate(t, ventIntensity((t / VENT_PERIOD) % 1));
    controls.update();
    renderer.render(scene, camera);
  }

  // ── Marine snow ──────────────────────────────────────────────────────────────
  const SNOW = 320;
  const snowGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(SNOW * 3);
  for (let i = 0; i < SNOW; i++) {
    sp[i * 3] = (Math.cos(i * 12.9) * 0.5 + 0.5) * 80 - 40;
    sp[i * 3 + 1] = (Math.sin(i * 7.3) * 0.5 + 0.5) * 24;
    sp[i * 3 + 2] = (Math.cos(i * 4.1) * 0.5 + 0.5) * 80 - 40;
  }
  snowGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({
    color: 0xbfe6ff, size: 0.12, transparent: true, opacity: 0.5, depthWrite: false }));
  scene.add(snow);

  frame();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { stop() { running = false; clearInterval(saveTimer); save(); } };
}

function flash(el, msg) {
  if (!el) return;
  const prev = el.textContent;
  el.textContent = msg; el.style.color = '#ff8a80';
  setTimeout(() => { el.textContent = prev; el.style.color = ''; }, 900);
}

function buildVent(scene, pos) {
  const vent = new THREE.Group();
  vent.position.copy(pos); scene.add(vent);
  const rock = new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.95, flatShading: true });
  const base = new THREE.Mesh(new THREE.ConeGeometry(2.6, 4.2, 10, 1, true), rock);
  base.position.y = 2.1; vent.add(base);
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.4, 4, 10, 1, true), rock);
  stack.position.y = 5.4; vent.add(stack);
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
