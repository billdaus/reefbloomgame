import { Graphics } from 'pixi.js';
import { TILE_SIZE } from '../constants.js';

/**
 * Coral — draws a procedural flat/minimal sprite for each species.
 * The container origin is the tile's top-left corner.
 */
export class Coral {
  constructor(speciesData, col, row, uid) {
    this.spec   = speciesData;
    this.col    = col;
    this.row    = row;
    this.uid    = uid;

    this.container = new Graphics();
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
      case 'seagrass':     this._drawSeagrass(g, s, c);    break;
      default:             this._drawGeneric(g, s, c);     break;
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
