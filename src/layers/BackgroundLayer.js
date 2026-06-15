import { Container, Graphics } from 'pixi.js';
import { SCREEN_W, SCREEN_H, GRID_X, GRID_Y, GRID_W, GRID_H } from '../constants.js';

const RAY_COUNT = 8;
const RAY_SPEED = 0.00016;

/**
 * BackgroundLayer — biome-aware underwater scene.
 * Call setTheme(biome) to switch between coral/seagrass and deepTwilight visuals.
 */
export class BackgroundLayer {
  constructor() {
    this.container = new Container();
    this.container.interactiveChildren = false;

    this._rays        = [];
    this._caustics    = [];
    this._bioParticles = [];
    this._t           = Math.random() * 1000;

    // Coral/seagrass group — hidden in deepTwilight
    this._coralGroup = new Container();
    // Deep twilight group — hidden in coral/seagrass
    this._twilightGroup = new Container();

    this._buildCoralBg();
    this._buildTwilightBg();

    // Shared: seafloor + rocky outcrop visible in all biomes
    this._buildSeafloor();
    this._buildRockyOutcrop();

    this.container.addChild(this._coralGroup);
    this.container.addChild(this._twilightGroup);
    this.container.addChild(this._sharedGroup);

    this._twilightGroup.visible = false; // default: coral biome
  }

  // ── Theme switch ───────────────────────────────────────────────────────────

  setTheme(biome) {
    const isDark = biome === 'deepTwilight';
    this._coralGroup.visible   = !isDark;
    this._twilightGroup.visible = isDark;
    this._drawSeafloor(biome);
  }

  // ── Coral group ────────────────────────────────────────────────────────────

  _buildCoralBg() {
    this._buildOceanGradient();
    this._buildSurfaceShimmer();
    this._buildDistantReef();
    this._buildCaustics();
    this._buildRays();
    this._buildSeaweed();
  }

  // ── 1. Ocean gradient ──────────────────────────────────────────────────────
  _buildOceanGradient() {
    const g = new Graphics();
    // Brighter, more saturated tropical-reef water
    g.rect(0, 0, SCREEN_W, SCREEN_H).fill(0x12a6e0);
    g.rect(0, SCREEN_H * 0.1, SCREEN_W, SCREEN_H * 0.5).fill({ color: 0x33c4ee, alpha: 0.60 });
    g.rect(0, 0, SCREEN_W, SCREEN_H * 0.28).fill({ color: 0x5fd8f6, alpha: 0.55 });
    g.rect(0, 0, SCREEN_W, SCREEN_H * 0.1).fill({ color: 0x9cefff, alpha: 0.55 });
    this._coralGroup.addChild(g);
  }

  // ── 2. Surface shimmer ─────────────────────────────────────────────────────
  _buildSurfaceShimmer() {
    const g = new Graphics();
    g.rect(0, 0, SCREEN_W, 28).fill({ color: 0xb0f0ff, alpha: 0.55 });
    g.rect(0, 0, SCREEN_W,  6).fill({ color: 0xe4fcff, alpha: 0.55 });
    this._coralGroup.addChild(g);
  }

  // ── 3. Distant reef silhouettes ────────────────────────────────────────────
  _buildDistantReef() {
    const g = new Graphics();
    this._reefSilhouette(g, 260, [
      [0,0],[90,-52],[180,-38],[270,-66],[360,-44],
      [450,-70],[550,-42],[650,-58],[750,-36],
      [850,-60],[940,-42],[1024,-28],[1024,0],
    ], 0x1488c8, 0.50);
    this._reefSilhouette(g, 340, [
      [0,0],[70,-44],[155,-60],[235,-38],
      [320,-68],[410,-46],[500,-64],[590,-34],
      [680,-54],[780,-40],[880,-56],[980,-32],[1024,-26],[1024,0],
    ], 0x1aa0d4, 0.42);
    this._reefSilhouette(g, 420, [
      [0,0],[110,-32],[200,-46],[290,-28],
      [390,-48],[480,-30],[570,-44],[670,-24],
      [760,-38],[860,-28],[960,-34],[1024,-20],[1024,0],
    ], 0x36b6e0, 0.34);
    this._coralGroup.addChild(g);
  }

  _reefSilhouette(g, baseY, points, color, alpha) {
    g.moveTo(points[0][0], baseY + points[0][1]);
    for (let i = 1; i < points.length; i++) {
      const p = points[i - 1];
      const c = points[i];
      g.quadraticCurveTo((p[0] + c[0]) / 2, baseY + p[1], c[0], baseY + c[1]);
    }
    g.lineTo(SCREEN_W, SCREEN_H).lineTo(0, SCREEN_H).closePath();
    g.fill({ color, alpha });
  }

