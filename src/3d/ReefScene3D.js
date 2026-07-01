// Reef Bloom — 3D reef (Phase 1 of the three.js render track).
// A playable slice of the actual game in 3D: a seafloor grid you click to
// place real coral species on, a live Bubble-Essence economy using the same
// numbers as Classic, and the hydrothermal vent as ambient scenery.
//
// Self-contained for now — reuses Classic's DATA (species, costs, income) but
// not yet its save/state. Full state+save integration is a later phase.
// Run `npm run dev` and open /threed.html.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  CORAL_SPECIES, CORAL_COST, BE_PER_TICK, START_BE,
} from '../constants.js';

const GRID = 7;                 // 7×7 buildable tiles
const TILE = 2;                 // world units per tile
const HALF = (GRID * TILE) / 2;
const VENT_PERIOD = 5.2;
const INCOME_SCALE = 0.5;       // BE per second = Σ tier-tick-value × this

function ventIntensity(p) {
  if (p < 0.12) return p / 0.12;
  if (p < 0.48) return 1;
  if (p < 0.62) return 1 - (p - 0.48) / 0.14;
  return 0;
}

// Early coral catalog for the palette — coral-biome, BE-purchasable species.
function starterCorals() {
  return Object.values(CORAL_SPECIES)
    .filter(s => (!s.biome || s.biome === 'coral')
      && !s.pearlCost && !s.polypCost && !s.utility
      && CORAL_COST[s.tier] != null)
    .slice(0, 7);
}

export function initReefScene3D(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a3550);
  scene.fog = new THREE.FogExp2(0x0a3550, 0.022);

  const camera = new THREE.PerspectiveCamera(
    52, window.innerWidth / window.innerHeight, 0.1, 300);
  camera.position.set(0, 12, 20);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minDistance = 8;
  controls.maxDistance = 60;

  // ── Lighting ────────────────────────────────────────────────────────────────
  scene.add(new THREE.HemisphereLight(0x9fd7f0, 0x06202f, 0.9));
  const sun = new THREE.DirectionalLight(0xbfe6ff, 0.7);
  sun.position.set(8, 18, 6);
  scene.add(sun);

  // ── Seafloor + grid tiles ────────────────────────────────────────────────────
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x123243, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  scene.add(floor);

  const sandMat = new THREE.MeshStandardMaterial({ color: 0x1d566b, roughness: 1 });
  const hoverMat = new THREE.MeshStandardMaterial({
    color: 0x2f7f9a, roughness: 1, emissive: 0x2f7f9a, emissiveIntensity: 0.4 });
  const tileGeo = new THREE.BoxGeometry(TILE * 0.94, 0.2, TILE * 0.94);
  const tiles = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const t = new THREE.Mesh(tileGeo, sandMat);
      t.position.set(c * TILE - HALF + TILE / 2, 0.1, r * TILE - HALF + TILE / 2);
      t.userData = { c, r, occupied: false };
      scene.add(t);
      tiles.push(t);
    }
  }

  // ── Coral mesh factory ───────────────────────────────────────────────────────
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x214050, roughness: 1 });
  function makeCoral(spec) {
    const g = new THREE.Group();
    const glow = ['auroraCoral', 'twilightBrain', 'phantomPolyp', 'wispCoral', 'lanternCoral']
      .includes(spec.id) ? 0.5 : 0.12;
    const mat = new THREE.MeshStandardMaterial({
      color: spec.color, roughness: 0.55, emissive: spec.color, emissiveIntensity: glow });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 0.3, 8), rockMat);
    base.position.y = 0.15;
    g.add(base);

    if (spec.tall) {                                   // branching pillar coral
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const h = 1.1 + (i % 3) * 0.45;
        const br = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.16, h, 6), mat);
        br.position.set(Math.cos(a) * 0.24, 0.3 + h / 2, Math.sin(a) * 0.24);
        br.rotation.z = Math.cos(a) * 0.22;
        br.rotation.x = -Math.sin(a) * 0.22;
        g.add(br);
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), mat);
        tip.position.set(Math.cos(a) * 0.32, 0.3 + h, Math.sin(a) * 0.32);
        g.add(tip);
      }
    } else {                                           // rounded brain/boulder coral
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat);
      dome.position.y = 0.3; dome.scale.y = 0.75;
      g.add(dome);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const bump = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 8), mat);
        bump.position.set(Math.cos(a) * 0.3, 0.4, Math.sin(a) * 0.3);
        g.add(bump);
      }
    }
    // pop-in animation seed
    g.scale.setScalar(0.01);
    g.userData.grow = 0;
    return g;
  }

  const growing = [];   // corals still animating their pop-in

  // ── Ambient hydrothermal vent (non-interactive scenery) ──────────────────────
  const { plumeUpdate } = buildVent(scene, new THREE.Vector3(HALF + 4, 0, -HALF - 2));

  // ── Economy + palette UI ─────────────────────────────────────────────────────
  let be = START_BE;
  let incomePerSec = 0;
  const beEl = document.getElementById('be-count');
  const rateEl = document.getElementById('be-rate');
  const paletteEl = document.getElementById('palette');
  const specs = starterCorals();
  let selected = specs[0];

  specs.forEach(spec => {
    const cost = CORAL_COST[spec.tier];
    const btn = document.createElement('button');
    btn.className = 'coral-btn';
    btn.innerHTML = `<span class="dot" style="background:#${spec.color.toString(16).padStart(6, '0')}"></span>`
      + `${spec.name}<small>${cost} BE</small>`;
    btn.onclick = () => {
      selected = spec;
      [...paletteEl.children].forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
    };
    if (spec === selected) btn.classList.add('sel');
    paletteEl.appendChild(btn);
  });

  function refreshHud() {
    if (beEl) beEl.textContent = Math.floor(be);
    if (rateEl) rateEl.textContent = `+${incomePerSec.toFixed(1)}/s`;
  }
  refreshHud();

  // ── Pointer picking (hover + place) ──────────────────────────────────────────
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  let hovered = null;

  function pick(ev) {
    ptr.x = (ev.clientX / window.innerWidth) * 2 - 1;
    ptr.y = -(ev.clientY / window.innerHeight) * 2 + 1;
    ray.setFromCamera(ptr, camera);
    return ray.intersectObjects(tiles, false)[0]?.object ?? null;
  }

  renderer.domElement.addEventListener('pointermove', ev => {
    const t = pick(ev);
    if (hovered && hovered !== t) hovered.material = sandMat;
    if (t && !t.userData.occupied) { t.material = hoverMat; hovered = t; }
    else hovered = null;
  });

  renderer.domElement.addEventListener('pointerdown', ev => {
    const t = pick(ev);
    if (!t || t.userData.occupied) return;
    const cost = CORAL_COST[selected.tier];
    if (be < cost) { flash(rateEl, 'not enough BE'); return; }
    be -= cost;
    t.userData.occupied = true;
    t.material = sandMat;
    const coral = makeCoral(selected);
    coral.position.set(t.position.x, 0.2, t.position.z);
    scene.add(coral);
    growing.push(coral);
    incomePerSec += (BE_PER_TICK[selected.tier] ?? 1) * INCOME_SCALE;
    refreshHud();
  });

  // ── Render loop ──────────────────────────────────────────────────────────────
  const clock = new THREE.Clock();
  let running = true;
  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = clock.getDelta();
    const t = clock.getElapsedTime();

    be += incomePerSec * dt;
    refreshHud();

    for (let i = growing.length - 1; i >= 0; i--) {
      const g = growing[i];
      g.userData.grow = Math.min(1, g.userData.grow + dt * 2.2);
      const s = g.userData.grow;
      g.scale.setScalar(s * (1 + 0.12 * (1 - s)));   // slight overshoot
      if (s >= 1) growing.splice(i, 1);
    }

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

  return { stop() { running = false; } };
}

