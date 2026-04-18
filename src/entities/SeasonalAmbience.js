import { Container, Graphics } from 'pixi.js';
import { GRID_X, GRID_Y, GRID_W, GRID_H } from '../constants.js';
import { state } from '../state.js';

/**
 * SeasonalAmbience — event-driven particle effects and static decorations.
 *
 *  Coral Bloom Festival     → falling cherry-blossom petals + blossom clusters
 *  Moonfish Migration       → golden light motes drifting upward + moonbeam shafts
 *  Pearl Tide               → pearl-shimmer sparkles + pearl orbs on the sea floor
 *  Bioluminescence Bloom    → slow-drifting cyan/green plankton glow + resting orbs
 *
 * Call refresh() whenever the event state may have changed.
 * Lives in the world container above fish but below the Bubbles drone.
 */
export class SeasonalAmbience {
  constructor() {
    this.container  = new Container();
    this.container.interactiveChildren = false;

    // Two sub-layers so static decor always renders below particles
    this._decorC    = new Container();
    this._particleC = new Container();
    this.container.addChild(this._decorC);
    this.container.addChild(this._particleC);

    this._particles = [];
    this._eventId   = null;   // id that is currently rendered
    this._t         = 0;

    this._apply();
  }

  /** Call after event state may have changed (e.g. initEventSystem onChange). */
  refresh() { this._apply(); }

  // ── Internal ────────────────────────────────────────────────────────────────

  _apply() {
    const ev    = state.event;
    const newId = ev?.id ?? null;
    if (newId === this._eventId) return;

    // Tear down previous ambience
    this._eventId   = newId;
    this._particles = [];
    this._decorC.removeChildren();
    this._particleC.removeChildren();
    if (!newId) return;

    if      (newId === 'coral_bloom_2026')        this._buildCoralBloom();
    else if (newId === 'moonfish_migration_2026') this._buildMoonfishMigration();
    else if (newId === 'pearl_tide_2026')         this._buildPearlTide();
    else if (newId === 'bioluminescence_2026')    this._buildBioluminescence();
  }

  // ── Bioluminescence Bloom ────────────────────────────────────────────────────

  _buildBioluminescence() {
    // Static glow orbs resting on the floor (cool cyan/green)
    const floorG = new Graphics();
    [20, 60, 110, GRID_W * 0.38, GRID_W * 0.55, GRID_W - 70, GRID_W - 30].forEach(ox => {
      const x = GRID_X + ox;
      const y = GRID_Y + GRID_H - 10 - Math.random() * 16;
      const r = 2.5 + Math.random() * 2;
      const col = Math.random() < 0.5 ? 0x76ff03 : 0x40c4ff;
      floorG.circle(x, y, r).fill({ color: col, alpha: 0.65 });
      floorG.circle(x - r * 0.3, y - r * 0.35, r * 0.3).fill({ color: 0xffffff, alpha: 0.55 });
      floorG.circle(x, y, r + 5).fill({ color: col, alpha: 0.07 });
    });
    this._decorC.addChild(floorG);

    // Drifting plankton — cyan and green motes with slow upward drift
    const GLOW_COLORS = [0x40c4ff, 0x76ff03, 0x80d8ff, 0xb9f6ca, 0x00e5ff];
    for (let i = 0; i < 24; i++) {
      const g   = new Graphics();
      const r   = 1.2 + Math.random() * 2.2;
      const col = GLOW_COLORS[i % GLOW_COLORS.length];
      g.circle(0, 0, r).fill({ color: col, alpha: 0.85 });
      g.circle(0, 0, r * 2.2).fill({ color: col, alpha: 0.12 });

      const p = {
        gfx:          g,
        x:            GRID_X + Math.random() * GRID_W,
        y:            GRID_Y + Math.random() * GRID_H,
        speed:        0.06 + Math.random() * 0.18,
        drift:        (Math.random() - 0.5) * 0.4,
        phase:        Math.random() * Math.PI * 2,
        baseAlpha:    0.35 + Math.random() * 0.5,
        twinkleSpeed: 0.03 + Math.random() * 0.05,
        type:         'glow',
      };
      g.x = p.x; g.y = p.y;
      this._particles.push(p);
      this._particleC.addChild(g);
    }
  }

  // ── Coral Bloom Festival ────────────────────────────────────────────────────

