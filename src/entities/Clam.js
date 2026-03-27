import { Container, Graphics } from 'pixi.js';

/**
 * Clam — animated shell that spawns in the reef to offer an ad reward.
 * Pulses gently to draw the player's attention.
 */
export class Clam {
  constructor(x, y, onTap) {
    this._baseX = x;
    this._baseY = y;
    this._time  = Math.random() * 1000;  // offset so clams don't all pulse in sync

    this.container = new Container();
    this._body     = new Graphics();
    this.container.addChild(this._body);
    this.container.x = x;
    this.container.y = y;
    this.container.interactive = true;
    this.container.cursor = 'pointer';
    this.container.on('pointerdown', (e) => { e.stopPropagation(); onTap(); });

    this._draw();
  }

  _draw() {
    const g = this._body;
    const W = 20, H = 12;

    // Bottom shell half (base)
    g.roundRect(-W, 0, W * 2, H, 4).fill(0xffcc80);
    g.moveTo(-W + 3, 2).lineTo(W - 3, 2).stroke({ color: 0xd4a470, width: 1.5 });

    // Top shell half — half-ellipse via polygon
    const pts = [];
    for (let i = 0; i <= 18; i++) {
      const a = (i / 18) * Math.PI;
      pts.push(-Math.cos(a) * W, -Math.sin(a) * H * 1.4);
    }
    pts.push(W, 0, -W, 0);
    g.poly(pts).fill(0xffe0b2);

    // Radiating ridges on top shell
    for (let i = -2; i <= 2; i++) {
      const a  = Math.PI / 2 + i * 0.3;
      const ex = Math.cos(a) * W * 0.82;
      const ey = -Math.abs(Math.sin(a)) * H * 1.2;
      g.moveTo(0, 0).lineTo(ex, ey).stroke({ color: 0xd4a470, width: 1, alpha: 0.55 });
    }

    // Pearl glow (soft outer ring)
    g.circle(0, -H * 0.6, 9).fill({ color: 0xffffff, alpha: 0.22 });
    // Pearl
    g.circle(0, -H * 0.6, 5.5).fill(0xfff9e7);
    // Pearl highlight
    g.circle(-1.5, -H * 0.6 - 2, 1.8).fill({ color: 0xffffff, alpha: 0.9 });
  }

  update(deltaMS) {
    this._time += deltaMS;
    // Pulsing alpha to draw attention
    this.container.alpha = 0.72 + Math.sin(this._time * 0.003) * 0.28;
    // Gentle vertical bob
    this.container.y = this._baseY + Math.sin(this._time * 0.0018) * 3;
  }
}