// Brief red flash on an element to signal an invalid action.
function flash(el, msg) {
  if (!el) return;
  const prev = el.textContent;
  el.textContent = msg;
  el.style.color = '#ff8a80';
  setTimeout(() => { el.textContent = prev; el.style.color = ''; }, 900);
}

// ── Hydrothermal vent builder — chimney + animated plume, returns updater ──────
function buildVent(scene, pos) {
  const vent = new THREE.Group();
  vent.position.copy(pos);
  scene.add(vent);

  const rock = new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.95 });
  const base = new THREE.Mesh(new THREE.ConeGeometry(2.6, 4.2, 12, 1, true), rock);
  base.position.y = 2.1; vent.add(base);
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.4, 4, 12, 1, true), rock);
  stack.position.y = 5.4; vent.add(stack);

  const MOUTH_Y = 7.4;
  const mouthMat = new THREE.MeshStandardMaterial({
    color: 0x120a06, emissive: 0xff6a3d, emissiveIntensity: 0 });
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.65, 16), mouthMat);
  mouth.rotation.x = -Math.PI / 2; mouth.position.y = MOUTH_Y; vent.add(mouth);

  const glow = new THREE.PointLight(0xff7a3a, 0, 26, 2);
  glow.position.y = MOUTH_Y + 0.3; vent.add(glow);

  const PUFFS = 16;
  const puffGeo = new THREE.SphereGeometry(1, 12, 12);
  const puffs = [];
  for (let i = 0; i < PUFFS; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: i % 2 ? 0x2a2d36 : 0x352a20, transparent: true, opacity: 0, roughness: 1 });
    const m = new THREE.Mesh(puffGeo, mat);
    m.userData = { seed: i / PUFFS, sway: (i * 12.9898) % (Math.PI * 2) };
    vent.add(m);
    puffs.push(m);
  }

  function plumeUpdate(t, k) {
    mouthMat.emissiveIntensity = 2.5 * k;
    glow.intensity = 40 * k;
    for (const m of puffs) {
      const ph = (t / 3.2 + m.userData.seed) % 1;
      const h = ph * 9;
      m.position.set(Math.sin(t * 1.6 + m.userData.sway) * 0.9 * ph, MOUTH_Y + h,
        Math.cos(t * 1.1 + m.userData.sway) * 0.6 * ph);
      m.scale.setScalar(0.5 + ph * 2.4);
      m.material.opacity = k * (1 - ph) * 0.55;
    }
  }
  return { plumeUpdate };
}
