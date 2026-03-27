import { Container, Graphics } from 'pixi.js';
import { SCREEN_W, SCREEN_H, GRID_X, GRID_Y, GRID_W, GRID_H } from '../constants.js';

const RAY_COUNT = 8;
const RAY_SPEED = 0.00016;

/**
 * BackgroundLayer — bright tropical reef underwater scene.
 *
 * Draw order (back to front):
 *   1. Ocean gradient (vivid tropical blues)
 *   2. Surface shimmer
 *   3. Distant reef silhouettes (depth cue)
 *   4. Caustic light patches
 *   5. Light shafts from surface
 *   6. Seaweed silhouettes
 *   7. Sandy seafloor
 *   8. Rocky outcrop + Fish Nest + Bubbles dock
 */
export class BackgroundLayer {
  constructor() {
    this.container = new Container();
    this.container.interactiveChildren = false;

    this._rays     = [];
    this._caustics = [];
    this._t        = Math.random() * 1000;

    this._buildOceanGradient();
    this._buildSurfaceShimmer();
    this._buildDistantReef();
    this._buildCaustics();
    this._buildRays();
    this._buildSeaweed();
    this._buildSeafloor();
    this._buildRockyOutcrop();
  }

  // ── 1. Ocean gradient ──────────────────────────────────────────────────────
  _buildOceanGradient() {
    const g = new Graphics();

    // Base: bright tropical blue — like shallow Caribbean water
    g.rect(0, 0, SCREEN_W, SCREEN_H).fill(0x1878c8);

    // Mid-water band — vivid cyan-blue
    g.rect(0, SCREEN_H * 0.1, SCREEN_W, SCREEN_H * 0.5)
     .fill({ color: 0x28a0e0, alpha: 0.55 });

    // Upper water — light sky-blue
    g.rect(0, 0, SCREEN_W, SCREEN_H * 0.28)
     .fill({ color: 0x40b8f0, alpha: 0.50 });

    // Near-surface — pale aqua
    g.rect(0, 0, SCREEN_W, SCREEN_H * 0.1)
     .fill({ color: 0x70d4ff, alpha: 0.45 });

    this.container.addChild(g);
  }

  // ── 2. Surface shimmer ─────────────────────────────────────────────────────
  _buildSurfaceShimmer() {
    const g = new Graphics();
    g.rect(0, 0, SCREEN_W, 28).fill({ color: 0x90e4ff, alpha: 0.45 });
    g.rect(0, 0, SCREEN_W,  6).fill({ color: 0xc8f4ff, alpha: 0.40 });
    this.container.addChild(g);
  }