  _buildCoralBloom() {
    // Static blossom clusters at the top edge of the reef grid
    [
      { x: GRID_X + 16,           y: GRID_Y + 20 },
      { x: GRID_X + GRID_W - 16,  y: GRID_Y + 22 },
      { x: GRID_X + GRID_W * 0.3, y: GRID_Y + 10 },
      { x: GRID_X + GRID_W * 0.7, y: GRID_Y + 14 },
    ].forEach(p => this._drawBlossom(p.x, p.y));

    // Falling petal particles
    const PETAL_COLORS = [0xff80ab, 0xffb3c6, 0xffd6e8, 0xfce4ec, 0xff4081];
    for (let i = 0; i < 22; i++) {
      const g   = new Graphics();
      const col = PETAL_COLORS[i % PETAL_COLORS.length];
      _drawPetalShape(g, col, 3 + Math.random() * 3, 0.85);

      const p = {
        gfx:       g,
        x:         GRID_X + Math.random() * GRID_W,
        y:         GRID_Y - Math.random() * GRID_H,    // stagger so they don't all start together
        speed:     0.22 + Math.random() * 0.42,
        drift:     (Math.random() - 0.5) * 0.5,
        rotSpeed:  (Math.random() < 0.5 ? 1 : -1) * (0.025 + Math.random() * 0.04),
        phase:     Math.random() * Math.PI * 2,
        baseAlpha: 0.6 + Math.random() * 0.3,
        type:      'petal',
      };
      g.x = p.x; g.y = p.y;
      this._particles.push(p);
      this._particleC.addChild(g);
    }
  }

