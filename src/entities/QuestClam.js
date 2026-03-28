import { Container, Graphics } from 'pixi.js';

/**
 * QuestClam — daily quest delivery shell.
 * States: 'available' (closed, gentle pulse)
 *         'active'    (cracked open, waiting for challenges)
 *         'complete'  (wide open, bright glow — ready to claim)
 */
export class QuestClam {
  constructor(x, y, onTap) {
    this._baseY  = y;
    this._time   = Math.random() * 1000;
    this._status = 'available';
    this._openT  = 0;    // 0 = closed, 1 = fully open
    this._targetT = 0;

    this.container = new Container();
    this._glow = new Graphics();
    this._body = new Graphics();
    this.container.addChild(this._glow);
    this.container.addChild(this._body);

    this.container.x = x;
    this.container.y = y;
    this.container.interactive = true;
    this.container.cursor = 'pointer';
    this.container.on('pointerdown', (e) => { e.stopPropagation(); onTap(); });

    this._draw();
  }

  setStatus(status) {
    this._status = status;
    this._targetT = { available: 0, active: 0.35, complete: 0.80 }[status] ?? 0;
    this._draw();
  }

  update(deltaMS) {
    this._time += deltaMS;

    // Smoothly tween the open angle
    const speed = deltaMS * 0.002;
    if (Math.abs(this._openT - this._targetT) > 0.005) {
      this._openT += (this._targetT - this._openT) * Math.min(1, speed * 4);
      this._draw();
    }

    // Vertical bob
    this.container.y = this._baseY + Math.sin(this._time * 0.0018) * 3;

    // Pulse alpha
    const pulseRate = this._status === 'complete' ? 0.005 : 0.002;
    const pulseAmp  = this._status === 'complete' ? 0.30  : 0.18;
    this.container.alpha = 0.80 + Math.sin(this._time * pulseRate) * pulseAmp;
  }

  _draw() {
    const W = 24, H = 14;
    const openA = this._openT * 0.75;  // max rotation ~43°

    this._body.clear();
    this._glow.clear();

    const isComplete = this._status === 'complete';

    // ── Outer glow (only when complete) ──────────────────────────────────────
    if (isComplete) {
      this._glow.circle(0, -H * 0.5, W * 1.5).fill({ color: 0xffe870, alpha: 0.18 });
      this._glow.circle(0, -H * 0.5, W * 1.1).fill({ color: 0xffd040, alpha: 0.22 });
    }

    const g = this._body;

    // ── Bottom shell half ────────────────────────────────────────────────────
    const botPts = [];
    for (let i = 0; i <= 18; i++) {
      const a = (i / 18) * Math.PI;
      botPts.push(-Math.cos(a) * W, Math.sin(a) * H * 0.7);
    }
    botPts.push(W, 0, -W, 0);
    g.poly(botPts).fill(0xffc870);
    // Ridges on bottom
    for (let i = -2; i <= 2; i++) {
      const a  = -Math.PI / 2 + i * 0.28;
      const ex = Math.cos(a) * W * 0.82;
      const ey = Math.abs(Math.sin(a)) * H * 0.55;
      g.moveTo(0, 0).lineTo(ex, ey).stroke({ color: 0xc4904a, width: 1, alpha: 0.5 });
    }

    // ── Top shell half (rotates open) ────────────────────────────────────────
    const topColor = isComplete ? 0xffe090 : 0xffd88a;
    const topPts   = [];
    for (let i = 0; i <= 18; i++) {
      const a  = (i / 18) * Math.PI;
      // Base direction is upward; openA rotates it open (counter-clockwise)
      const baseAngle = Math.PI + openA;
      const lx = Math.cos(baseAngle + a) * W;
      const ly = Math.sin(baseAngle + a) * H * 1.3;
      topPts.push(lx, ly);
    }
    // Close the shell to the hinge at (±W, 0)
    topPts.push(Math.cos(Math.PI + openA) * W, Math.sin(Math.PI + openA) * H * 1.3);
    topPts.push(-W, 0);
    g.poly(topPts).fill(topColor);
    // Ridges on top
    for (let i = -2; i <= 2; i++) {
      const base = Math.PI + openA;
      const a    = base + Math.PI / 2 + i * 0.28;
      const ex   = Math.cos(a) * W * 0.82;
      const ey   = Math.sin(a) * H * 1.1;
      g.moveTo(0, 0).lineTo(ex, ey).stroke({ color: 0xc4904a, width: 1, alpha: 0.5 });
    }

    // ── Pearl (visible when open) ─────────────────────────────────────────────
    if (this._openT > 0.1) {
      const pearlAlpha = Math.min(1, (this._openT - 0.1) / 0.4);
      const py = -H * 0.3 - this._openT * H * 0.5;
      const pearlColor = isComplete ? 0xffee80 : 0xfff4c0;
      g.circle(0, py, 7).fill({ color: pearlColor, alpha: pearlAlpha * 0.9 });
      g.circle(0, py, 5).fill({ color: isComplete ? 0xffd700 : 0xfffadc, alpha: pearlAlpha });
      g.circle(-1.5, py - 2, 1.8).fill({ color: 0xffffff, alpha: pearlAlpha * 0.9 });
    }

    // ── Hinge line ────────────────────────────────────────────────────────────
    g.moveTo(-W, 0).lineTo(W, 0).stroke({ color: 0xb07830, width: 1.5 });
  }
}
