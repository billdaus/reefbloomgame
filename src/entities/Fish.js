import { Container, Graphics } from 'pixi.js';
import { GRID_X, GRID_Y, GRID_W, GRID_H, TILE_SIZE } from '../constants.js';
import { tileCenter, getOccupiedTiles } from '../utils/grid.js';

const MARGIN    = 10;
const DAMPEN    = 0.96;
const STEER     = 0.12;
const REPULSE_R = TILE_SIZE * 1.2;   // radius to start avoiding coral

/** Fish — procedural sprite + simple wander AI. */
export class Fish {
  constructor(speciesData, col, row, uid) {
    this.spec      = speciesData;
    this.speciesId = speciesData.id;
    this.uid       = uid;
    this.layer     = speciesData.layer;  // 'A' | 'B'

    // Spawn near the given home tile
    const center   = tileCenter(col, row);
    this.x         = center.x + (Math.random() - 0.5) * TILE_SIZE;
    this.y         = center.y + (Math.random() - 0.5) * TILE_SIZE;
    this.vx        = (Math.random() - 0.5) * speciesData.speed;
    this.vy        = (Math.random() - 0.5) * speciesData.speed;
    this.targetX   = this.x;
    this.targetY   = this.y;
    this.targetAge = 0;
    this.pickTargetCooldown = 0;

    this.container = new Container();
    this._body     = new Graphics();
    this.container.addChild(this._body);
    this._drawBody();

    this.container.x = this.x;
    this.container.y = this.y;
  }

  // ── Drawing ───────────────────────────────────────────────────────────────

  _drawBody() {
    const g   = this._body;
    const sz  = this.spec.size;
    const c   = this.spec.color;
    const ac  = this.spec.accentColor;
    const id  = this.spec.id;

    g.clear();

    switch (id) {
      // Common
      case 'blueChromis':       this._drawOvalFish(g, sz, c, ac, false);  break;
      case 'chromis':           this._drawOvalFish(g, sz, c, ac, false);  break;
      // Uncommon
      case 'zebraGoby':         this._drawZebraGoby(g, sz, c, ac);        break;
      case 'cardinalfish':      this._drawOvalFish(g, sz, c, ac, false);  break;
      // Rare
      case 'clownfish':         this._drawOvalFish(g, sz, c, ac, true);   break;
      case 'yellowTang':        this._drawDiscFish(g, sz, c, ac);         break;
      case 'blueTang':          this._drawDiscFish(g, sz, c, ac);         break;
      case 'octopus':           this._drawOctopus(g, sz, c, ac);          break;
      case 'tropicBlenny':    this._drawTropicBlenny(g, sz, c, ac);    break;
      case 'seaUrchin':       this._drawSeaUrchin(g, sz, c, ac);       break;
      case 'parrotfish':      this._drawParrotfish(g, sz, c, ac);      break;
      case 'rabbitfish':      this._drawRabbitfish(g, sz, c, ac);      break;
      case 'cleanerShrimp':   this._drawCleanerShrimp(g, sz, c, ac);   break;
      case 'mantaRay':        this._drawMantaRay(g, sz, c, ac);        break;
      case 'manatee':         this._drawManatee(g, sz, c, ac);         break;
      case 'seaTurtle':       this._drawSeaTurtle(g, sz, c, ac);       break;
      // Super Rare
      case 'moorishIdol':       this._drawIdol(g, sz, c, ac);             break;
      case 'butterflyfish':     this._drawDiscFish(g, sz, c, 0xffcc02);   break;
      case 'zebrafish':         this._drawZebrafish(g, sz, c, ac);        break;
      case 'seahorse':          this._drawSeahorse(g, sz, c, ac);         break;
      // Epic
      case 'cuttlefish':        this._drawCuttlefish(g, sz, c, ac);       break;
      case 'morayEel':          this._drawEel(g, sz, c, ac);              break;
      // Pearl
      case 'rainbowGoby':       this._drawOvalFish(g, sz, c, ac, false);  break;
      case 'glowfinAngelfish':  this._drawGlowfinAngel(g, sz, c, ac);     break;
      case 'neonSeahorse':      this._drawSeahorse(g, sz, c, ac);         break;
      case 'sunburstWrasse':    this._drawOvalFish(g, sz, c, ac, false);  break;
      case 'phantomLionfish':   this._drawLionfish(g, sz, c, ac);         break;
      default:                  this._drawOvalFish(g, sz, c, ac, false);  break;
    }
  }