  // ── 4. Caustic light patches ───────────────────────────────────────────────
  _buildCaustics() {
    this._causticGfx = new Graphics();
    this._caustics = [];
    for (let i = 0; i < 30; i++) {
      this._caustics.push({
        cx:        GRID_X + Math.random() * GRID_W,
        cy:        GRID_Y + GRID_H * 0.5 + Math.random() * GRID_H * 0.42,
        rx:        8  + Math.random() * 18,
        ry:        3  + Math.random() * 6,
        baseAlpha: 0.14 + Math.random() * 0.16,
        phase:     Math.random() * Math.PI * 2,
      });
    }
    this._coralGroup.addChild(this._causticGfx);
    this._redrawCaustics(0);
  }

  _redrawCaustics(t) {
    const g = this._causticGfx;
    g.clear();
    this._caustics.forEach(c => {
      const a = c.baseAlpha + Math.sin(t * 0.00085 + c.phase) * 0.04;
      if (a > 0) {
        const pts = [];
        for (let i = 0; i < 14; i++) {
          const angle = (i / 14) * Math.PI * 2;
          pts.push(c.cx + Math.cos(angle) * c.rx, c.cy + Math.sin(angle) * c.ry);
        }
        g.poly(pts).fill({ color: 0xbaf4ff, alpha: a });
      }
    });
  }

  // ── 5. Light shafts ────────────────────────────────────────────────────────
  _buildRays() {
    this._rayContainer = new Container();
    for (let i = 0; i < RAY_COUNT; i++) {
      const g      = new Graphics();
      const spread = 50 + Math.random() * 55;
      const len    = SCREEN_H * (0.55 + Math.random() * 0.38);
      const baseX  = SCREEN_W * 0.07 + i * (SCREEN_W * 0.118);
      const alpha  = 0.09 + Math.random() * 0.07;
      g.moveTo(0, 0).lineTo(-spread / 2, len).lineTo(spread / 2, len)
       .closePath().fill({ color: 0xccf4ff, alpha });
      this._rays.push({ gfx: g, baseX, phase: Math.random() * Math.PI * 2, amp: 0.015 + Math.random() * 0.02 });
      this._rayContainer.addChild(g);
    }
    this._coralGroup.addChild(this._rayContainer);
  }

  // ── 6. Seaweed ─────────────────────────────────────────────────────────────
  _buildSeaweed() {
    const g    = new Graphics();
    const base = GRID_Y + GRID_H;
    for (let i = 0; i < 8; i++) {
      const sx   = GRID_X + 10 + i * (GRID_W / 8) * 0.5;
      const h    = 38 + Math.random() * 55;
      const w    = 5  + Math.random() * 5;
      const lean = (Math.random() - 0.5) * 14;
      g.moveTo(sx, base)
       .bezierCurveTo(sx - w, base - h * 0.5, sx + w, base - h * 0.72, sx + lean, base - h)
       .stroke({ color: 0x44dd72, width: w * 0.5, cap: 'round', alpha: 0.92 });
    }
    this._coralGroup.addChild(g);
  }

  // ── Deep Twilight group ────────────────────────────────────────────────────

  _buildTwilightBg() {
    this._buildTwilightGradient();
    this._buildTwilightSilhouettes();
    this._buildBioParticles();
    this._buildAbyssalVents();
  }

  _buildTwilightGradient() {
    const g = new Graphics();
    // Near-black abyss
    g.rect(0, 0, SCREEN_W, SCREEN_H).fill(0x050a1a);
    // Slightly lighter mid-zone
    g.rect(0, SCREEN_H * 0.1, SCREEN_W, SCREEN_H * 0.45).fill({ color: 0x070e22, alpha: 0.8 });
    // Deepest dark near floor
    g.rect(0, SCREEN_H * 0.72, SCREEN_W, SCREEN_H * 0.28).fill({ color: 0x020408, alpha: 0.9 });
    // Richer violet + teal bioluminescent ambient at mid-depth (still dark)
    g.rect(0, SCREEN_H * 0.28, SCREEN_W, SCREEN_H * 0.44).fill({ color: 0x2a0a66, alpha: 0.20 });
    g.rect(0, SCREEN_H * 0.42, SCREEN_W, SCREEN_H * 0.3).fill({ color: 0x06324a, alpha: 0.16 });
    this._twilightGroup.addChild(g);
  }

