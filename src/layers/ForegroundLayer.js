import { Container, Graphics } from 'pixi.js';
import { GRID_X, GRID_Y, GRID_W, GRID_H, COLORS } from '../constants.js';

const BUBBLE_COUNT = 22;

/**
 * ForegroundLayer — floating bubble particles that drift upward.
 * Sits in front of the grid for depth.
 */
export class ForegroundLayer {
  constructor() {
    this.container = new Container();
    this.container.interactiveChildren = false;
    this._bubbles  = [];
    this._build();
  }

  _build() {
    for (let i = 0; i < BUBBLE_COUNT; i++) {
      const r = 1.5 + Math.random() * 3;
      const g = new Graphics();
      g.circle(0, 0, r).fill({ color: COLORS.bubble_color, alpha: 0.35 });
      g.circle(-r * 0.3, -r * 0.3, r * 0.3).fill({ color: 0xffffff, alpha: 0.5 }); // specular

      const bubble = {
        gfx:   g,
        x:     GRID_X + Math.random() * GRID_W,
        y:     GRID_Y + Math.random() * GRID_H,
        r,
        speed: 0.15 + Math.random() * 0.35,
        drift: (Math.random() - 0.5) * 0.25,
        alpha: 0.15 + Math.random() * 0.4,
        phase: Math.random() * Math.PI * 2,
      };
      g.x = bubble.x;
      g.y = bubble.y;
      g.alpha = bubble.alpha;
      this._bubbles.push(bubble);
      this.container.addChild(g);
    }
  }

  update(deltaMS) {
    const dt = deltaMS / 16;
    const t  = Date.now() * 0.001;

    this._bubbles.forEach(b => {
      b.y -= b.speed * dt;
      b.x += Math.sin(t * 0.8 + b.phase) * b.drift;

      // Recycle when offscreen top
      if (b.y < GRID_Y - 10) {
        b.y = GRID_Y + GRID_H + Math.random() * 20;
        b.x = GRID_X + Math.random() * GRID_W;
      }

      b.gfx.x = b.x;
      b.gfx.y = b.y;
      b.gfx.alpha = b.alpha * (0.6 + Math.sin(t * 1.2 + b.phase) * 0.4);
    });
  }
}