  /**
   * Reliable polygon ellipse — PixiJS v8 `g.ellipse()` can be unreliable.
   * Use this instead. Does NOT call fill/stroke — caller does that.
   */
  _ellipse(g, cx, cy, hw, hh, steps = 20) {
    const pts = [];
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      pts.push(cx + Math.cos(a) * hw, cy + Math.sin(a) * hh);
    }
    g.poly(pts);
  }

  /** Generic oval fish (body + tail + dorsal + eye). Drawn facing right. */
  _drawOvalFish(g, sz, bodyColor, accentColor, hasStripes) {
    const hw = sz;
    const hh = sz * 0.55;

    // Tail (V shape behind body)
    g.moveTo(-hw * 0.7, 0)
     .lineTo(-hw * 1.35, -hh * 0.95)
     .lineTo(-hw * 1.35,  hh * 0.95)
     .closePath().fill(bodyColor);

    // Body oval
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);

    if (hasStripes) {
      // White stripes (clownfish) — drawn as narrow rects clipped visually by the oval
      g.rect(-hw * 0.15, -hh + 2, hw * 0.17, hh * 2 - 4).fill(accentColor);
      g.rect( hw * 0.35, -hh + 2, hw * 0.17, hh * 2 - 4).fill(accentColor);
      // Re-fill body at low alpha to visually soften stripe edges (no real clip)
      this._ellipse(g, 0, 0, hw, hh);
      g.fill({ color: bodyColor, alpha: 0.25 });
    }

    // Dorsal fin
    g.moveTo(-hw * 0.1, -hh)
     .lineTo( hw * 0.12, -hh - sz * 0.38)
     .lineTo( hw * 0.52, -hh)
     .closePath().fill(bodyColor);

    // Eye
    g.circle(hw * 0.5,  -hh * 0.1,  sz * 0.13).fill(0xffffff);
    g.circle(hw * 0.52, -hh * 0.09, sz * 0.08).fill(0x111111);
  }

  /** Wide disc fish (tang, butterflyfish). */
  _drawDiscFish(g, sz, bodyColor, accentColor) {
    const hw = sz;
    const hh = sz * 0.78;

    // Tail
    g.moveTo(-hw * 0.62, 0)
     .lineTo(-hw * 1.22, -hh * 0.82)
     .lineTo(-hw * 1.22,  hh * 0.82)
     .closePath().fill(bodyColor);

    // Body
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);

    // Accent stripe
    g.rect(-hw * 0.05, -hh + 2, hw * 0.17, hh * 2 - 4).fill(accentColor);

    // Dorsal fin
    g.moveTo(-hw * 0.18, -hh)
     .lineTo( hw * 0.16, -hh - sz * 0.42)
     .lineTo( hw * 0.62, -hh)
     .closePath().fill(bodyColor);

    g.circle(hw * 0.56, -hh * 0.15, sz * 0.12).fill(0xffffff);
    g.circle(hw * 0.58, -hh * 0.13, sz * 0.07).fill(0x111111);
  }

  /**
   * Moorish Idol — distinctive tall disc fish.
   * Black base → white front section → black middle band → yellow snout.
   * Long white dorsal filament.
   */
  _drawIdol(g, sz, bodyColor, accentColor) {
    // sz=20, bodyColor=white, accentColor=yellow
    const bw = sz * 1.3;   // total body width
    const bh = sz * 1.85;  // total body height (tall disc)
    const ox = -bw * 0.38; // left edge (tail side)
    const oy = -bh / 2;    // top edge

    // 1. Tail fan (behind body, black)
    g.moveTo(ox, 0)
     .lineTo(ox - sz * 0.7, -sz * 0.8)
     .lineTo(ox - sz * 0.7,  sz * 0.8)
     .closePath().fill(0x151515);

    // 2. Full body silhouette — black rounded rect
    g.roundRect(ox, oy, bw, bh, bw * 0.42).fill(0x151515);

    // 3. White front section (right ~62% of body)
    const wStart = ox + bw * 0.34;
    const wWidth = bw * 0.62;
    g.roundRect(wStart, oy + bh * 0.04, wWidth, bh * 0.92, bw * 0.38).fill(bodyColor);

    // 4. Black middle band (narrow vertical stripe dividing black/white)
    g.rect(ox + bw * 0.3, oy + bh * 0.06, bw * 0.13, bh * 0.88).fill(0x151515);

    // 5. Yellow snout (right face portion)
    const sx = ox + bw * 0.72;
    g.roundRect(sx, oy + bh * 0.2, bw * 0.34, bh * 0.6, bw * 0.22).fill(accentColor);

    // 6. Long dorsal filament (thin white thread rising from top)
    const filmX = ox + bw * 0.48;
    g.moveTo(filmX, oy)
     .lineTo(filmX + sz * 0.12, oy - sz * 1.9)
     .stroke({ color: 0xe8e8e8, width: 1.5, cap: 'round' });

    // 7. Eye
    const ex = ox + bw * 0.82;
    const ey = oy + bh * 0.25;
    g.circle(ex, ey, sz * 0.11).fill(0xffffff);
    g.circle(ex + 1, ey + 0.5, sz * 0.065).fill(0x111111);
  }

  /** Seahorse — upright S-curve body. */
  _drawSeahorse(g, sz, bodyColor, accentColor) {
    const w = sz * 0.6;
    const h = sz * 1.4;
    // body outline
    g.roundRect(-w / 2, -h / 2, w, h, w * 0.4).fill(bodyColor);
    // snout
    g.rect(w / 2 - 2, -h * 0.3, sz * 0.5, sz * 0.12).fill(accentColor);
    // dorsal fin
    g.moveTo(-w / 2, -h * 0.1)
     .lineTo(-w / 2 - sz * 0.3, -h * 0.15)
     .lineTo(-w / 2, -h * 0.3)
     .closePath()
     .fill(accentColor);
    // eye
    g.circle(w * 0.3, -h * 0.3, sz * 0.1).fill(0xffffff);
    g.circle(w * 0.32, -h * 0.28, sz * 0.06).fill(0x111111);
  }

  /** Cuttlefish — wide oval with skirt fringe. */
  _drawCuttlefish(g, sz, bodyColor, accentColor) {
    const hw = sz * 1.1;
    const hh = sz * 0.55;

    // fringe / fin
    for (let i = 0; i < 8; i++) {
      const angle = (-Math.PI * 0.8) + i * (Math.PI * 1.6 / 7);
      const fx = Math.cos(angle) * hw;
      const fy = Math.sin(angle) * hh;
      g.moveTo(fx * 0.85, fy * 0.85).lineTo(fx * 1.15, fy * 1.2)
       .stroke({ color: accentColor, width: 2, cap: 'round' });
    }

    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);
    // pattern dots
    for (let i = 0; i < 5; i++) {
      g.circle(-hw * 0.5 + i * hw * 0.25, 0, sz * 0.08).fill(accentColor);
    }
    g.circle(hw * 0.6, -hh * 0.2, sz * 0.13).fill(0xffffff);
    g.circle(hw * 0.62, -hh * 0.18, sz * 0.08).fill(0x111111);
  }

  /** Moray eel — long sinuous shape. */
  _drawEel(g, sz, bodyColor, accentColor) {
    const len = sz * 2.2;
    const th  = sz * 0.32;
    g.roundRect(-len / 2, -th / 2, len, th, th / 2).fill(bodyColor);
    // accent stripe
    g.rect(-len / 2 + 4, -th * 0.15, len - 8, th * 0.3).fill(accentColor);
    // jaw open
    g.moveTo(len / 2 - 4, -th / 2)
     .lineTo(len / 2 + sz * 0.3, -th * 0.6)
     .lineTo(len / 2 - 4,  th / 2)
     .closePath()
     .fill(this._darken(bodyColor, 0.3));
    g.circle(len / 2 - sz * 0.15, -th * 0.2, sz * 0.09).fill(0xffffff);
    g.circle(len / 2 - sz * 0.13, -th * 0.18, sz * 0.05).fill(0x111111);
  }

  /** Zebra goby — oval body with 3 vertical dark stripes. */
  _drawZebraGoby(g, sz, bodyColor, accentColor) {
    const hw = sz;
    const hh = sz * 0.5;

    g.moveTo(-hw * 0.6, 0)
     .lineTo(-hw * 1.2, -hh * 0.8)
     .lineTo(-hw * 1.2,  hh * 0.8)
     .closePath().fill(bodyColor);

    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);

    // vertical dark stripes
    [-hw * 0.3, 0, hw * 0.3].forEach(sx => {
      g.rect(sx - hw * 0.07, -hh + 2, hw * 0.14, hh * 2 - 4).fill(accentColor);
    });
    this._ellipse(g, 0, 0, hw, hh);
    g.fill({ color: bodyColor, alpha: 0.2 });

    g.circle(hw * 0.5, -hh * 0.1, sz * 0.12).fill(0xffffff);
    g.circle(hw * 0.52, -hh * 0.09, sz * 0.07).fill(0x111111);
  }

  /** Zebrafish — elongated body with horizontal dark stripes. */
  _drawZebrafish(g, sz, bodyColor, accentColor) {
    const hw = sz * 1.1;
    const hh = sz * 0.4;

    g.moveTo(-hw * 0.75, 0)
     .lineTo(-hw * 1.35, -hh * 0.9)
     .lineTo(-hw * 1.35,  hh * 0.9)
     .closePath().fill(accentColor);

    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);

    // horizontal stripes
    [-hh * 0.5, -hh * 0.1, hh * 0.3].forEach(sy => {
      g.rect(-hw * 0.7, sy - hh * 0.12, hw * 1.4, hh * 0.24).fill(accentColor);
    });
    this._ellipse(g, 0, 0, hw, hh);
    g.fill({ color: bodyColor, alpha: 0.15 });

    g.circle(hw * 0.56, -hh * 0.1, sz * 0.1).fill(0xffffff);
    g.circle(hw * 0.58, -hh * 0.08, sz * 0.06).fill(0x111111);
  }

  /** Glowfin angelfish — disc body with elongated trailing fins. */
  _drawGlowfinAngel(g, sz, bodyColor, accentColor) {
    const hw = sz;
    const hh = sz * 0.8;

    // Trailing fin (elongated)
    g.moveTo(-hw * 0.5, 0)
     .lineTo(-hw * 1.8, -hh * 0.5)
     .lineTo(-hw * 1.8,  hh * 0.5)
     .closePath().fill({ color: accentColor, alpha: 0.7 });

    // Body disc
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);

    // Glowing dorsal fin
    g.moveTo(-hw * 0.2, -hh)
     .lineTo( hw * 0.1, -hh - sz * 0.6)
     .lineTo( hw * 0.6, -hh)
     .closePath().fill({ color: accentColor, alpha: 0.85 });

    // Ventral fin
    g.moveTo(-hw * 0.1, hh)
     .lineTo( hw * 0.1, hh + sz * 0.4)
     .lineTo( hw * 0.5, hh)
     .closePath().fill({ color: accentColor, alpha: 0.7 });

    g.circle(hw * 0.56, -hh * 0.15, sz * 0.12).fill(0xffffff);
    g.circle(hw * 0.58, -hh * 0.13, sz * 0.07).fill(0x111111);
  }

  /** Phantom lionfish — stocky body with spiky dorsal fan. */
  _drawLionfish(g, sz, bodyColor, accentColor) {
    const hw = sz * 0.85;
    const hh = sz * 0.65;

    // Tail
    g.moveTo(-hw * 0.65, 0)
     .lineTo(-hw * 1.25, -hh * 0.8)
     .lineTo(-hw * 1.25,  hh * 0.8)
     .closePath().fill(bodyColor);

    // Body
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);

    // Spiky dorsal fan (5 spines)
    for (let i = 0; i < 5; i++) {
      const sx = -hw * 0.3 + i * hw * 0.15;
      const tipY = -hh - sz * (0.55 + (i % 2) * 0.25);
      g.moveTo(sx, -hh)
       .lineTo(sx + sz * 0.04, tipY)
       .stroke({ color: accentColor, width: 2.5, cap: 'round' });
    }

    // Pectoral fin spread
    g.moveTo(hw * 0.2, 0)
     .lineTo(hw * 0.85, -hh * 0.9)
     .lineTo(hw * 0.95, 0)
     .lineTo(hw * 0.85,  hh * 0.9)
     .closePath().fill({ color: accentColor, alpha: 0.55 });

    // Stripe bands
    [-hw * 0.2, hw * 0.15].forEach(bx => {
      g.rect(bx - hw * 0.07, -hh + 4, hw * 0.14, hh * 2 - 8).fill({ color: accentColor, alpha: 0.35 });
    });

    g.circle(hw * 0.44, -hh * 0.22, sz * 0.13).fill(0xffffff);
    g.circle(hw * 0.46, -hh * 0.20, sz * 0.08).fill(0x111111);
  }

  /** Octopus — rounded mantle + 8 curling tentacles. */
  _drawOctopus(g, sz, bodyColor, accentColor) {
    const mw = sz * 0.9;  // mantle half-width
    const mh = sz * 1.1;  // mantle half-height

    // 8 tentacles radiating downward from mantle base
    for (let i = 0; i < 8; i++) {
      const spread = Math.PI * 0.9;
      const angle  = (Math.PI / 2) + (-spread / 2) + i * (spread / 7);
      const tx = Math.cos(angle) * sz * 1.6;
      const ty = Math.sin(angle) * sz * 1.4;
      // control point curls the tentacle
      const cx1 = Math.cos(angle) * sz * 0.8 + Math.cos(angle + Math.PI / 2) * sz * 0.3;
      const cy1 = Math.sin(angle) * sz * 0.8 + Math.sin(angle + Math.PI / 2) * sz * 0.3;
      g.moveTo(Math.cos(angle) * mw * 0.6, mh * 0.55)
       .bezierCurveTo(cx1, cy1, tx * 0.85, ty * 0.85, tx, ty)
       .stroke({ color: bodyColor, width: sz * 0.14, cap: 'round' });
      // sucker dots
      for (let s = 1; s <= 3; s++) {
        const t = s / 4;
        const sx = Math.cos(angle) * mw * 0.6 + (tx - Math.cos(angle) * mw * 0.6) * t;
        const sy = mh * 0.55 + (ty - mh * 0.55) * t;
        g.circle(sx, sy, sz * 0.045).fill(accentColor);
      }
    }

    // Mantle (rounded teardrop)
    this._ellipse(g, 0, 0, mw, mh);
    g.fill(bodyColor);

    // Subtle pattern spots
    g.circle(-mw * 0.3, -mh * 0.2, sz * 0.1).fill({ color: accentColor, alpha: 0.5 });
    g.circle( mw * 0.2, -mh * 0.3, sz * 0.08).fill({ color: accentColor, alpha: 0.5 });
    g.circle( mw * 0.1,  mh * 0.1, sz * 0.07).fill({ color: accentColor, alpha: 0.4 });

    // Eyes (forward-facing on mantle)
    g.circle(-mw * 0.35, -mh * 0.05, sz * 0.14).fill(0xffffff);
    g.circle(-mw * 0.34, -mh * 0.04, sz * 0.09).fill(0x111111);
    g.circle( mw * 0.35, -mh * 0.05, sz * 0.14).fill(0xffffff);
    g.circle( mw * 0.34, -mh * 0.04, sz * 0.09).fill(0x111111);
  }

  /** Tropic Blenny — small elongated blenny with crest and spots. */
  _drawTropicBlenny(g, sz, bodyColor, accentColor) {
    const hw = sz * 1.05;
    const hh = sz * 0.4;

    // Forked tail
    g.moveTo(-hw * 0.72, 0)
     .lineTo(-hw * 1.3, -hh * 1.0)
     .lineTo(-hw * 1.1, 0)
     .lineTo(-hw * 1.3,  hh * 1.0)
     .closePath().fill(bodyColor);

    // Body
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);

    // Long dorsal fin
    g.moveTo(hw * 0.4, -hh)
     .lineTo(-hw * 0.55, -hh - sz * 0.42)
     .lineTo(-hw * 0.7,  -hh)
     .closePath().fill({ color: accentColor, alpha: 0.8 });

    // Head crest
    g.moveTo(hw * 0.48, -hh)
     .lineTo(hw * 0.60, -hh - sz * 0.28)
     .lineTo(hw * 0.72, -hh)
     .closePath().fill(accentColor);

    // Spots
    for (let i = 0; i < 4; i++) {
      g.circle(-hw * 0.28 + i * hw * 0.2, sz * 0.08, sz * 0.07)
       .fill({ color: accentColor, alpha: 0.65 });
    }

    // Eye
    g.circle(hw * 0.6,  -hh * 0.2, sz * 0.12).fill(0xffffff);
    g.circle(hw * 0.62, -hh * 0.18, sz * 0.07).fill(0x111111);
  }

  /** Sea Urchin — spiny sphere. */
  _drawSeaUrchin(g, sz, bodyColor, accentColor) {
    const r = sz * 0.72;

    // Spines
    for (let i = 0; i < 12; i++) {
      const a  = (i / 12) * Math.PI * 2;
      const x0 = Math.cos(a) * r * 0.88;
      const y0 = Math.sin(a) * r * 0.88;
      const x1 = Math.cos(a) * r * 1.75;
      const y1 = Math.sin(a) * r * 1.75;
      g.moveTo(x0, y0).lineTo(x1, y1)
       .stroke({ color: accentColor, width: 1.5, cap: 'round' });
    }

    // Body
    g.circle(0, 0, r).fill(bodyColor);

    // Suture lines
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.moveTo(0, 0)
       .lineTo(Math.cos(a) * r * 0.88, Math.sin(a) * r * 0.88)
       .stroke({ color: accentColor, width: 1, alpha: 0.35 });
    }

    // Highlight
    g.circle(-r * 0.28, -r * 0.28, r * 0.32).fill({ color: 0xffffff, alpha: 0.1 });
  }

  /** Parrotfish — wide body with beak and bright colors. */
  _drawParrotfish(g, sz, bodyColor, accentColor) {
    const hw = sz;
    const hh = sz * 0.72;

    // Tail
    g.moveTo(-hw * 0.60, 0)
     .lineTo(-hw * 1.28, -hh * 0.88)
     .lineTo(-hw * 1.28,  hh * 0.88)
     .closePath().fill(bodyColor);

    // Body
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);

    // Accent overlay (pink scales)
    this._ellipse(g, hw * 0.05, 0, hw * 0.62, hh * 0.72);
    g.fill({ color: accentColor, alpha: 0.35 });

    // Beak (distinctive parrotfish feature)
    g.roundRect(hw * 0.66, -hh * 0.24, hw * 0.44, hh * 0.48, hw * 0.18)
     .fill(0x80cbc4);

    // Dorsal fin
    g.moveTo(-hw * 0.36, -hh)
     .lineTo( hw * 0.12, -hh - sz * 0.42)
     .lineTo( hw * 0.52, -hh)
     .closePath().fill({ color: accentColor, alpha: 0.7 });

    // Eye
    g.circle(hw * 0.62, -hh * 0.2,  sz * 0.13).fill(0xffffff);
    g.circle(hw * 0.64, -hh * 0.18, sz * 0.08).fill(0x111111);
  }

  /** Rabbitfish — oval body with venomous spiny dorsal, round snout. */
  _drawRabbitfish(g, sz, bodyColor, accentColor) {
    const hw = sz;
    const hh = sz * 0.74;

    // Tail
    g.moveTo(-hw * 0.60, 0)
     .lineTo(-hw * 1.22, -hh * 0.82)
     .lineTo(-hw * 1.22,  hh * 0.82)
     .closePath().fill(bodyColor);

    // Body
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);

    // Creamy belly
    this._ellipse(g, hw * 0.12, hh * 0.22, hw * 0.58, hh * 0.48);
    g.fill({ color: accentColor, alpha: 0.55 });

    // Spiny dorsal (4 spines)
    for (let i = 0; i < 4; i++) {
      const sx  = -hw * 0.18 + i * hw * 0.16;
      const tip = -hh - sz * (0.32 + (i % 2) * 0.14);
      g.moveTo(sx, -hh).lineTo(sx, tip)
       .stroke({ color: bodyColor, width: 2.5, cap: 'round' });
    }

    // Round rabbit-like snout
    g.circle(hw * 0.78, 0, hh * 0.34).fill(bodyColor);

    // Eye
    g.circle(hw * 0.56, -hh * 0.2,  sz * 0.13).fill(0xffffff);
    g.circle(hw * 0.58, -hh * 0.18, sz * 0.08).fill(0x111111);
  }

  /** Cleaner Shrimp — small banded body with long antennae. */
  _drawCleanerShrimp(g, sz, bodyColor, accentColor) {
    const len = sz * 1.55;
    const th  = sz * 0.38;

    // Antennae
    g.moveTo(len * 0.38, -th * 0.35).lineTo(len * 0.82, -th * 2.1)
     .stroke({ color: accentColor, width: 1, cap: 'round' });
    g.moveTo(len * 0.38, -th * 0.05).lineTo(len * 0.88, -th * 1.8)
     .stroke({ color: accentColor, width: 1, cap: 'round' });

    // Body
    g.roundRect(-len * 0.5, -th * 0.5, len, th, th * 0.42).fill(bodyColor);

    // White bands
    [-len * 0.14, len * 0.06, len * 0.26].forEach(bx => {
      g.rect(bx - sz * 0.09, -th * 0.5, sz * 0.18, th)
       .fill({ color: accentColor, alpha: 0.88 });
    });
    g.roundRect(-len * 0.5, -th * 0.5, len, th, th * 0.42)
     .fill({ color: bodyColor, alpha: 0.18 });

    // Tail fan
    g.moveTo(-len * 0.5, -th * 0.5)
     .lineTo(-len * 0.72, -th)
     .lineTo(-len * 0.5,  th * 0.5)
     .closePath().fill({ color: accentColor, alpha: 0.7 });

    // Eye
    g.circle(len * 0.4,  -th * 0.3, sz * 0.12).fill(accentColor);
    g.circle(len * 0.41, -th * 0.28, sz * 0.07).fill(0x111111);
  }

  /** Manta Ray — wide kite silhouette with cephalic fins and thin tail. */
  _drawMantaRay(g, sz, bodyColor, accentColor) {
    const hw = sz * 1.55;   // half-wingspan
    const hh = sz * 0.55;   // body depth

    // Wing body (kite shape)
    g.moveTo(0, -hh * 0.9)
     .lineTo(-hw, hh * 0.3)
     .lineTo(0,   hh)
     .lineTo( hw, hh * 0.3)
     .closePath().fill(bodyColor);

    // White belly patch
    this._ellipse(g, sz * 0.22, hh * 0.2, sz * 0.75, hh * 0.5);
    g.fill({ color: accentColor, alpha: 0.12 });

    // Cephalic fins (forward "horns")
    g.moveTo(-sz * 0.28, -hh * 0.5)
     .lineTo(-sz * 0.72, -hh * 1.15)
     .lineTo(-sz * 0.18, -hh * 0.85)
     .closePath().fill(bodyColor);
    g.moveTo( sz * 0.28, -hh * 0.5)
     .lineTo( sz * 0.72, -hh * 1.15)
     .lineTo( sz * 0.18, -hh * 0.85)
     .closePath().fill(bodyColor);

    // Tail
    g.moveTo(sz * 0.04, hh)
     .lineTo(sz * 0.08, sz * 2.1)
     .stroke({ color: bodyColor, width: 2.5, cap: 'round' });

    // Eye
    g.circle(sz * 0.14, -hh * 0.12, sz * 0.09).fill(accentColor);
    g.circle(sz * 0.15, -hh * 0.10, sz * 0.05).fill(0x111111);
  }

  _drawManatee(g, sz, bodyColor, accentColor) {
    const hw = sz * 1.1;
    const hh = sz * 0.52;
    const dark = this._darken(bodyColor, 0.18);

    // Main body — large rounded barrel
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);

    // Belly highlight
    this._ellipse(g, sz * 0.1, hh * 0.15, hw * 0.55, hh * 0.45);
    g.fill({ color: accentColor, alpha: 0.18 });

    // Paddle tail (rounded fan)
    g.moveTo(-hw * 0.85, -hh * 0.25)
     .lineTo(-hw * 1.42, -hh * 0.55)
     .lineTo(-hw * 1.5,  0)
     .lineTo(-hw * 1.42,  hh * 0.55)
     .lineTo(-hw * 0.85,  hh * 0.25)
     .closePath().fill(dark);

    // Front flippers
    g.moveTo(hw * 0.35, hh * 0.55)
     .lineTo(hw * 0.55, hh * 1.1)
     .lineTo(hw * 0.15, hh * 0.85)
     .closePath().fill(dark);
    g.moveTo(hw * 0.35, -hh * 0.55)
     .lineTo(hw * 0.55, -hh * 1.1)
     .lineTo(hw * 0.15, -hh * 0.85)
     .closePath().fill(dark);

    // Rounded snout
    g.circle(hw * 0.98, 0, hh * 0.35).fill(bodyColor);

    // Nostrils
    g.circle(hw * 1.1, -hh * 0.14, sz * 0.065).fill(dark);
    g.circle(hw * 1.1,  hh * 0.14, sz * 0.065).fill(dark);

    // Eye
    g.circle(hw * 0.72, -hh * 0.32, sz * 0.1).fill(dark);
    g.circle(hw * 0.73, -hh * 0.31, sz * 0.055).fill(0xffffff);
    g.circle(hw * 0.74, -hh * 0.30, sz * 0.03).fill(0x111111);

    // Wrinkle lines on body
    for (let i = 0; i < 3; i++) {
      const lx = hw * (-0.1 + i * 0.22);
      g.moveTo(lx, -hh * 0.55).lineTo(lx - sz * 0.06, hh * 0.55)
       .stroke({ color: dark, width: 1, alpha: 0.4 });
    }
  }

  _drawSeaTurtle(g, sz, bodyColor, accentColor) {
    // bodyColor = green (body, flippers, head, scute fills)
    // accentColor = brown (shell carapace)
    const hw        = sz * 0.9;
    const hh        = sz * 0.68;
    const bodyDark  = this._darken(bodyColor,  0.30);
    const shellDark = this._darken(accentColor, 0.28);

    // Shell (domed oval) — brown
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(accentColor);

    // Shell scute pattern — green fills on brown shell
    const scutes = [
      [0, -hh * 0.45, hw * 0.22, hh * 0.28],
      [0,  0,          hw * 0.24, hh * 0.30],
      [0,  hh * 0.45,  hw * 0.22, hh * 0.28],
    ];
    scutes.forEach(([cx, cy, rx, ry]) => {
      this._ellipse(g, cx, cy, rx, ry);
      g.stroke({ color: shellDark, width: 1.2, alpha: 0.8 });
      this._ellipse(g, cx, cy, rx * 0.72, ry * 0.72);
      g.fill({ color: bodyColor, alpha: 0.7 });
    });
    // Side scutes — green tinted
    [-hw * 0.5, hw * 0.5].forEach(sx => {
      [-hh * 0.22, hh * 0.22].forEach(sy => {
        this._ellipse(g, sx, sy, hw * 0.18, hh * 0.22);
        g.fill({ color: bodyColor, alpha: 0.45 });
        g.stroke({ color: shellDark, width: 1, alpha: 0.6 });
      });
    });

    // Head — green
    g.circle(hw * 1.0, 0, sz * 0.28).fill(bodyColor);
    // Eye
    g.circle(hw * 1.16, -sz * 0.12, sz * 0.08).fill(bodyDark);
    g.circle(hw * 1.17, -sz * 0.11, sz * 0.045).fill(0xffffff);
    g.circle(hw * 1.18, -sz * 0.10, sz * 0.025).fill(0x111111);

    // Four flippers — dark green
    const flippers = [
      [ hw * 0.35,  hh * 0.82,  hw * 0.75,  hh * 1.35],
      [ hw * 0.35, -hh * 0.82,  hw * 0.75, -hh * 1.35],
      [-hw * 0.45,  hh * 0.72, -hw * 0.85,  hh * 1.15],
      [-hw * 0.45, -hh * 0.72, -hw * 0.85, -hh * 1.15],
    ];
    flippers.forEach(([x1, y1, x2, y2]) => {
      g.moveTo(x1, y1 * 0.5).lineTo(x2, y2).lineTo(x1, y1).closePath().fill(bodyDark);
    });

    // Tail nub — dark green
    g.moveTo(-hw * 0.9, -sz * 0.1)
     .lineTo(-hw * 1.18, 0)
     .lineTo(-hw * 0.9,  sz * 0.1)
     .closePath().fill(bodyDark);
  }

  _darken(hex, amount) {
    const r = Math.floor(((hex >> 16) & 0xff) * (1 - amount));
    const g = Math.floor(((hex >> 8)  & 0xff) * (1 - amount));
    const b = Math.floor((hex & 0xff) * (1 - amount));
    return (r << 16) | (g << 8) | b;
  }

  _lighten(hex, amount) {
    const r = Math.min(255, Math.floor(((hex >> 16) & 0xff) + (255 - ((hex >> 16) & 0xff)) * amount));
    const g = Math.min(255, Math.floor(((hex >> 8)  & 0xff) + (255 - ((hex >> 8)  & 0xff)) * amount));
    const b = Math.min(255, Math.floor((hex & 0xff)          + (255 - (hex & 0xff))          * amount));
    return (r << 16) | (g << 8) | b;
  }

  // ── AI / Movement ──────────────────────────────────────────────────────────

  /**
   * Update fish position for one tick.
   * @param {number} dt      PixiJS deltaTime (frames @ 60fps, so 1 = 16ms)
   * @param {Array}  grid    state.grid [row][col]
   * @param {Array}  coralSpecies - CORAL_SPECIES map for tall lookup
   */
  update(dt, grid, coralSpecies) {
    const speed = this.spec.speed;
    const ms    = dt * (60 / 1000) * 16;  // normalise to pixels/frame

    // ── Steer toward target ────────────────────────────────────────────────
    this.pickTargetCooldown -= dt;
    const dx   = this.targetX - this.x;
    const dy   = this.targetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 8 || this.pickTargetCooldown <= 0) {
      this._pickNewTarget(grid);
    } else {
      this.vx += (dx / dist) * STEER * speed * dt;
      this.vy += (dy / dist) * STEER * speed * dt * 0.5;  // less vertical
    }

    // ── Coral repulsion ───────────────────────────────────────────────────
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        const sid = grid[r][c];
        if (!sid) continue;
        const spec = coralSpecies[sid];
        if (!spec) continue;
        // Layer B: only avoids massive blocksB structures (elkhorn, pillar)
        if (this.layer === 'B' && !spec.blocksB) continue;
        // Layer A: avoids all tall coral
        if (this.layer === 'A' && !spec.tall) continue;

        const cx  = GRID_X + c * TILE_SIZE + TILE_SIZE / 2;
        const cy  = GRID_Y + r * TILE_SIZE + TILE_SIZE / 2;
        const rdx = this.x - cx;
        const rdy = this.y - cy;
        const rd  = Math.sqrt(rdx * rdx + rdy * rdy);
        if (rd < REPULSE_R && rd > 0) {
          const force = (REPULSE_R - rd) / REPULSE_R * speed * 0.4;
          this.vx += (rdx / rd) * force * dt;
          this.vy += (rdy / rd) * force * dt;
        }
      }
    }

    // ── Dampen & clamp ────────────────────────────────────────────────────
    this.vx *= DAMPEN;
    this.vy *= DAMPEN;

    const spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    const maxSpd = speed * 2;
    if (spd > maxSpd) {
      this.vx = (this.vx / spd) * maxSpd;
      this.vy = (this.vy / spd) * maxSpd;
    }

    // ── Integrate position ────────────────────────────────────────────────
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // ── Bounce off reef bounds ─────────────────────────────────────────────
    const left   = GRID_X + MARGIN;
    const right  = GRID_X + GRID_W - MARGIN;
    const top    = GRID_Y + MARGIN;
    const bottom = GRID_Y + GRID_H - MARGIN;

    if (this.x < left)   { this.x = left;   this.vx =  Math.abs(this.vx); }
    if (this.x > right)  { this.x = right;  this.vx = -Math.abs(this.vx); }
    if (this.y < top)    { this.y = top;     this.vy =  Math.abs(this.vy); }
    if (this.y > bottom) { this.y = bottom;  this.vy = -Math.abs(this.vy); }

    // ── Update sprite ─────────────────────────────────────────────────────
    this.container.x = this.x;
    this.container.y = this.y;
    // Flip to face direction of travel
    if (Math.abs(this.vx) > 0.05) {
      this.container.scale.x = this.vx > 0 ? 1 : -1;
    }

    // Subtle vertical bob
    this.container.scale.y = 1 + Math.sin(Date.now() * 0.003 + this.uid) * 0.04;
  }

  _pickNewTarget(grid) {
    // Occasionally head toward a coral tile, otherwise wander
    const occupiedTiles = getOccupiedTiles(grid);
    const usesCoral = occupiedTiles.length > 0 && Math.random() < 0.4;

    if (usesCoral) {
      const pick = occupiedTiles[Math.floor(Math.random() * occupiedTiles.length)];
      const cx   = tileCenter(pick.col, pick.row);
      // Aim near the coral (not on top of it)
      const angle = Math.random() * Math.PI * 2;
      const dist  = TILE_SIZE * (1.2 + Math.random() * 1.5);
      this.targetX = cx.x + Math.cos(angle) * dist;
      this.targetY = cx.y + Math.sin(angle) * dist;
    } else {
      this.targetX = GRID_X + MARGIN + Math.random() * (GRID_W - MARGIN * 2);
      this.targetY = GRID_Y + MARGIN + Math.random() * (GRID_H - MARGIN * 2);
    }

    this.pickTargetCooldown = 80 + Math.random() * 120;
  }
}
