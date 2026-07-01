// Reef Bloom — 3D vertical slice (Phase 0 of the three.js render track).
// A standalone underwater scene proving the direction: seafloor, orbit camera,
// fog, and a hydrothermal vent as REAL 3D geometry with the same on/off
// eruption cycle as the 2D "Classic" decor (see src/entities/Decor.js).
//
// This does not touch the Classic game. Run `npm run dev` and open /threed.html.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Eruption cycle — mirrors the Classic vent (VENT_PERIOD 5.2s + envelope).
const VENT_PERIOD = 5.2;                        // seconds (three.js Clock is in s)
function ventIntensity(p) {
  if (p < 0.12) return p / 0.12;                // ramp up
  if (p < 0.48) return 1;                       // full eruption
  if (p < 0.62) return 1 - (p - 0.48) / 0.14;   // ramp down
  return 0;                                     // dormant
}

export function initVentPrototype(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04121f);
  scene.fog = new THREE.FogExp2(0x04121f, 0.03);   // deep-water haze

  const camera = new THREE.PerspectiveCamera(
    55, window.innerWidth / window.innerHeight, 0.1, 200,
  );
  camera.position.set(0, 7, 16);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 4, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;         // don't dive under the floor
  controls.minDistance = 6;
  controls.maxDistance = 40;

  // ── Lighting — dim cold ambient + a soft down-light + the vent's own glow ──
  scene.add(new THREE.HemisphereLight(0x2a5b7a, 0x010409, 0.6));
  const key = new THREE.DirectionalLight(0x6fb8e0, 0.5);
  key.position.set(6, 14, 8);
  scene.add(key);

  // ── Seafloor — dark volcanic sand ──────────────────────────────────────────
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ color: 0x14202a, roughness: 1, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // Scatter a few boulders so the scene reads as a seafloor, not a void.
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x1b2630, roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const a = i * 2.399;                           // golden-angle spread
    const r = 8 + (i % 5) * 3;
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 + (i % 3) * 0.35, 0), rockMat);
    rock.position.set(Math.cos(a) * r, 0.2, Math.sin(a) * r);
    rock.rotation.set(a, a * 1.7, a * 0.3);
    rock.scale.y = 0.7;
    scene.add(rock);
  }

  // ── The hydrothermal vent — real geometry ──────────────────────────────────
  const vent = new THREE.Group();
  scene.add(vent);

  const rock = new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.95 });
  // Tapered chimney: wide sooty base cone + a narrower stack.
  const base = new THREE.Mesh(new THREE.ConeGeometry(2.6, 4.2, 12, 1, true), rock);
  base.position.y = 2.1;
  vent.add(base);
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.4, 4, 12, 1, true), rock);
  stack.position.y = 5.4;
  vent.add(stack);

  const MOUTH_Y = 7.4;

  // Glowing mouth — emissive disc + a point light that pulses with the cycle.
  const mouthMat = new THREE.MeshStandardMaterial({
    color: 0x120a06, emissive: 0xff6a3d, emissiveIntensity: 0,
  });
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.65, 16), mouthMat);
  mouth.rotation.x = -Math.PI / 2;
  mouth.position.y = MOUTH_Y;
  vent.add(mouth);

  const glow = new THREE.PointLight(0xff7a3a, 0, 26, 2);
  glow.position.set(0, MOUTH_Y + 0.3, 0);
  vent.add(glow);

  // ── Plume — recycled smoke puffs rising from the mouth ─────────────────────
  const PUFFS = 16;
  const puffGeo = new THREE.SphereGeometry(1, 12, 12);
  const puffs = [];
  for (let i = 0; i < PUFFS; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: i % 2 ? 0x2a2d36 : 0x352a20, transparent: true, opacity: 0, roughness: 1,
    });
    const m = new THREE.Mesh(puffGeo, mat);
    m.position.set(0, MOUTH_Y, 0);
    m.userData.seed = i / PUFFS;                   // stagger along the rise
    m.userData.sway = (i * 12.9898) % (Math.PI * 2);
    vent.add(m);
    puffs.push(m);
  }

  // ── Render loop ─────────────────────────────────────────────────────────────
  const clock = new THREE.Clock();
  let running = true;

  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const t = clock.getElapsedTime();
    const k = ventIntensity((t / VENT_PERIOD) % 1);

    // Mouth + light track the eruption intensity.
    mouthMat.emissiveIntensity = 2.5 * k;
    glow.intensity = 40 * k;

    // Puffs rise, expand, and fade with height; opacity gated by intensity.
    const RISE = 9;                                // how far above the mouth
    for (const m of puffs) {
      const ph = (t / 3.2 + m.userData.seed) % 1;  // 0 at mouth → 1 at top
      const h = ph * RISE;
      const wob = Math.sin(t * 1.6 + m.userData.sway) * 0.9 * ph;
      m.position.set(wob, MOUTH_Y + h, Math.cos(t * 1.1 + m.userData.sway) * 0.6 * ph);
      const scale = 0.5 + ph * 2.4;
      m.scale.setScalar(scale);
      m.material.opacity = k * (1 - ph) * 0.55;
    }

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
