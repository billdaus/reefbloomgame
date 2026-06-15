import { Graphics } from 'pixi.js';
import { TILE_SIZE } from '../constants.js';

/**
 * Coral — draws a procedural flat/minimal sprite for each species.
 * The sprite is drawn in tile-local space [0,TILE_SIZE] (pivot at base-centre,
 * GridLayer positions accordingly). Upgrade levels do NOT scale the sprite past
 * its tile — instead each level redraws with extra branchlets and polyps, so a
 * grown coral reads as fuller and more intricate while staying in its tile.
 */
export class Coral {
  constructor(speciesData, col, row, uid, level = 1) {
    this.spec   = speciesData;
    this.col    = col;
    this.row    = row;
    this.uid    = uid;
    this.level  = level;

    this.container = new Graphics();
    this.container.pivot.set(TILE_SIZE / 2, TILE_SIZE);
    this._draw();
  }

  /** Redraw the coral with the intricacy of an upgrade level (1 = base). */
  setLevel(level) {
    this.level = level;
    this._draw();
  }

  _draw() {
    const g   = this.container;
    const s   = TILE_SIZE;
    const c   = this.spec.color;
    const id  = this.spec.id;

    g.clear();

    switch (id) {
      case 'starter':      this._drawStarter(g, s, c);     break;
      case 'firetip':      this._drawFiretip(g, s, c);     break;
      case 'ghost':        this._drawGhost(g, s, c);       break;
      case 'staghorn':     this._drawStaghorn(g, s, c);    break;
      case 'finger':       this._drawFinger(g, s, c);      break;
      case 'brain':        this._drawBrain(g, s, c);       break;
      case 'lettuce':      this._drawLettuce(g, s, c);     break;
      case 'star':         this._drawStar(g, s, c);        break;
      case 'bubble':       this._drawBubble(g, s, c);      break;
      case 'candycane':    this._drawCandyCane(g, s, c);   break;
      case 'toadstool':    this._drawToadstool(g, s, c);   break;
      case 'elkhorn':      this._drawElkhorn(g, s, c);     break;
      case 'pillar':       this._drawPillar(g, s, c);      break;
      case 'table':        this._drawTable(g, s, c);       break;
      case 'rainbowCoral': this._drawRainbowCoral(g, s, c); break;
      case 'sunfire':      this._drawSunfire(g, s, c);     break;
      case 'barnacles':    this._drawBarnacles(g, s, c);     break;
      case 'redSeagrass':  this._drawRedSeagrass(g, s, c);   break;
      case 'seaweed':      this._drawSeaweed(g, s, c);       break;
      case 'seagrass':     this._drawSeagrass(g, s, c);      break;
      case 'kelp':         this._drawKelp(g, s, c);          break;
      case 'twilightBrain': this._drawTwilightBrain(g, s, c); break;
      case 'phantomPolyp': this._drawPhantomPolyp(g, s, c); break;
      case 'midnightTable':   this._drawMidnightTable(g, s, c);   break;
      case 'abyssalFan':      this._drawAbyssalFan(g, s, c);      break;
      case 'lanternCoral':    this._drawLanternCoral(g, s, c);    break;
      case 'wispCoral':       this._drawWispCoral(g, s, c);       break;
      // Event pass exclusives
      case 'pearlOrganPipe':  this._drawPearlOrganPipe(g, s, c);  break;
      default:                this._drawGeneric(g, s, c);          break;
    }

    if (this.level > 1) this._growth(g, s, c, id, this.level);
  }

  // ── Upgrade growth — species-specific, deterministic detail per level ───────
  // Each species' growth extends its OWN motif (branches branch more, domes
  // gain concentric polyp rings, clusters add members) rather than a generic
  // overlay, so an upgraded coral reads as a fuller version of itself. All
  // additions stay within the tile.

  _growth(g, s, c, id, level) {
    switch (id) {
      case 'staghorn':     this._growBranch(g, s, c, level, s * 0.50); break;
      case 'firetip':      this._growBranch(g, s, c, level, s * 0.52); break;
      case 'elkhorn':      this._growBranch(g, s, c, level, s * 0.55); break;
      case 'finger':
      case 'candycane':
      case 'pillar':
      case 'lanternCoral':
      case 'phantomPolyp': this._growColumns(g, s, c, level); break;
      case 'abyssalFan':   this._growFan(g, s, c, level); break;
      case 'wispCoral':    this._growBlades(g, s, c, level); break;
      case 'brain':
      case 'twilightBrain':
      case 'rainbowCoral': this._growDome(g, s, c, level, s / 2, s * 0.56, s * 0.38); break;
      case 'star':         this._growDome(g, s, c, level, s / 2, s * 0.58, s * 0.36); break;
      case 'starter':      this._growDome(g, s, c, level, s / 2, s * 0.65, s * 0.22); break;
      case 'bubble':       this._growSpheres(g, s, c, level); break;
      case 'ghost':
      case 'lettuce':      this._growFan(g, s, c, level); break;
      case 'seagrass':
      case 'redSeagrass':
      case 'seaweed':
      case 'kelp':         this._growBlades(g, s, c, level); break;
      case 'sunfire':      this._growRadial(g, s, c, level); break;
      case 'table':
      case 'midnightTable': this._growShelf(g, s, c, level); break;
      case 'toadstool':    this._growMushroom(g, s, c, level); break;
      case 'barnacles':    this._growCrust(g, s, c, level); break;
      default:             this._growGeneric(g, s, c, level); break;
    }
  }

