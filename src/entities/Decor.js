import { Graphics } from 'pixi.js';
import { TILE_SIZE } from '../constants.js';

/**
 * Decor — static, purely aesthetic props placed on the grid.
 * No BE generation, no animation. Container origin is the tile's top-left.
 */
export class Decor {
  constructor(speciesData, col, row, uid) {
    this.spec = speciesData;
    this.col  = col;
    this.row  = row;
    this.uid  = uid;

    this.container = new Graphics();
    this._draw();
  }

  _draw() {
    const g = this.container;
    const s = TILE_SIZE;
    g.clear();

    switch (this.spec.kind) {
      case 'pebble':    this._drawPebble(g, s);    break;
      case 'conch':     this._drawConch(g, s);     break;
      case 'driftwood': this._drawDriftwood(g, s); break;
      case 'chest':     this._drawChest(g, s);     break;
      case 'oysters':   this._drawOysters(g, s);   break;
      case 'anchor':    this._drawAnchor(g, s);    break;
      case 'orb':       this._drawOrb(g, s);       break;
      case 'fossil':    this._drawFossil(g, s);    break;
      case 'cairn':     this._drawCairn(g, s);     break;
      default:          this._drawPebble(g, s);    break;
    }
  }

  // ── Pebble — small rounded stone with shadow ───────────────────────────────
  _drawPebble(g, s) {
    const c  = this.spec.color;
    const a  = this.spec.accentColor;
    const cx = s / 2;
    const cy = s * 0.74;
    // ground shadow
    g.ellipse(cx, s - 3, s * 0.30, 2.5).fill({ color: 0x000000, alpha: 0.30 });
    // main rock
    g.ellipse(cx, cy, s * 0.28, s * 0.18).fill(c);
    // darker base
    g.ellipse(cx, cy + s * 0.06, s * 0.26, s * 0.05).fill({ color: a, alpha: 0.55 });
    // top highlight
    g.ellipse(cx - s * 0.08, cy - s * 0.05, s * 0.10, s * 0.04)
      .fill({ color: 0xffffff, alpha: 0.18 });
  }

  // ── Conch shell — coiled spiral cone ───────────────────────────────────────
  _drawConch(g, s) {
    const c  = this.spec.color;
    const a  = this.spec.accentColor;
    const cx = s / 2;
    const cy = s * 0.70;
    // shadow
    g.ellipse(cx, s - 3, s * 0.30, 2.5).fill({ color: 0x000000, alpha: 0.28 });
    // body — teardrop
    g.moveTo(cx + s * 0.32, cy + s * 0.05);
    g.bezierCurveTo(
      cx + s * 0.34, cy - s * 0.18,
      cx - s * 0.10, cy - s * 0.30,
      cx - s * 0.20, cy - s * 0.05,
    );
    g.bezierCurveTo(
      cx - s * 0.28, cy + s * 0.18,
      cx + s * 0.10, cy + s * 0.22,
      cx + s * 0.32, cy + s * 0.05,
    );
    g.fill(c);
    // pink interior lip
    g.ellipse(cx + s * 0.20, cy + s * 0.04, s * 0.12, s * 0.08)
      .fill({ color: 0xff8a98, alpha: 0.85 });
    // spiral ridge accents
    g.moveTo(cx + s * 0.10, cy - s * 0.18);
    g.quadraticCurveTo(cx, cy - s * 0.05, cx + s * 0.20, cy + s * 0.02);
    g.stroke({ color: a, width: 1.2, alpha: 0.7 });
    g.moveTo(cx, cy - s * 0.10);
    g.quadraticCurveTo(cx - s * 0.10, cy, cx - s * 0.02, cy + s * 0.10);
    g.stroke({ color: a, width: 1, alpha: 0.55 });
  }

  // ── Driftwood — weathered horizontal branch ────────────────────────────────
  _drawDriftwood(g, s) {
    const c  = this.spec.color;
    const a  = this.spec.accentColor;
    const cy = s * 0.78;
    // shadow
    g.ellipse(s / 2, s - 3, s * 0.36, 2.5).fill({ color: 0x000000, alpha: 0.28 });
    // body — tapered log
    g.moveTo(s * 0.10, cy);
    g.bezierCurveTo(s * 0.18, cy - s * 0.10, s * 0.45, cy - s * 0.13, s * 0.78, cy - s * 0.06);
    g.bezierCurveTo(s * 0.95, cy - s * 0.01, s * 0.95, cy + s * 0.06, s * 0.78, cy + s * 0.07);
    g.bezierCurveTo(s * 0.45, cy + s * 0.10, s * 0.18, cy + s * 0.10, s * 0.10, cy);
    g.fill(c);
    // wood grain lines
    g.moveTo(s * 0.18, cy - s * 0.04);
    g.quadraticCurveTo(s * 0.46, cy - s * 0.06, s * 0.76, cy - s * 0.02);
    g.stroke({ color: a, width: 1, alpha: 0.6 });
    g.moveTo(s * 0.20, cy + s * 0.02);
    g.quadraticCurveTo(s * 0.46, cy + s * 0.04, s * 0.74, cy + s * 0.03);
    g.stroke({ color: a, width: 1, alpha: 0.45 });
    // knot
    g.circle(s * 0.36, cy - s * 0.01, 1.5).fill({ color: a, alpha: 0.8 });
  }

