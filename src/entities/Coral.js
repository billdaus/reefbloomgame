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
      case 'staghorn':   this._drawStaghorn(g, s, c);   break;
      case 'finger':     this._drawFinger(g, s, c);     break;
      case 'brain':      this._drawBrain(g, s, c);      break;
      case 'lettuce':    this._drawLettuce(g, s, c);    break;
      case 'star':       this._drawStar(g, s, c);       break;
      case 'bubble':     this._drawBubble(g, s, c);     break;
      case 'candycane':  this._drawCandyCane(g, s, c);  break;
      case 'toadstool':  this._drawToadstool(g, s, c);  break;
      case 'elkhorn':    this._drawElkhorn(g, s, c);    break;
      case 'pillar':     this._drawPillar(g, s, c);     break;
      default:           this._drawGeneric(g, s, c);    break;
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