  _buildTwilightSilhouettes() {
    const g = new Graphics();
    // Dark rocky ridge silhouettes — near-black, barely visible
    this._rockSilhouette(g, 270, [
      [0,0],[80,-38],[180,-22],[280,-48],[380,-28],
      [480,-54],[570,-30],[670,-42],[770,-18],[870,-36],[1024,-20],[1024,0],
    ], 0x080d1a, 0.90);
    this._rockSilhouette(g, 360, [
      [0,0],[60,-28],[150,-44],[240,-24],[330,-52],
      [420,-30],[510,-46],[600,-20],[700,-38],[800,-26],[920,-40],[1024,-16],[1024,0],
    ], 0x0a1225, 0.80);
    this._twilightGroup.addChild(g);
  }

  _rockSilhouette(g, baseY, points, color, alpha) {
    g.moveTo(points[0][0], baseY + points[0][1]);
    for (let i = 1; i < points.length; i++) {
      const p = points[i - 1];
      const c = points[i];
      g.quadraticCurveTo((p[0] + c[0]) / 2, baseY + p[1], c[0], baseY + c[1]);
    }
    g.lineTo(SCREEN_W, SCREEN_H).lineTo(0, SCREEN_H).closePath();
    g.fill({ color, alpha });
  }

  _buildBioParticles() {
    this._bioGfx = new Graphics();
    this._bioParticles = [];
    const COLORS_BIO = [0x00e5ff, 0x7c4dff, 0x00bfa5, 0xe040fb, 0x40c4ff, 0x69f0ae];
    for (let i = 0; i < 55; i++) {
      this._bioParticles.push({
        x:         GRID_X + Math.random() * GRID_W,
        y:         GRID_Y + 20 + Math.random() * (GRID_H - 20),
        r:         0.8 + Math.random() * 2.8,
        color:     COLORS_BIO[Math.floor(Math.random() * COLORS_BIO.length)],
        phase:     Math.random() * Math.PI * 2,
        pulseRate: 0.0004 + Math.random() * 0.0012,
        drift:     (Math.random() - 0.5) * 0.008,
      });
    }
    this._twilightGroup.addChild(this._bioGfx);
    this._redrawBioParticles(0);
  }

  _redrawBioParticles(t) {
    const g = this._bioGfx;
    g.clear();
    this._bioParticles.forEach(p => {
      // Slowly drift upward
      p.y -= p.drift;
      if (p.y < GRID_Y) p.y = GRID_Y + GRID_H;

      const pulse = 0.5 + Math.sin(t * p.pulseRate + p.phase) * 0.45;
      if (pulse > 0.05) {
        // Outer glow halo
        g.circle(p.x, p.y, p.r * 3.2).fill({ color: p.color, alpha: pulse * 0.18 });
        // Core dot
        g.circle(p.x, p.y, p.r).fill({ color: p.color, alpha: Math.min(1, pulse * 1.0) });
      }
    });
  }

  _buildAbyssalVents() {
    const g = new Graphics();
    // Faint upward thermal shimmer columns near the floor
    const ventX = [GRID_X + GRID_W * 0.2, GRID_X + GRID_W * 0.55, GRID_X + GRID_W * 0.82];
    ventX.forEach(vx => {
      const base = GRID_Y + GRID_H;
      g.moveTo(vx - 4, base).lineTo(vx - 8, base - GRID_H * 0.35).lineTo(vx + 8, base - GRID_H * 0.35).lineTo(vx + 4, base).closePath()
       .fill({ color: 0x1a0040, alpha: 0.08 });
    });
    this._twilightGroup.addChild(g);
  }

  // ── Shared: seafloor + rocky outcrop ──────────────────────────────────────

  // Biome sand palettes — rich gold in the shallows, dark slate in the abyss.
  // light = sun-touched top edge, deep = richer tone toward the floor.
  static _SAND = {
    coral:        { sand: 0xd9a64a, light: 0xf0ce84, deep: 0xab7628, ripple: 0xf2d88e, pebble: 0xc8983f, alpha: 0.96 },
    seagrass:     { sand: 0xc2ac4e, light: 0xe4d684, deep: 0x88762c, ripple: 0xdccb74, pebble: 0xa8902a, alpha: 0.96 },
    deepTwilight: { sand: 0x172a4a, light: 0x26396a, deep: 0x0a1530, ripple: 0x2a3a5e, pebble: 0x32466e, alpha: 0.90 },
  };

  // The sand fills the lower third of the screen.
  get _sandTop() { return SCREEN_H * 0.66; }