  // ── Treasure chest — wooden chest with gold trim ───────────────────────────
  _drawChest(g, s) {
    const c    = this.spec.color;
    const gold = this.spec.accentColor;
    const cx   = s / 2;
    const baseY = s * 0.62;
    const w  = s * 0.50;
    const h  = s * 0.26;
    const lh = s * 0.14;
    // shadow
    g.ellipse(cx, s - 3, s * 0.32, 2.5).fill({ color: 0x000000, alpha: 0.32 });
    // body
    g.rect(cx - w / 2, baseY, w, h).fill(c);
    // lid (rounded top)
    g.moveTo(cx - w / 2, baseY);
    g.lineTo(cx - w / 2, baseY - lh * 0.3);
    g.quadraticCurveTo(cx, baseY - lh * 1.4, cx + w / 2, baseY - lh * 0.3);
    g.lineTo(cx + w / 2, baseY);
    g.closePath();
    g.fill({ color: c, alpha: 1 });
    // gold bands
    g.rect(cx - w / 2, baseY - 1, w, 2).fill(gold);
    g.rect(cx - w / 2, baseY + h - 3, w, 2).fill(gold);
    g.rect(cx - 1.5, baseY - lh * 0.5, 3, h + lh * 0.5).fill(gold);
    // lock
    g.rect(cx - 2.5, baseY + h * 0.30, 5, 5).fill(gold);
    g.rect(cx - 1, baseY + h * 0.40, 2, 2).fill({ color: 0x000000, alpha: 0.6 });
    // gold gleam peeking out
    g.circle(cx - w * 0.20, baseY + h * 0.65, 1.5).fill({ color: 0xffe082, alpha: 0.9 });
    g.circle(cx + w * 0.10, baseY + h * 0.75, 1).fill({ color: 0xffe082, alpha: 0.7 });
  }

  // ── Oyster cluster — three overlapping shells ──────────────────────────────
  _drawOysters(g, s) {
    const c  = this.spec.color;
    const a  = this.spec.accentColor;
    const cx = s / 2;
    const cy = s * 0.72;
    g.ellipse(cx, s - 3, s * 0.34, 2.5).fill({ color: 0x000000, alpha: 0.28 });
    // back shell
    g.ellipse(cx + s * 0.04, cy - s * 0.10, s * 0.18, s * 0.10).fill(c);
    g.ellipse(cx + s * 0.04, cy - s * 0.10, s * 0.16, s * 0.04)
      .fill({ color: a, alpha: 0.55 });
    // left shell
    g.ellipse(cx - s * 0.16, cy + s * 0.04, s * 0.16, s * 0.09).fill(c);
    g.ellipse(cx - s * 0.16, cy + s * 0.04, s * 0.14, s * 0.03)
      .fill({ color: a, alpha: 0.55 });
    // right shell
    g.ellipse(cx + s * 0.14, cy + s * 0.06, s * 0.16, s * 0.09).fill(c);
    g.ellipse(cx + s * 0.14, cy + s * 0.06, s * 0.14, s * 0.03)
      .fill({ color: a, alpha: 0.55 });
    // ridges
    [[-0.16, 0.04], [0.04, -0.10], [0.14, 0.06]].forEach(([ox, oy]) => {
      g.moveTo(cx + s * (ox - 0.10), cy + s * (oy + 0.005));
      g.quadraticCurveTo(
        cx + s * ox, cy + s * (oy - 0.04),
        cx + s * (ox + 0.10), cy + s * (oy + 0.005),
      );
      g.stroke({ color: a, width: 0.8, alpha: 0.6 });
    });
  }