  /** Branching corals — add symmetric branch pairs fanning wider each level. */
  _growBranch(g, s, c, level, anchorY) {
    const gl   = Math.min(4, level - 1);
    const mid  = s / 2;
    const tip  = this._lighten(c, 0.6);
    for (let i = 1; i <= gl; i++) {
      const spread = 0.14 + i * 0.06;                 // widen outward each tier
      const topY   = Math.max(s * 0.06, anchorY - s * (0.16 + i * 0.03));
      const w      = Math.max(2.5, 5 - i);
      for (const side of [-1, 1]) {
        const ex = mid + side * s * spread;
        g.moveTo(mid, anchorY).lineTo(ex, topY).stroke({ color: c, width: w, cap: 'round' });
        g.circle(ex, topY, 3).fill(tip);
      }
    }
  }

  /** Column corals — interleave extra columns into the cluster. */
  _growColumns(g, s, c, level) {
    const gl    = Math.min(4, level - 1);
    const light = this._lighten(c, 0.5);
    const offs  = [0.36, 0.64, 0.16, 0.84];           // insertion order
    const heights = [0.30, 0.26, 0.34, 0.22];
    for (let i = 0; i < gl; i++) {
      const cx  = s * offs[i % offs.length];
      const top = s * heights[i % heights.length];
      const cw  = 8;
      g.roundRect(cx - cw / 2, top, cw, s - top - 4, 4).fill(c);
      g.circle(cx, top, cw / 2 + 1).fill(light);       // lighter tip
    }
  }