  _buildSeafloor() {
    this._sharedGroup = new Container();
    this._floorGfx = new Graphics();
    const top = this._sandTop;
    const h   = SCREEN_H - top;

    // Stable ripple / pebble positions across the whole sand band
    this._floorRipples = [];
    for (let i = 0; i < 24; i++) {
      this._floorRipples.push({
        ex: Math.random() * SCREEN_W,
        ey: top + 12 + Math.random() * (h - 24),
        rx: 34 + Math.random() * 80,
      });
    }
    this._floorPebbles = [];
    for (let i = 0; i < 32; i++) {
      this._floorPebbles.push({
        x: Math.random() * SCREEN_W,
        y: top + 8 + Math.random() * (h - 14),
        r: 2 + Math.random() * 6,
      });
    }

    this._sharedGroup.addChild(this._floorGfx);
    this._drawSeafloor('coral');
  }

  _drawSeafloor(biome) {
    const p = BackgroundLayer._SAND[biome] ?? BackgroundLayer._SAND.coral;
    const g = this._floorGfx;
    const top = this._sandTop;
    const h   = SCREEN_H - top;
    g.clear();
    // Rich sand filling the lower third, lighter at the top edge and deeper below
    g.rect(0, top, SCREEN_W, h).fill({ color: p.sand, alpha: p.alpha });
    g.rect(0, top, SCREEN_W, h * 0.22).fill({ color: p.light, alpha: 0.45 });
    g.rect(0, top + h * 0.58, SCREEN_W, h * 0.42).fill({ color: p.deep, alpha: 0.50 });
    this._floorRipples.forEach(({ ex, ey, rx }) => {
      const pts = [];
      for (let j = 0; j < 14; j++) {
        const a = (j / 14) * Math.PI * 2;
        pts.push(ex + Math.cos(a) * rx, ey + Math.sin(a) * 6);
      }
      g.poly(pts).fill({ color: p.ripple, alpha: 0.30 });
    });
    this._floorPebbles.forEach(({ x, y, r }) => {
      g.circle(x, y, r).fill({ color: p.pebble, alpha: 0.45 });
    });
  }

  _buildRockyOutcrop() {
    const g  = new Graphics();
    const bx = 16;
    const by = GRID_Y + GRID_H + 8;

    g.moveTo(bx, SCREEN_H)
     .lineTo(bx,       by + 22).lineTo(bx + 45,  by)
     .lineTo(bx + 100, by + 12).lineTo(bx + 150, by - 6)
     .lineTo(bx + 195, by + 9) .lineTo(bx + 245, by + 2)
     .lineTo(bx + 295, by + 18).lineTo(bx + 350, by + 4)
     .lineTo(bx + 390, by + 14).lineTo(bx + 390, SCREEN_H)
     .closePath().fill(0x163828);

    g.moveTo(bx + 45, by).lineTo(bx + 100, by + 12)
     .stroke({ color: 0x163c2a, width: 2, alpha: 0.8 });
    g.moveTo(bx + 150, by - 6).lineTo(bx + 195, by + 9)
     .stroke({ color: 0x163c2a, width: 2, alpha: 0.8 });

    // Fish Nest
    const nx = bx + 58;
    const ny = by - 20;
    g.roundRect(nx, ny, 70, 28, 8).fill(0x091810);
    g.roundRect(nx + 2, ny + 2, 66, 16, 6).fill(0x060f0c);
    g.circle(nx + 35, ny + 10, 5).fill(0x30c0a0);
    g.circle(nx + 35, ny + 10, 3).fill(0x80f0d8);
    g.rect(nx + 6, ny + 20, 8, 2).fill({ color: 0x30c0a0, alpha: 0.5 });

    // Bubbles' dock
    const dx = bx + 262;
    const dy = by - 18;
    g.roundRect(dx, dy, 54, 22, 5).fill(0x091810);
    g.roundRect(dx + 4, dy + 4, 36, 9, 3).fill(0xffd740);
    g.circle(dx + 46, dy + 11, 5).fill(0xffd740);
    g.circle(dx + 46, dy + 11, 3).fill(0xfff0a0);

    this._sharedGroup.addChild(g);
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  update(deltaMS) {
    this._t += deltaMS;
    const t = this._t;

    if (this._coralGroup.visible) {
      this._rays.forEach(({ gfx, baseX, phase, amp }) => {
        gfx.x        = baseX + Math.sin(t * RAY_SPEED + phase) * 16;
        gfx.rotation = Math.sin(t * RAY_SPEED * 0.65 + phase) * amp;
      });
      this._redrawCaustics(t);
    }

    if (this._twilightGroup.visible) {
      this._redrawBioParticles(t);
    }
  }
}