  // ── Rusty anchor — classic admiralty silhouette ────────────────────────────
  _drawAnchor(g, s) {
    const c  = this.spec.color;
    const a  = this.spec.accentColor;
    const cx = s / 2;
    const top = s * 0.36;
    const bot = s * 0.84;
    // shadow
    g.ellipse(cx, s - 3, s * 0.30, 2.5).fill({ color: 0x000000, alpha: 0.32 });
    // ring
    g.circle(cx, top, s * 0.07).stroke({ color: c, width: 2 });
    // shaft
    g.rect(cx - 1.5, top + s * 0.05, 3, bot - top - s * 0.10).fill(c);
    // crossbar
    g.rect(cx - s * 0.16, top + s * 0.10, s * 0.32, 2.5).fill(c);
    // bottom curve (flukes)
    g.moveTo(cx - s * 0.22, bot - s * 0.05);
    g.quadraticCurveTo(cx, bot, cx + s * 0.22, bot - s * 0.05);
    g.stroke({ color: c, width: 3, cap: 'round' });
    // fluke tips
    g.moveTo(cx - s * 0.22, bot - s * 0.05);
    g.lineTo(cx - s * 0.27, bot - s * 0.13);
    g.stroke({ color: c, width: 2.5, cap: 'round' });
    g.moveTo(cx + s * 0.22, bot - s * 0.05);
    g.lineTo(cx + s * 0.27, bot - s * 0.13);
    g.stroke({ color: c, width: 2.5, cap: 'round' });
    // rust streaks
    g.rect(cx - 1, top + s * 0.18, 1, 6).fill({ color: a, alpha: 0.7 });
    g.rect(cx + 0.5, top + s * 0.30, 1, 5).fill({ color: a, alpha: 0.6 });
  }

  // ── Glow orb — small bioluminescent rock ───────────────────────────────────
  _drawOrb(g, s) {
    const c    = this.spec.color;
    const glow = this.spec.accentColor;
    const cx   = s / 2;
    const cy   = s * 0.72;
    // outer glow halo
    g.circle(cx, cy, s * 0.30).fill({ color: glow, alpha: 0.10 });
    g.circle(cx, cy, s * 0.20).fill({ color: glow, alpha: 0.18 });
    // base rock
    g.ellipse(cx, cy + s * 0.04, s * 0.22, s * 0.10).fill(c);
    // glowing core
    g.circle(cx, cy, s * 0.10).fill({ color: glow, alpha: 0.85 });
    g.circle(cx - s * 0.025, cy - s * 0.025, s * 0.04)
      .fill({ color: 0xffffff, alpha: 0.9 });
    // micro motes
    g.circle(cx + s * 0.16, cy - s * 0.05, 1).fill({ color: glow, alpha: 0.7 });
    g.circle(cx - s * 0.18, cy + s * 0.02, 0.8).fill({ color: glow, alpha: 0.55 });
  }

  // ── Fossil ammonite — coiled spiral fossil ─────────────────────────────────
  _drawFossil(g, s) {
    const c  = this.spec.color;
    const a  = this.spec.accentColor;
    const cx = s / 2;
    const cy = s * 0.70;
    g.ellipse(cx, s - 3, s * 0.30, 2.5).fill({ color: 0x000000, alpha: 0.32 });
    // disc
    g.circle(cx, cy, s * 0.22).fill(c);
    g.circle(cx, cy, s * 0.22).stroke({ color: a, width: 1.2, alpha: 0.9 });
    // spiral ridges
    const rings = [0.18, 0.14, 0.10, 0.06];
    rings.forEach(r => {
      g.circle(cx, cy, s * r).stroke({ color: a, width: 0.8, alpha: 0.7 });
    });
    // radial septae
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const x1  = cx + Math.cos(ang) * s * 0.06;
      const y1  = cy + Math.sin(ang) * s * 0.06;
      const x2  = cx + Math.cos(ang) * s * 0.20;
      const y2  = cy + Math.sin(ang) * s * 0.20;
      g.moveTo(x1, y1).lineTo(x2, y2);
      g.stroke({ color: a, width: 0.6, alpha: 0.5 });
    }
    // central pip
    g.circle(cx, cy, s * 0.025).fill({ color: a, alpha: 0.9 });
  }

  // ── Abyss cairn — stacked dark stones ──────────────────────────────────────
  _drawCairn(g, s) {
    const c  = this.spec.color;
    const a  = this.spec.accentColor;
    const cx = s / 2;
    g.ellipse(cx, s - 3, s * 0.32, 2.5).fill({ color: 0x000000, alpha: 0.40 });
    // base stone
    g.ellipse(cx, s * 0.84, s * 0.28, s * 0.10).fill(c);
    g.ellipse(cx, s * 0.88, s * 0.26, s * 0.04).fill({ color: a, alpha: 0.7 });
    // middle stone
    g.ellipse(cx + s * 0.02, s * 0.66, s * 0.22, s * 0.09).fill(c);
    g.ellipse(cx + s * 0.02, s * 0.70, s * 0.20, s * 0.03).fill({ color: a, alpha: 0.6 });
    // top stone
    g.ellipse(cx - s * 0.02, s * 0.50, s * 0.16, s * 0.08).fill(c);
    g.ellipse(cx - s * 0.02, s * 0.53, s * 0.14, s * 0.025).fill({ color: a, alpha: 0.55 });
    // top highlight
    g.ellipse(cx - s * 0.06, s * 0.47, s * 0.05, s * 0.015)
      .fill({ color: 0xffffff, alpha: 0.10 });
  }
}