  /** Dome corals — add concentric, evenly-spaced polyp rings. */
  _growDome(g, s, c, level, cx, cy, r) {
    const gl    = Math.min(4, level - 1);
    const light = this._lighten(c, 0.55);
    const dark  = this._darken(c, 0.28);
    // grow the dome a touch so the rings sit on a fuller body
    g.circle(cx, cy, r * (1 + gl * 0.04)).fill(c);
    for (let ring = 1; ring <= gl; ring++) {
      const rr = r * (0.32 + ring * 0.17);
      const n  = 4 + ring * 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ring * 0.5;
        g.circle(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.92, 2)
         .fill(ring % 2 ? light : dark);
      }
    }
  }

  /** Bubble coral — stack additional spheres into a taller cluster. */
  _growSpheres(g, s, c, level) {
    const gl    = Math.min(4, level - 1);
    const tiers = [[0.5, 0.28, 0.13], [0.38, 0.22, 0.11], [0.62, 0.22, 0.11], [0.5, 0.15, 0.1]];
    for (let i = 0; i < gl; i++) {
      const [fx, fy, fr] = tiers[i];
      g.circle(fx * s, fy * s, fr * s).fill(c);
      g.circle(fx * s - fr * s * 0.3, fy * s - fr * s * 0.3, fr * s * 0.25).fill(0xffffff);
    }
  }

  /** Fan corals — add symmetric fronds spreading from the base. */
  _growFan(g, s, c, level) {
    const gl   = Math.min(4, level - 1);
    const mid  = s / 2;
    const base = s * 0.75;
    const dark = this._darken(c, 0.2);
    for (let i = 1; i <= gl; i++) {
      const side = i % 2 ? -1 : 1;
      const off  = 0.1 * Math.ceil(i / 2);
      const cx   = mid + side * s * off;
      const top  = base - s * (0.42 + 0.03 * i);
      g.moveTo(mid, base).lineTo(cx, Math.max(s * 0.08, top))
       .stroke({ color: i % 2 ? c : dark, width: 2, cap: 'round' });
    }
  }

  /** Bladed plants — add more blades to the clump. */
  _growBlades(g, s, c, level) {
    const gl   = Math.min(4, level - 1);
    const dark = this._darken(c, 0.28);
    const base = s - 2;
    const offs = [0.28, 0.46, 0.64, 0.82];
    for (let i = 0; i < gl; i++) {
      const x    = s * offs[i % offs.length];
      const h    = s * (0.62 + 0.05 * i);
      const lean = (i % 2 ? 1 : -1) * 0.06;
      const tipX = x + lean * s;
      const tipY = base - h;
      g.moveTo(x - 3, base).lineTo(x + 3, base)
       .lineTo(tipX + 1.5, tipY).lineTo(tipX - 1.5, tipY).closePath()
       .fill(i % 2 ? c : dark);
    }
  }

  /** Sunfire — add more radial spokes between the existing ones. */
  _growRadial(g, s, c, level) {
    const gl    = Math.min(4, level - 1);
    const mid   = s / 2;
    const coreY = s * 0.58;
    const n     = gl * 2;
    for (let i = 0; i < n; i++) {
      const a   = ((i + 0.5) / n) * Math.PI * 2 - Math.PI / 2;
      const len = s * (0.2 + (i % 2) * 0.08);
      g.moveTo(mid, coreY).lineTo(mid + Math.cos(a) * len, coreY + Math.sin(a) * len)
       .stroke({ color: c, width: 2.5, cap: 'round' });
    }
  }

  /** Shelf corals — denser polyps on the surface and more tendrils beneath. */
  _growShelf(g, s, c, level) {
    const gl    = Math.min(4, level - 1);
    const light = this._lighten(c, 0.4);
    const dark  = this._darken(c, 0.25);
    const n     = 4 + gl * 2;
    for (let i = 0; i < n; i++) {
      g.circle(s * 0.14 + i * (s * 0.72 / (n - 1)), s * 0.33, 2).fill(light);
    }
    for (let i = 0; i <= gl; i++) {
      const tx = s * 0.2 + i * (s * 0.6 / Math.max(1, gl));
      g.moveTo(tx, s * 0.42).lineTo(tx + (i % 2 ? 2 : -2), s * 0.42 + s * (0.06 + 0.02 * gl))
       .stroke({ color: dark, width: 1.5, alpha: 0.8, cap: 'round' });
    }
  }

  /** Toadstool — add more tentacle fringe under a fuller cap. */
  _growMushroom(g, s, c, level) {
    const gl   = Math.min(4, level - 1);
    const mid  = s / 2;
    const dark = this._darken(c, 0.2);
    const n    = gl * 2;
    for (let i = 0; i < n; i++) {
      const tx = (mid - s * 0.34) + i * (s * 0.68 / Math.max(1, n - 1));
      g.moveTo(tx, s * 0.5).lineTo(tx + (i % 2 ? 4 : -4), s * 0.63)
       .stroke({ color: dark, width: 2, cap: 'round' });
    }
  }

  /** Barnacles — encrust additional cones onto the substrate. */
  _growCrust(g, s, c, level) {
    const gl   = Math.min(4, level - 1);
    const dark = this._darken(c, 0.35);
    const yb   = s - 3;
    const xs   = [0.26, 0.42, 0.58, 0.74];
    for (let i = 0; i < gl; i++) {
      const x = s * xs[i % xs.length];
      const h = s * (0.16 + 0.03 * (i % 2));
      const bw = 9, tw = 5, yt = yb - h;
      g.moveTo(x - bw / 2, yb).lineTo(x + bw / 2, yb)
       .lineTo(x + tw / 2, yt).lineTo(x - tw / 2, yt).closePath().fill(c);
      g.rect(x - tw / 2, yt - 2, tw, 3).fill(dark);
    }
  }

  /** Fallback growth — concentric framing for species without a motif helper. */
  _growGeneric(g, s, c, level) {
    const gl    = Math.min(4, level - 1);
    const light = this._lighten(c, 0.4);
    for (let i = 1; i <= gl; i++) {
      const inset = s * (0.2 - i * 0.03);
      if (inset <= 0) break;
      g.roundRect(inset, inset, s - 2 * inset, s - 2 * inset, 6)
       .stroke({ color: light, width: 1.5, alpha: 0.6 });
    }
  }

  // ── Staghorn — branching antler shape ──────────────────────────────────────
  _drawStaghorn(g, s, c) {
    const mid = s / 2;
    const sw  = 5;
    // base trunk
    g.moveTo(mid, s - 4)
     .lineTo(mid, s * 0.5)
     .stroke({ color: c, width: sw, cap: 'round' });
    // left branch
    g.moveTo(mid, s * 0.5)
     .lineTo(mid - s * 0.28, s * 0.15)
     .stroke({ color: c, width: sw - 1, cap: 'round' });
    // right branch
    g.moveTo(mid, s * 0.5)
     .lineTo(mid + s * 0.28, s * 0.15)
     .stroke({ color: c, width: sw - 1, cap: 'round' });
    // left sub-branch
    g.moveTo(mid - s * 0.14, s * 0.3)
     .lineTo(mid - s * 0.36, s * 0.1)
     .stroke({ color: c, width: sw - 2, cap: 'round' });
    // right sub-branch
    g.moveTo(mid + s * 0.14, s * 0.3)
     .lineTo(mid + s * 0.36, s * 0.1)
     .stroke({ color: c, width: sw - 2, cap: 'round' });
    // tip dots
    g.circle(mid - s * 0.28, s * 0.14, 4).fill(c);
    g.circle(mid + s * 0.28, s * 0.14, 4).fill(c);
    g.circle(mid - s * 0.36, s * 0.09, 3).fill(c);
    g.circle(mid + s * 0.36, s * 0.09, 3).fill(c);
  }

  // ── Finger coral — rounded vertical columns ────────────────────────────────
  _drawFinger(g, s, c) {
    const cw    = 10;
    const offsets = [s * 0.22, s * 0.5, s * 0.78];
    const heights = [0.22, 0.12, 0.18];
    offsets.forEach((cx, i) => {
      const top = s * heights[i];
      g.roundRect(cx - cw / 2, top, cw, s - top - 4, 5).fill(c);
      // lighter tip
      g.circle(cx, top, cw / 2 + 1).fill(this._lighten(c, 0.5));
    });
  }

  // ── Brain coral — dome with ruled lines ────────────────────────────────────
  _drawBrain(g, s, c) {
    const mid = s / 2;
    const r   = s * 0.38;
    g.circle(mid, s * 0.56, r).fill(c);
    // groove lines across dome (clip-like overlay via darker tone)
    const dark = this._darken(c, 0.3);
    for (let i = -2; i <= 2; i++) {
      const lx = mid + i * r * 0.32;
      g.moveTo(lx, s * 0.56 - Math.sqrt(Math.max(0, r*r - (i*r*0.32)*(i*r*0.32))) + 4)
       .lineTo(lx, s * 0.56 + Math.sqrt(Math.max(0, r*r - (i*r*0.32)*(i*r*0.32))) - 4)
       .stroke({ color: dark, width: 2 });
    }
  }

  // ── Lettuce coral — overlapping fans ──────────────────────────────────────
  _drawLettuce(g, s, c) {
    const mid  = s / 2;
    const base = s * 0.72;
    const dark = this._darken(c, 0.25);
    // three fan layers
    [[mid - s * 0.22, 0.55], [mid, 0.42], [mid + s * 0.22, 0.55]].forEach(([cx, topFrac]) => {
      g.moveTo(cx, base)
       .lineTo(cx - s * 0.2, s * topFrac)
       .lineTo(cx, s * (topFrac - 0.08))
       .lineTo(cx + s * 0.2, s * topFrac)
       .closePath()
       .fill(c);
      g.moveTo(cx, base)
       .lineTo(cx - s * 0.2, s * topFrac)
       .stroke({ color: dark, width: 1.5 });
      g.moveTo(cx, base)
       .lineTo(cx + s * 0.2, s * topFrac)
       .stroke({ color: dark, width: 1.5 });
    });
  }

  // ── Star coral — dome with raised dots ────────────────────────────────────
  _drawStar(g, s, c) {
    const mid = s / 2;
    g.circle(mid, s * 0.58, s * 0.36).fill(c);
    const dark = this._darken(c, 0.3);
    const dotPos = [
      [0, -0.18], [0.14, -0.06], [-0.14, -0.06],
      [0.09, 0.1], [-0.09, 0.1], [0, 0.2],
    ];
    dotPos.forEach(([dx, dy]) => {
      g.circle(mid + dx * s, s * 0.58 + dy * s, 4).fill(dark);
      g.circle(mid + dx * s, s * 0.58 + dy * s, 2.5).fill(c);
    });
  }

  // ── Bubble coral — cluster of spheres ─────────────────────────────────────
  _drawBubble(g, s, c) {
    const positions = [
      [0.3, 0.65, 0.16], [0.5, 0.58, 0.18], [0.7, 0.65, 0.16],
      [0.4, 0.45, 0.14], [0.6, 0.45, 0.14], [0.5, 0.35, 0.12],
    ];
    positions.forEach(([fx, fy, fr]) => {
      g.circle(fx * s, fy * s, fr * s).fill(c);
      g.circle(fx * s - fr * s * 0.3, fy * s - fr * s * 0.3, fr * s * 0.25)
       .fill(0xffffff);  // specular
    });
  }

  // ── Candy cane coral — striped columns ─────────────────────────────────────
  _drawCandyCane(g, s, c) {
    const accent = 0xffffff;
    const offsets = [s * 0.3, s * 0.5, s * 0.7];
    const heights = [0.18, 0.10, 0.16];
    offsets.forEach((cx, i) => {
      const top = s * heights[i];
      const h   = s - top - 4;
      g.roundRect(cx - 5, top, 10, h, 5).fill(c);
      // candy stripes
      for (let y = top + 6; y < top + h - 4; y += 12) {
        g.rect(cx - 5, y, 10, 5).fill(accent);
      }
    });
  }

  // ── Toadstool leather — wide mushroom cap ─────────────────────────────────
  _drawToadstool(g, s, c) {
    const mid  = s / 2;
    const dark = this._darken(c, 0.2);
    // stalk
    g.roundRect(mid - 6, s * 0.55, 12, s * 0.38, 4).fill(dark);
    // cap (polygon ellipse — g.ellipse is unreliable in PixiJS v8)
    g.poly(this._ellipsePts(mid, s * 0.5, s * 0.42, s * 0.18)).fill(c);
    // tentacle fringe
    for (let i = 0; i < 7; i++) {
      const tx = (mid - s * 0.38) + i * (s * 0.76 / 6);
      g.moveTo(tx, s * 0.5)
       .lineTo(tx + (i % 2 === 0 ? -4 : 4), s * 0.62)
       .stroke({ color: dark, width: 2, cap: 'round' });
    }
  }

  // ── Elkhorn — flat spreading antlers ──────────────────────────────────────
  _drawElkhorn(g, s, c) {
    const mid = s / 2;
    const sw  = 8;
    g.moveTo(mid, s - 4).lineTo(mid, s * 0.55).stroke({ color: c, width: sw, cap: 'round' });
    // left spread
    g.moveTo(mid, s * 0.55)
     .lineTo(mid - s * 0.38, s * 0.18)
     .stroke({ color: c, width: sw, cap: 'round' });
    // right spread
    g.moveTo(mid, s * 0.55)
     .lineTo(mid + s * 0.38, s * 0.18)
     .stroke({ color: c, width: sw, cap: 'round' });
    // palmate tips
    g.moveTo(mid - s * 0.38, s * 0.18).lineTo(mid - s * 0.46, s * 0.06).stroke({ color: c, width: 5, cap: 'round' });
    g.moveTo(mid - s * 0.38, s * 0.18).lineTo(mid - s * 0.28, s * 0.05).stroke({ color: c, width: 5, cap: 'round' });
    g.moveTo(mid + s * 0.38, s * 0.18).lineTo(mid + s * 0.46, s * 0.06).stroke({ color: c, width: 5, cap: 'round' });
    g.moveTo(mid + s * 0.38, s * 0.18).lineTo(mid + s * 0.28, s * 0.05).stroke({ color: c, width: 5, cap: 'round' });
  }

  // ── Pillar coral — tall ribbed column ─────────────────────────────────────
  _drawPillar(g, s, c) {
    const mid  = s / 2;
    const dark = this._darken(c, 0.25);
    g.roundRect(mid - 10, s * 0.06, 20, s * 0.88, 6).fill(c);
    // ribs
    for (let y = s * 0.12; y < s * 0.88; y += 9) {
      g.moveTo(mid - 10, y).lineTo(mid + 10, y).stroke({ color: dark, width: 1.5 });
    }
  }

  // ── Starter coral — simple dome with polyp dots ───────────────────────────
  _drawStarter(g, s, c) {
    const mid = s / 2;
    g.circle(mid, s * 0.65, s * 0.22).fill(c);
    const light = this._lighten(c, 0.5);
    [[-0.12, -0.08], [0.12, -0.08], [0, -0.18], [0, 0.02]].forEach(([dx, dy]) => {
      g.circle(mid + dx * s, s * 0.65 + dy * s, 3.5).fill(light);
    });
  }

  // ── Firetip coral — branching with bright orange tips ─────────────────────
  _drawFiretip(g, s, c) {
    const mid = s / 2;
    const tip = 0xff5722;
    g.moveTo(mid, s - 4).lineTo(mid, s * 0.52)
     .stroke({ color: c, width: 5, cap: 'round' });
    [[-0.24, 0.18], [0, 0.08], [0.24, 0.18]].forEach(([dx, topY]) => {
      g.moveTo(mid, s * 0.52)
       .lineTo(mid + dx * s, s * topY)
       .stroke({ color: c, width: 4, cap: 'round' });
      g.circle(mid + dx * s, s * topY, 5).fill(tip);
      g.circle(mid + dx * s, s * topY, 2.5).fill(0xffccbc);
    });
  }

  // ── Ghost coral — pale translucent fan ────────────────────────────────────
  _drawGhost(g, s, c) {
    const mid = s / 2;
    const base = s * 0.75;
    const dark = this._darken(c, 0.15);
    for (let i = -3; i <= 3; i++) {
      const angle = Math.PI * 0.5 + i * 0.22;
      const len   = i === 0 ? s * 0.5 : s * (0.36 + Math.abs(i) * 0.02);
      g.moveTo(mid, base)
       .lineTo(mid + Math.cos(Math.PI - angle) * len, base - Math.sin(angle) * len)
       .stroke({ color: i % 2 === 0 ? c : dark, width: 2, cap: 'round' });
    }
    g.circle(mid, base, 5).fill(dark);
  }

  // ── Table coral — flat horizontal shelf on a stalk ────────────────────────
  _drawTable(g, s, c) {
    const mid  = s / 2;
    const dark = this._darken(c, 0.2);
    // Stalk
    g.roundRect(mid - 5, s * 0.42, 10, s * 0.5, 4).fill(dark);
    // Flat table top
    g.roundRect(s * 0.08, s * 0.26, s * 0.84, s * 0.16, 6).fill(c);
    // Rim highlight
    const light = this._lighten(c, 0.4);
    g.roundRect(s * 0.08, s * 0.26, s * 0.84, 3, 6).fill(light);
    // Polyp dots on surface
    for (let i = 0; i < 5; i++) {
      g.circle(s * 0.18 + i * s * 0.16, s * 0.34, 2.5).fill(dark);
    }
  }

  // ── Rainbow coral — colourful dome with banded polyps ─────────────────────
  _drawRainbowCoral(g, s, c) {
    const mid = s / 2;
    const r   = s * 0.38;
    g.circle(mid, s * 0.56, r).fill(c);
    const bands = [0xff5252, 0xff9800, 0xffeb3b, 0x66bb6a, 0x42a5f5, 0xab47bc];
    bands.forEach((bc, i) => {
      g.circle(mid + (i - 2.5) * r * 0.3, s * 0.56, r * 0.1).fill(bc);
    });
  }

  // ── Sunfire coral — radial spiky structure ────────────────────────────────
  _drawSunfire(g, s, c) {
    const mid    = s / 2;
    const coreY  = s * 0.58;
    const bright = 0xffeb3b;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const len   = i % 2 === 0 ? s * 0.34 : s * 0.22;
      g.moveTo(mid, coreY)
       .lineTo(mid + Math.cos(angle) * len, coreY + Math.sin(angle) * len)
       .stroke({ color: i % 2 === 0 ? bright : c, width: i % 2 === 0 ? 4 : 3, cap: 'round' });
    }
    g.circle(mid, coreY, s * 0.1).fill(bright);
    g.circle(mid, coreY, s * 0.05).fill(0xffffff);
  }

  // ── Barnacles — cluster of calcite cones on the substrate ────────────
  _drawBarnacles(g, s, c) {
    const dark  = this._darken(c, 0.35);
    const light = this._lighten(c, 0.28);
    const cones = [
      { x: s * 0.18, bw: 12, tw: 7,  h: s * 0.28 },
      { x: s * 0.34, bw: 10, tw: 6,  h: s * 0.22 },
      { x: s * 0.50, bw: 14, tw: 8,  h: s * 0.34 },
      { x: s * 0.66, bw:  9, tw: 5,  h: s * 0.20 },
      { x: s * 0.82, bw: 11, tw: 6,  h: s * 0.26 },
    ];
    cones.forEach(({ x, bw, tw, h }) => {
      const yb = s - 3;
      const yt = yb - h;
      // Cone body (trapezoid)
      g.moveTo(x - bw / 2, yb)
       .lineTo(x + bw / 2, yb)
       .lineTo(x + tw / 2, yt)
       .lineTo(x - tw / 2, yt)
       .closePath()
       .fill(c);
      // Operculum plate at top
      g.rect(x - tw / 2, yt - 2, tw, 3).fill(dark);
      // Highlight rib down the cone
      g.moveTo(x, yb - 2)
       .lineTo(x, yt + 2)
       .stroke({ color: light, width: 1, alpha: 0.55 });
    });
    // Substrate base
    g.rect(s * 0.06, s - 3, s * 0.88, 3).fill(dark);
  }

  // ── Red Seagrass — broad oval-tipped blades, reddish-crimson ─────────
  _drawRedSeagrass(g, s, c) {
    const dark  = this._darken(c, 0.3);
    const light = this._lighten(c, 0.22);
    const blades = [
      { x: s * 0.20, h: s * 0.68, lean: -0.09 },
      { x: s * 0.38, h: s * 0.80, lean:  0.10 },
      { x: s * 0.57, h: s * 0.86, lean: -0.06 },
      { x: s * 0.76, h: s * 0.72, lean:  0.08 },
    ];
    blades.forEach(({ x, h, lean }, i) => {
      const base = s - 2;
      const tipX = x + lean * s;
      const tipY = base - h;
      const col  = i % 2 === 0 ? c : dark;
      // Wider blade body
      g.moveTo(x - 5, base)
       .lineTo(x + 5, base)
       .lineTo(tipX + 2, tipY + h * 0.12)
       .lineTo(tipX - 2, tipY + h * 0.12)
       .closePath()
       .fill(col);
      // Rounded tip cap
      g.circle(tipX, tipY + h * 0.10, 3).fill(col);
      // Midrib
      g.moveTo(x, base)
       .lineTo(tipX, tipY)
       .stroke({ color: light, width: 1, alpha: 0.45 });
      // Two cross-veins
      for (let v = 1; v <= 2; v++) {
        const t  = v / 3;
        const vx = x + (tipX - x) * t;
        const vy = base + (tipY - base) * t;
        const vw = 4 * (1 - t) + 1;
        g.moveTo(vx - vw, vy).lineTo(vx + vw, vy)
         .stroke({ color: light, width: 1, alpha: 0.28 });
      }
    });
    g.rect(s * 0.06, s - 4, s * 0.88, 4).fill(dark);
  }

  // ── Seagrass — tall ribbon blades growing from substrate ─────────────────
  _drawSeagrass(g, s, c) {
    const dark  = this._darken(c, 0.28);
    const light = this._lighten(c, 0.3);
    // Five blades at irregular x offsets, swaying slightly
    const blades = [
      { x: s * 0.18, h: s * 0.78, lean: -0.10 },
      { x: s * 0.34, h: s * 0.88, lean:  0.06 },
      { x: s * 0.50, h: s * 0.95, lean: -0.04 },
      { x: s * 0.66, h: s * 0.84, lean:  0.12 },
      { x: s * 0.82, h: s * 0.72, lean: -0.08 },
    ];
    blades.forEach(({ x, h, lean }, i) => {
      const base  = s - 2;
      const tipX  = x + lean * s;
      const tipY  = base - h;
      const col   = i % 2 === 0 ? c : dark;
      // blade as a tapered quad
      g.moveTo(x - 4, base)
       .lineTo(x + 4, base)
       .lineTo(tipX + 1.5, tipY)
       .lineTo(tipX - 1.5, tipY)
       .closePath()
       .fill(col);
      // midrib highlight
      g.moveTo(x, base)
       .lineTo(tipX, tipY)
       .stroke({ color: light, width: 1, alpha: 0.55 });
    });
    // substrate base line
    g.rect(s * 0.06, s - 4, s * 0.88, 4).fill(dark);
  }

  // ── Seaweed — bushy wavy fronds growing from base ────────────────────────
  _drawSeaweed(g, s, c) {
    const dark  = this._darken(c, 0.3);
    const light = this._lighten(c, 0.25);
    // Four wavy frond stalks
    const fronds = [
      { x: s * 0.22, lean: -0.18, h: s * 0.62 },
      { x: s * 0.40, lean:  0.14, h: s * 0.74 },
      { x: s * 0.60, lean: -0.10, h: s * 0.68 },
      { x: s * 0.78, lean:  0.16, h: s * 0.58 },
    ];
    fronds.forEach(({ x, lean, h }, i) => {
      const base  = s - 2;
      const tipX  = x + lean * s;
      const tipY  = base - h;
      const midX  = x + lean * s * 0.5;
      const midY  = base - h * 0.5;
      const col   = i % 2 === 0 ? c : dark;
      // Wavy stalk using a quadratic bezier approximated by 3 segments
      g.moveTo(x, base)
       .lineTo(midX + (lean > 0 ? -6 : 6), midY)
       .lineTo(tipX, tipY)
       .stroke({ color: col, width: 3, cap: 'round' });
      // Small oval leaf at tip
      g.circle(tipX, tipY, 4).fill(light);
      // Two side leaflets along the stalk
      const lx1 = x + lean * s * 0.28; const ly1 = base - h * 0.28;
      const lx2 = x + lean * s * 0.60; const ly2 = base - h * 0.60;
      [{ lx: lx1, ly: ly1 }, { lx: lx2, ly: ly2 }].forEach(({ lx, ly }) => {
        g.moveTo(lx, ly).lineTo(lx + (i % 2 === 0 ? 8 : -8), ly - 5)
         .stroke({ color: light, width: 2, cap: 'round' });
      });
    });
    g.rect(s * 0.08, s - 4, s * 0.84, 4).fill(dark);
  }

  // ── Giant Kelp — tall ribbed stipe with broad paired fronds ──────────────
  _drawKelp(g, s, c) {
    const dark  = this._darken(c, 0.3);
    const light = this._lighten(c, 0.35);
    const mid   = s / 2;
    // Central stipe (slightly wavy)
    g.moveTo(mid + 2, s - 2)
     .lineTo(mid - 3, s * 0.65)
     .lineTo(mid + 3, s * 0.35)
     .lineTo(mid - 1, s * 0.05)
     .stroke({ color: dark, width: 4, cap: 'round', join: 'round' });
    // Paired blade fronds at three heights
    const bladeRows = [
      { y: s * 0.68, w: s * 0.30, h: s * 0.12, stipeOff:  2 },
      { y: s * 0.42, w: s * 0.26, h: s * 0.10, stipeOff: -2 },
      { y: s * 0.18, w: s * 0.20, h: s * 0.08, stipeOff:  2 },
    ];
    bladeRows.forEach(({ y, w, h, stipeOff }) => {
      const sx = mid + stipeOff;
      // Left blade
      g.moveTo(sx, y)
       .lineTo(sx - w, y - h * 0.4)
       .lineTo(sx - w * 0.6, y + h)
       .closePath().fill(c);
      // Right blade
      g.moveTo(sx, y)
       .lineTo(sx + w, y - h * 0.4)
       .lineTo(sx + w * 0.6, y + h)
       .closePath().fill(c);
      // Midrib on each blade
      g.moveTo(sx, y).lineTo(sx - w * 0.75, y - h * 0.2)
       .stroke({ color: light, width: 1, alpha: 0.6 });
      g.moveTo(sx, y).lineTo(sx + w * 0.75, y - h * 0.2)
       .stroke({ color: light, width: 1, alpha: 0.6 });
    });
    // Float bladders — small ovals at blade attachment points
    bladeRows.forEach(({ y, stipeOff }) => {
      g.circle(mid + stipeOff, y, 3.5).fill(light);
    });
  }

  // ── Twilight Brain Coral — glowing dome with labyrinthine grooves ─────────
  _drawTwilightBrain(g, s, c) {
    const mid   = s / 2;
    const r     = s * 0.38;
    const glow  = this._lighten(c, 0.6);
    const dark  = this._darken(c, 0.35);
    // Outer glow halo
    g.circle(mid, s * 0.56, r + 5).fill({ color: c, alpha: 0.18 });
    g.circle(mid, s * 0.56, r).fill(dark);
    // Bioluminescent grooves radiating from center
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const x1 = mid + Math.cos(angle) * r * 0.3;
      const y1 = s * 0.56 + Math.sin(angle) * r * 0.3;
      const x2 = mid + Math.cos(angle) * r * 0.88;
      const y2 = s * 0.56 + Math.sin(angle) * r * 0.88;
      g.moveTo(x1, y1).lineTo(x2, y2).stroke({ color: glow, width: 1.5, alpha: 0.9 });
    }
    g.circle(mid, s * 0.56, r * 0.18).fill(glow);
  }

  // ── Phantom Polyp — translucent tall column with glowing tips ─────────────
  _drawPhantomPolyp(g, s, c) {
    const mid   = s / 2;
    const glow  = this._lighten(c, 0.55);
    const dark  = this._darken(c, 0.2);
    const cols  = [s * 0.28, s * 0.5, s * 0.72];
    const tops  = [s * 0.18, s * 0.08, s * 0.14];
    cols.forEach((cx, i) => {
      const top = tops[i];
      const h   = s - top - 4;
      g.roundRect(cx - 5, top, 10, h, 5).fill({ color: dark, alpha: 0.7 });
      // Glow vein running up center
      g.moveTo(cx, top + h * 0.7).lineTo(cx, top + 4)
       .stroke({ color: glow, width: 1.5, alpha: 0.8 });
      // Glowing tip
      g.circle(cx, top, 5).fill({ color: glow, alpha: 0.9 });
      g.circle(cx, top, 3).fill(0xffffff);
    });
  }

  // ── Midnight Table Coral — dark shelf with bioluminescent edge trim ────────
  _drawMidnightTable(g, s, c) {
    const mid  = s / 2;
    const dark = this._darken(c, 0.4);
    const glow = this._lighten(c, 0.6);
    // Stalk
    g.roundRect(mid - 5, s * 0.42, 10, s * 0.5, 4).fill(dark);
    // Table surface — very dark
    g.roundRect(s * 0.08, s * 0.26, s * 0.84, s * 0.16, 6).fill(dark);
    // Glowing edge outline
    g.roundRect(s * 0.08, s * 0.26, s * 0.84, s * 0.16, 6)
     .stroke({ color: glow, width: 2, alpha: 0.85 });
    // Bioluminescent dots on the surface
    for (let i = 0; i < 5; i++) {
      g.circle(s * 0.18 + i * s * 0.16, s * 0.34, 2.5).fill(glow);
    }
    // Hanging tendrils under the shelf
    for (let i = 0; i < 4; i++) {
      const tx = s * 0.2 + i * s * 0.2;
      g.moveTo(tx, s * 0.42).lineTo(tx + (i % 2 ? 2 : -2), s * 0.52)
       .stroke({ color: glow, width: 1.5, alpha: 0.7, cap: 'round' });
    }
  }

  // ── Abyssal Fan — glowing sea fan of curved ribs ──────────────────────────
  _drawAbyssalFan(g, s, c) {
    const mid = s / 2;
    const base = s * 0.9;
    const glow = this._lighten(c, 0.55);
    g.circle(mid, base, s * 0.42).fill({ color: c, alpha: 0.12 });   // halo
    for (let i = -3; i <= 3; i++) {
      const ang = Math.PI * 0.5 + i * 0.24;
      const len = s * (0.5 - Math.abs(i) * 0.04);
      const tx  = mid + Math.cos(Math.PI - ang) * len;
      const ty  = base - Math.sin(ang) * len;
      g.moveTo(mid, base).lineTo(tx, ty)
       .stroke({ color: i % 2 === 0 ? c : glow, width: 2.5, cap: 'round' });
      g.circle(tx, ty, 2.4).fill(glow);   // glowing tip polyp
    }
    g.circle(mid, base, 5).fill(this._darken(c, 0.3));
  }

  // ── Lantern Coral — tall stalk hung with luminous bulbs ───────────────────
  _drawLanternCoral(g, s, c) {
    const mid  = s / 2;
    const dark = this._darken(c, 0.35);
    const glow = this._lighten(c, 0.6);
    g.roundRect(mid - 4, s * 0.1, 8, s * 0.82, 4).fill(dark);   // stalk
    const bulbs = [[mid - 9, 0.3], [mid + 9, 0.45], [mid - 8, 0.6], [mid + 7, 0.74]];
    bulbs.forEach(([bx, fy]) => {
      g.moveTo(mid, s * fy - 4).lineTo(bx, s * fy).stroke({ color: dark, width: 1.5 });
      g.circle(bx, s * fy + 4, 5).fill({ color: c, alpha: 0.9 });
      g.circle(bx, s * fy + 4, 2.4).fill(glow);
    });
    g.circle(mid, s * 0.1, 4).fill(glow);   // crown light
  }

  // ── Wisp Coral — low cluster of wispy luminous tendrils ───────────────────
  _drawWispCoral(g, s, c) {
    const dark = this._darken(c, 0.2);
    const glow = this._lighten(c, 0.6);
    const base = s * 0.92;
    const stalks = [0.28, 0.42, 0.56, 0.7];
    stalks.forEach((fx, i) => {
      const x   = s * fx;
      const h   = s * (0.4 + (i % 2) * 0.16);
      const sway = (i % 2 ? 1 : -1) * s * 0.08;
      g.moveTo(x, base)
       .lineTo(x + sway * 0.5, base - h * 0.5)
       .lineTo(x + sway, base - h)
       .stroke({ color: i % 2 ? c : dark, width: 2, cap: 'round' });
      g.circle(x + sway, base - h, 3).fill({ color: glow, alpha: 0.9 });
      g.circle(x + sway, base - h, 1.4).fill(0xffffff);
    });
    g.circle(s * 0.5, base, s * 0.14).fill({ color: c, alpha: 0.15 });
  }

  // ── Generic fallback ──────────────────────────────────────────────────────
  _drawGeneric(g, s, c) {
    g.roundRect(s * 0.2, s * 0.2, s * 0.6, s * 0.6, 8).fill(c);
  }

  // ── Helper: darken a hex color ────────────────────────────────────────────
  _darken(hex, amount) {
    const r = Math.floor(((hex >> 16) & 0xff) * (1 - amount));
    const g = Math.floor(((hex >> 8)  & 0xff) * (1 - amount));
    const b = Math.floor((hex & 0xff) * (1 - amount));
    return (r << 16) | (g << 8) | b;
  }

  // ── Helper: lighten a hex color ────────────────────────────────────────────
  _lighten(hex, amount) {
    const r = Math.min(255, Math.floor(((hex >> 16) & 0xff) + (255 - ((hex >> 16) & 0xff)) * amount));
    const g = Math.min(255, Math.floor(((hex >> 8)  & 0xff) + (255 - ((hex >> 8)  & 0xff)) * amount));
    const b = Math.min(255, Math.floor((hex & 0xff)          + (255 - (hex & 0xff))          * amount));
    return (r << 16) | (g << 8) | b;
  }

  // ── Event pass exclusives ──────────────────────────────────────────────────

  /**
   * Pearl Organ Pipe — a cluster of tall ivory tubes with iridescent nacre tips
   * and small star-shaped polyps at each opening.
   */
  _drawPearlOrganPipe(g, s, c) {
    const w = s * 0.45;
    const h = s * 0.9;
    // Tube layout: 5 tubes of varying heights in a tight cluster
    const tubes = [
      { ox: -w * 0.58, h: h * 0.72, r: w * 0.22 },
      { ox: -w * 0.22, h: h * 0.92, r: w * 0.25 },
      { ox:  w * 0.15, h: h * 1.0,  r: w * 0.28 },
      { ox:  w * 0.50, h: h * 0.80, r: w * 0.22 },
      { ox:  w * 0.82, h: h * 0.62, r: w * 0.20 },
    ];

    // Draw tube bodies
    tubes.forEach(({ ox, h: th, r }) => {
      // Tube wall (rounded rect)
      g.roundRect(ox - r, -th, r * 2, th, r * 0.9)
       .fill({ color: c, alpha: 0.95 });
      // Inner shadow / hollow depth
      g.roundRect(ox - r * 0.55, -th + r * 0.5, r * 1.1, th - r * 0.6, r * 0.5)
       .fill({ color: 0x8a7060, alpha: 0.35 });
      // Tube ridge lines (longitudinal)
      for (let ridgeX = -r * 0.4; ridgeX <= r * 0.4; ridgeX += r * 0.4) {
        g.rect(ox + ridgeX, -th + 4, 1.5, th - 8)
         .fill({ color: 0xffffff, alpha: 0.18 });
      }
    });

    // Draw nacre / iridescent rim at each tube opening
    tubes.forEach(({ ox, h: th, r }) => {
      g.circle(ox, -th, r * 1.05)
       .fill({ color: 0xd4c5b0, alpha: 0.9 });
      g.circle(ox, -th, r * 0.78)
       .fill({ color: 0x8a7060, alpha: 0.8 });   // opening depth
      // Pearlescent highlight arc (top-left quadrant)
      g.poly([
        ox - r * 0.8, -th - r * 0.3,
        ox - r * 0.15, -th - r * 0.85,
        ox + r * 0.15, -th - r * 0.65,
        ox - r * 0.35, -th - r * 0.2,
      ]).fill({ color: 0xffffff, alpha: 0.45 });

      // 8-pointed polyp star
      const starPts = [];
      for (let i = 0; i < 8; i++) {
        const a    = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const rStar = i % 2 === 0 ? r * 0.55 : r * 0.28;
        starPts.push(ox + Math.cos(a) * rStar, -th + Math.sin(a) * rStar);
      }
      g.poly(starPts).fill({ color: 0xffe8d8, alpha: 0.85 });
    });

    // Encrusting base connecting the tubes
    g.roundRect(-w * 0.75, -s * 0.12, w * 1.68, s * 0.14, 4)
     .fill({ color: c, alpha: 0.75 });
    g.roundRect(-w * 0.75, -s * 0.12, w * 1.68, s * 0.14, 4)
     .stroke({ color: 0xd4c5b0, width: 1 });
  }

  // ── Helper: polygon ellipse (g.ellipse unreliable in PixiJS v8) ────────────
  _ellipsePts(cx, cy, rx, ry, steps = 18) {
    const pts = [];
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      pts.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
    }
    return pts;
  }
}