  _drawBlossom(cx, cy) {
    const PETAL_COLORS = [0xff80ab, 0xffb3c6, 0xffd6e8, 0xff4081];
    // 5 petals arranged around center
    for (let i = 0; i < 5; i++) {
      const a  = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const pg = new Graphics();
      _drawPetalShape(pg, PETAL_COLORS[i % PETAL_COLORS.length], 3.5, 0.78);
      pg.x        = cx + Math.cos(a) * 6;
      pg.y        = cy + Math.sin(a) * 6;
      pg.rotation = a + Math.PI / 2;
      this._decorC.addChild(pg);
    }
    // Center stamen + glow
    const g = new Graphics();
    g.circle(cx, cy, 2.8).fill({ color: 0xffe082, alpha: 0.95 });
    g.circle(cx, cy, 8).fill({ color: 0xff80ab, alpha: 0.09 });
    this._decorC.addChild(g);

    // A few scattered resting petals nearby
    for (let j = 0; j < 4; j++) {
      const pg  = new Graphics();
      const ox  = cx + (Math.random() - 0.5) * 28;
      const oy  = cy + (Math.random() - 0.5) * 18;
      _drawPetalShape(pg, PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)], 2.8, 0.55);
      pg.x = ox; pg.y = oy; pg.rotation = Math.random() * Math.PI * 2;
      this._decorC.addChild(pg);
    }
  }

  // ── Moonfish Migration ───────────────────────────────────────────────────────

  _buildMoonfishMigration() {
    // Subtle diagonal light-shaft decor at the top of the water column
    const shaftG = new Graphics();
    for (let i = 0; i < 4; i++) {
      const x     = GRID_X + GRID_W * (0.12 + i * 0.25);
      const slant = 8 + i * 5;
      shaftG
        .moveTo(x, GRID_Y)
        .lineTo(x + slant,      GRID_Y + GRID_H * 0.52)
        .lineTo(x + slant + 9,  GRID_Y + GRID_H * 0.52)
        .lineTo(x + 9,          GRID_Y)
        .closePath()
        .fill({ color: 0xb3d8ff, alpha: 0.055 });
    }
    this._decorC.addChild(shaftG);

    // Drifting light motes (drift upward)
    const MOTE_COLORS = [0x90caf9, 0xb3e5fc, 0xe1f5fe, 0xffd700, 0xffe082];
    for (let i = 0; i < 18; i++) {
      const g   = new Graphics();
      const r   = 1 + Math.random() * 2.2;
      const col = MOTE_COLORS[i % MOTE_COLORS.length];
      g.circle(0, 0, r).fill({ color: col, alpha: 0.75 });
      g.circle(-r * 0.3, -r * 0.35, r * 0.38).fill({ color: 0xffffff, alpha: 0.5 });

      const p = {
        gfx:       g,
        x:         GRID_X + Math.random() * GRID_W,
        y:         GRID_Y + Math.random() * GRID_H,
        speed:     0.1 + Math.random() * 0.22,
        drift:     (Math.random() - 0.5) * 0.3,
        phase:     Math.random() * Math.PI * 2,
        baseAlpha: 0.35 + Math.random() * 0.5,
        type:      'mote',
      };
      g.x = p.x; g.y = p.y;
      this._particles.push(p);
      this._particleC.addChild(g);
    }
  }

  // ── Pearl Tide ───────────────────────────────────────────────────────────────

  _buildPearlTide() {
    // Static pearl orbs resting on the sea floor
    const floorG = new Graphics();
    [28, 65, 120, GRID_W * 0.42, GRID_W * 0.6, GRID_W - 52, GRID_W - 24].forEach(ox => {
      const x = GRID_X + ox;
      const y = GRID_Y + GRID_H - 12 - Math.random() * 14;
      const r = 3 + Math.random() * 2.2;
      floorG.circle(x, y, r).fill({ color: 0xf0e6d3, alpha: 0.82 });
      floorG.circle(x - r * 0.3, y - r * 0.35, r * 0.32).fill({ color: 0xffffff, alpha: 0.65 });
      floorG.circle(x, y, r + 3).fill({ color: 0xffd740, alpha: 0.06 });
    });
    this._decorC.addChild(floorG);

    // Golden shimmer sparkles floating in the water
    for (let i = 0; i < 20; i++) {
      const g = new Graphics();
      const r = 1.2 + Math.random() * 1.8;
      g.circle(0, 0, r).fill({ color: 0xfff9c4, alpha: 0.78 });
      for (let s = 0; s < 4; s++) {
        const a   = (s / 4) * Math.PI * 2;
        const arm = r * 3;
        g.moveTo(0, 0)
         .lineTo(Math.cos(a) * arm, Math.sin(a) * arm)
         .lineTo(Math.cos(a + 0.28) * r * 0.45, Math.sin(a + 0.28) * r * 0.45)
         .closePath()
         .fill({ color: 0xffd740, alpha: 0.55 });
      }
      const twinkleSpeed = 0.04 + Math.random() * 0.05;
      const p = {
        gfx:          g,
        x:            GRID_X + Math.random() * GRID_W,
        y:            GRID_Y + GRID_H * 0.2 + Math.random() * GRID_H * 0.8,
        speed:        0.04 + Math.random() * 0.1,
        drift:        (Math.random() - 0.5) * 0.18,
        phase:        Math.random() * Math.PI * 2,
        baseAlpha:    0.4 + Math.random() * 0.45,
        twinkleSpeed,
        type:         'sparkle',
      };
      g.x = p.x; g.y = p.y;
      this._particles.push(p);
      this._particleC.addChild(g);
    }
  }

  // ── Update ────────────────────────────────────────────────────────────────────

  update(deltaMS) {
    if (this._particles.length === 0) return;
    const dt = deltaMS / 16;
    this._t += deltaMS * 0.001;
    const t = this._t;

    for (const p of this._particles) {
      if (p.type === 'petal') {
        p.y += p.speed * dt;
        p.x += Math.sin(t * 0.65 + p.phase) * p.drift * dt;
        p.gfx.rotation += p.rotSpeed * dt;

        // Fade near top and bottom edges
        const edgeDist = Math.min(p.y - GRID_Y, (GRID_Y + GRID_H) - p.y);
        p.gfx.alpha    = p.baseAlpha * Math.min(1, Math.max(0, edgeDist / 30));

        // Recycle at bottom; re-enter from top
        if (p.y > GRID_Y + GRID_H + 14) {
          p.y = GRID_Y - 10 - Math.random() * 50;
          p.x = GRID_X + Math.random() * GRID_W;
        }
        // Keep inside horizontal bounds
        if (p.x < GRID_X - 24 || p.x > GRID_X + GRID_W + 24) {
          p.x = GRID_X + Math.random() * GRID_W;
        }

      } else if (p.type === 'mote') {
        p.y -= p.speed * dt;
        p.x += Math.sin(t * 0.5 + p.phase) * p.drift * dt;
        p.gfx.alpha = p.baseAlpha * (0.4 + 0.6 * Math.sin(t * 1.4 + p.phase));

        if (p.y < GRID_Y - 14) {
          p.y = GRID_Y + GRID_H + Math.random() * 28;
          p.x = GRID_X + Math.random() * GRID_W;
        }

      } else if (p.type === 'glow') {
        // Slow upward drift with lateral wander and breathing twinkle
        p.y -= p.speed * dt;
        p.x += Math.sin(t * 0.4 + p.phase) * p.drift * dt;
        p.gfx.alpha = p.baseAlpha * (0.5 + 0.5 * Math.sin(t * p.twinkleSpeed * 60 + p.phase));

        if (p.y < GRID_Y - 12) {
          p.y = GRID_Y + GRID_H + Math.random() * 24;
          p.x = GRID_X + Math.random() * GRID_W;
        }
        if (p.x < GRID_X - 20 || p.x > GRID_X + GRID_W + 20) {
          p.x = GRID_X + Math.random() * GRID_W;
        }

      } else { // sparkle
        p.x += Math.sin(t * 0.42 + p.phase) * p.drift * dt;
        p.y += Math.cos(t * 0.33 + p.phase + 1) * p.speed * dt;
        p.gfx.rotation += 0.008 * dt;
        p.gfx.alpha = p.baseAlpha * Math.abs(Math.sin(t * p.twinkleSpeed * 60 + p.phase));

        // Clamp inside grid
        p.x = Math.max(GRID_X + 4, Math.min(GRID_X + GRID_W - 4, p.x));
        p.y = Math.max(GRID_Y + 4, Math.min(GRID_Y + GRID_H - 4, p.y));
      }

      p.gfx.x = p.x;
      p.gfx.y = p.y;
    }
  }
}

// ── Shared shape helper (module-level, no `this` needed) ─────────────────────

/** Draws a symmetrical petal shape centred at (0,0) into an existing Graphics. */
function _drawPetalShape(g, color, size, alpha) {
  const h = size * 1.8, w = size * 0.65;
  g.moveTo(0, -h)
   .bezierCurveTo( w, -h * 0.4,  w,  h * 0.4, 0,  h)
   .bezierCurveTo(-w,  h * 0.4, -w, -h * 0.4, 0, -h)
   .fill({ color, alpha });
}