  // ── 3. Distant reef silhouettes ────────────────────────────────────────────
  _buildDistantReef() {
    const g = new Graphics();

    // Three silhouette layers — medium blues, creating depth without darkness
    this._reefSilhouette(g, 260, [
      [0,0],[90,-52],[180,-38],[270,-66],[360,-44],
      [450,-70],[550,-42],[650,-58],[750,-36],
      [850,-60],[940,-42],[1024,-28],[1024,0],
    ], 0x0c5492, 0.50);

    this._reefSilhouette(g, 340, [
      [0,0],[70,-44],[155,-60],[235,-38],
      [320,-68],[410,-46],[500,-64],[590,-34],
      [680,-54],[780,-40],[880,-56],[980,-32],[1024,-26],[1024,0],
    ], 0x0e6aaa, 0.40);

    this._reefSilhouette(g, 420, [
      [0,0],[110,-32],[200,-46],[290,-28],
      [390,-48],[480,-30],[570,-44],[670,-24],
      [760,-38],[860,-28],[960,-34],[1024,-20],[1024,0],
    ], 0x1478b8, 0.30);

    this.container.addChild(g);
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
        baseAlpha: 0.10 + Math.random() * 0.12,
        phase:     Math.random() * Math.PI * 2,
      });
    }

    this.container.addChild(this._causticGfx);
    this._redrawCaustics(0);
  }

  _redrawCaustics(t) {
    const g = this._causticGfx;
    g.clear();
    this._caustics.forEach(c => {
      const a = c.baseAlpha + Math.sin(t * 0.00085 + c.phase) * 0.04;
      if (a > 0) {
        // Draw ellipse as polygon
        const pts = [];
        for (let i = 0; i < 14; i++) {
          const angle = (i / 14) * Math.PI * 2;
          pts.push(c.cx + Math.cos(angle) * c.rx, c.cy + Math.sin(angle) * c.ry);
        }
        g.poly(pts).fill({ color: 0x90e8ff, alpha: a });
      }
    });
  }

  // ── 5. Light shafts ────────────────────────────────────────────────────────
  _buildRays() {
    this._rayContainer = new Container();
    for (let i = 0; i < RAY_COUNT; i++) {
      const g       = new Graphics();
      const spread  = 50 + Math.random() * 55;
      const len     = SCREEN_H * (0.55 + Math.random() * 0.38);
      const baseX   = SCREEN_W * 0.07 + i * (SCREEN_W * 0.118);
      const alpha   = 0.06 + Math.random() * 0.05;

      g.moveTo(0, 0).lineTo(-spread / 2, len).lineTo(spread / 2, len)
       .closePath().fill({ color: 0xa8e8ff, alpha });

      this._rays.push({ gfx: g, baseX, phase: Math.random() * Math.PI * 2, amp: 0.015 + Math.random() * 0.02 });
      this._rayContainer.addChild(g);
    }
    this.container.addChild(this._rayContainer);
  }

  // ── 6. Seaweed ─────────────────────────────────────────────────────────────
  _buildSeaweed() {
    const g    = new Graphics();
    const base = GRID_Y + GRID_H;

    for (let i = 0; i < 8; i++) {
      const sx = GRID_X + 10 + i * (GRID_W / 8) * 0.5;
      const h  = 38 + Math.random() * 55;
      const w  = 5  + Math.random() * 5;
      const lean = (Math.random() - 0.5) * 14;

      g.moveTo(sx, base)
       .bezierCurveTo(sx - w, base - h * 0.5, sx + w, base - h * 0.72, sx + lean, base - h)
       .stroke({ color: 0x1a7840, width: w * 0.5, cap: 'round', alpha: 0.9 });
    }
    this.container.addChild(g);
  }

  // ── 7. Seafloor ────────────────────────────────────────────────────────────
  _buildSeafloor() {
    const g     = new Graphics();
    const floorY = SCREEN_H - 56;

    // Sandy seafloor — warm teal-sand tone, not black
    g.rect(0, floorY, SCREEN_W, 56).fill({ color: 0x0e3c5a, alpha: 0.85 });

    // Sand ripple highlights
    for (let i = 0; i < 14; i++) {
      const pts = [];
      const ex = Math.random() * SCREEN_W;
      const ey = floorY + 5 + Math.random() * 14;
      const rx = 30 + Math.random() * 70;
      const ry = 5;
      for (let j = 0; j < 14; j++) {
        const a = (j / 14) * Math.PI * 2;
        pts.push(ex + Math.cos(a) * rx, ey + Math.sin(a) * ry);
      }
      g.poly(pts).fill({ color: 0x1e6858, alpha: 0.40 });
    }
    for (let i = 0; i < 18; i++) {
      g.circle(Math.random() * SCREEN_W, floorY + 12 + Math.random() * 28,
               2 + Math.random() * 5)
       .fill({ color: 0x247060, alpha: 0.50 });
    }
    this.container.addChild(g);
  }

  // ── 8. Rocky outcrop ───────────────────────────────────────────────────────
  _buildRockyOutcrop() {
    const g  = new Graphics();
    const bx = 16;
    const by = GRID_Y + GRID_H + 8;

    // Rock mass
    g.moveTo(bx, SCREEN_H)
     .lineTo(bx,       by + 22).lineTo(bx + 45,  by)
     .lineTo(bx + 100, by + 12).lineTo(bx + 150, by - 6)
     .lineTo(bx + 195, by + 9) .lineTo(bx + 245, by + 2)
     .lineTo(bx + 295, by + 18).lineTo(bx + 350, by + 4)
     .lineTo(bx + 390, by + 14).lineTo(bx + 390, SCREEN_H)
     .closePath().fill(0x163828);

    // Rock edge highlights
    g.moveTo(bx + 45, by).lineTo(bx + 100, by + 12)
     .stroke({ color: 0x163c2a, width: 2, alpha: 0.8 });
    g.moveTo(bx + 150, by - 6).lineTo(bx + 195, by + 9)
     .stroke({ color: 0x163c2a, width: 2, alpha: 0.8 });

    // ── Fish Nest ──────────────────────────────────────────────────────────
    const nx = bx + 58;
    const ny = by - 20;
    g.roundRect(nx, ny, 70, 28, 8).fill(0x091810);
    g.roundRect(nx + 2, ny + 2, 66, 16, 6).fill(0x060f0c);
    g.circle(nx + 35, ny + 10, 5).fill(0x30c0a0);
    g.circle(nx + 35, ny + 10, 3).fill(0x80f0d8);

    // "NEST" label
    g.rect(nx + 6, ny + 20, 8, 2).fill({ color: 0x30c0a0, alpha: 0.5 });

    // ── Bubbles' dock ──────────────────────────────────────────────────────
    const dx = bx + 262;
    const dy = by - 18;
    g.roundRect(dx, dy, 54, 22, 5).fill(0x091810);
    g.roundRect(dx + 4, dy + 4, 36, 9, 3).fill(0xffd740);
    g.circle(dx + 46, dy + 11, 5).fill(0xffd740);
    g.circle(dx + 46, dy + 11, 3).fill(0xfff0a0);

    this.container.addChild(g);
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  update(deltaMS) {
    this._t += deltaMS;
    const t = this._t;

    this._rays.forEach(({ gfx, baseX, phase, amp }) => {
      gfx.x        = baseX + Math.sin(t * RAY_SPEED + phase) * 16;
      gfx.rotation = Math.sin(t * RAY_SPEED * 0.65 + phase) * amp;
    });

    this._redrawCaustics(t);
  }
}
