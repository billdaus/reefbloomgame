import { Graphics } from 'pixi.js';
import { TILE_SIZE, STATION_SPAN } from '../constants.js';

/**
 * CleaningStation — a 2×2 reef outcrop where cleaner wrasse service visiting
 * fish. Drawn in local space [0, SPAN*TILE_SIZE]; container origin is the
 * anchor tile's top-left. Higher levels show more coral heads and "booth"
 * markers, reflecting the station's larger cleaning capacity.
 */
export class CleaningStation {
  constructor(col, row, uid, level = 1) {
    this.col   = col;
    this.row   = row;
    this.uid   = uid;
    this.level = level;

    this.container = new Graphics();
    this._draw();
  }

  setLevel(level) {
    this.level = level;
    this._draw();
  }

  _draw() {
    const g = this.container;
    const S = TILE_SIZE * STATION_SPAN;   // full footprint size
    g.clear();

    // Sandy cleared patch
    g.roundRect(S * 0.06, S * 0.12, S * 0.88, S * 0.82, 12).fill({ color: 0xdcc79a, alpha: 0.55 });

    // Rocky base mound
    g.roundRect(S * 0.14, S * 0.46, S * 0.72, S * 0.42, 14).fill(0x5f7d80);
    g.circle(S * 0.5, S * 0.5, S * 0.26).fill(0x7fa6aa);
    g.circle(S * 0.3, S * 0.6, S * 0.16).fill(0x7fa6aa);
    g.circle(S * 0.7, S * 0.6, S * 0.17).fill(0x7fa6aa);

    // Coral heads on top — one per capacity level (the "cleaning booths")
    const heads = Math.max(1, this.level);
    for (let i = 0; i < heads; i++) {
      const a  = -Math.PI / 2 + (i - (heads - 1) / 2) * 0.5;
      const hx = S * 0.5 + Math.cos(a) * S * 0.26;
      const hy = S * 0.42 + Math.sin(a) * S * 0.16;
      g.circle(hx, hy, 6).fill(0x8ad1d8);
      g.circle(hx, hy, 3).fill(0xd6f4f7);
    }

    // A resident cleaner shrimp + activity sparkles
    this._cleanerShrimp(g, S * 0.42, S * 0.5, 1, 0xff7043);
    this._cleanerShrimp(g, S * 0.62, S * 0.54, -1, 0xff7043);
    [[0.5, 0.3], [0.34, 0.4], [0.7, 0.42]].forEach(([fx, fy]) => {
      g.circle(S * fx, S * fy, 1.8).fill({ color: 0xfff3b0, alpha: 0.9 });
    });

    // Footprint outline so the 2×2 extent reads clearly
    g.roundRect(2, 2, S - 4, S - 4, 12).stroke({ color: 0x8ad1d8, width: 1.5, alpha: 0.4 });
  }

  _cleanerShrimp(g, x, y, dir, ac) {
    g.moveTo(x, y).lineTo(x + 7 * dir, y - 2).stroke({ color: 0xfdf3e7, width: 3, cap: 'round' });
    g.moveTo(x + 7 * dir, y - 2).lineTo(x + 10 * dir, y).stroke({ color: 0xfdf3e7, width: 2.5, cap: 'round' });
    g.circle(x + 4 * dir, y - 1, 1.5).fill(ac);
    g.moveTo(x, y).lineTo(x - 4 * dir, y - 6).stroke({ color: 0xffffff, width: 0.8, alpha: 0.8 });
  }
}
