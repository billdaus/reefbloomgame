import { Container, Graphics, Text } from 'pixi.js';
import { GRID_X, GRID_Y, GRID_W, GRID_H, IS_PORTRAIT } from '../constants.js';
import { LINES } from './bubblesLines.js';

const FONT     = 'system-ui, -apple-system, sans-serif';
const SPEED    = 1.8;    // px per frame
const BOB_AMP  = 3;      // idle bob amplitude px

// Where Bubbles lives when docked — relative to grid so it adapts to layout
// Desktop: aligns with the rocky outcrop dock drawn in BackgroundLayer
// Portrait: docks inside the grid near the bottom-right
const DOCK_X = GRID_X + 284;
const DOCK_Y = IS_PORTRAIT ? GRID_Y + GRID_H - 22 : GRID_Y + GRID_H + 6;

// Positions Bubbles floats to when speaking
const SPEAK_POSITIONS = [
  { x: GRID_X + 90,        y: GRID_Y + 160 },
  { x: GRID_X + GRID_W * 0.45, y: GRID_Y + 100 },
  { x: GRID_X + 130,       y: GRID_Y + GRID_H * 0.5 },
  { x: GRID_X + GRID_W * 0.3, y: GRID_Y + GRID_H * 0.35 },
];

// Scripted dialogue lives in bubblesLines.js (shared with the 3D renderer).

// ── Bubbles class ──────────────────────────────────────────────────────────
export class Bubbles {
  constructor() {
    this.container = new Container();

    this._state  = 'docked';
    this.x       = DOCK_X;
    this.y       = DOCK_Y;
    this._tX     = DOCK_X;
    this._tY     = DOCK_Y;

    this._queue        = [];
    this._speechTimer  = 0;
    this._flavorTimer  = this._nextFlavor();
    this._bobOffset    = Math.random() * Math.PI * 2;

    this._body     = new Graphics();
    this._speechC  = new Container();
    this._speechG  = new Graphics();
    this._speechTx = null;

    this._build();
  }

  // ── Visual ─────────────────────────────────────────────────────────────────

  _build() {
    const g = this._body;

    // Thruster glow (back)
    g.circle(-20, 0, 5).fill({ color: 0x40c8ff, alpha: 0.7 });

    // Body shell
    g.roundRect(-18, -11, 36, 22, 11).fill(0x5090b8);

    // Body face plate
    g.roundRect(-14, -8, 28, 16, 8).fill(0x80b4d8);

    // Wing fins
    g.moveTo(-18,  -4).lineTo(-30, -9).lineTo(-30, 5).closePath().fill(0x3a6a8a);
    g.moveTo( 18,  -4).lineTo( 30, -9).lineTo( 30, 5).closePath().fill(0x3a6a8a);

    // Eye / sensor lens
    g.circle(14, 0, 7).fill(0xffd740);
    g.circle(16, -1, 4).fill(0xfffff0);
    g.circle(17, -2, 2).fill(0xffffff);

    // Antenna nub
    g.rect(-2, -15, 4, 6).fill(0x3a6a8a);
    g.circle(0, -18, 3).fill(0x40c8ff);

    this.container.addChild(this._body);

    // Speech bubble container (floats above Bubbles)
    this._speechC.visible = false;
    this._speechC.x = -110;
    this._speechC.y = -70;

    this._speechTx = new Text({
      text: '',
      style: {
        fontSize: 11,
        fill: 0xddeeff,
        fontFamily: FONT,
        wordWrap: true,
        wordWrapWidth: 210,
        lineHeight: 16,
      },
    });
    this._speechTx.x = 10;
    this._speechTx.y = 8;

    this._speechC.addChild(this._speechG);
    this._speechC.addChild(this._speechTx);
    this.container.addChild(this._speechC);

    this.container.x = this.x;
    this.container.y = this.y;
    this.container.alpha = 0.92;

    // Clickable — Bubbles sasses back
    this.container.eventMode = 'static';
    this.container.cursor = "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"32\" height=\"32\"><text y=\"28\" font-size=\"28\">🐠</text></svg>') 16 16, pointer";
    this.container.hitArea = { contains: (x, y) => Math.abs(x) < 36 && Math.abs(y) < 22 };
    this.container.on('pointertap', () => this.trigger('tapped'));
  }

  _showBubble(text) {
    this._speechTx.text = text;
    const tw = Math.min(this._speechTx.width + 20, 230);
    const th = this._speechTx.height + 16;

    const g = this._speechG;
    g.clear();
    // Bubble background
    g.roundRect(0, 0, tw, th, 8).fill({ color: 0x050d18, alpha: 0.9 });
    g.roundRect(0, 0, tw, th, 8).stroke({ color: 0x4080a8, width: 1.5, alpha: 0.9 });
    // Pointer triangle (points down-right toward Bubbles)
    g.moveTo(110, th).lineTo(122, th + 10).lineTo(134, th).closePath()
     .fill({ color: 0x050d18, alpha: 0.9 });

    this._speechC.x = -(tw / 2);
    this._speechC.visible = true;
  }

  _hideBubble() {
    this._speechC.visible = false;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Queue a scripted event line. */
  trigger(event, _data) {
    const pool = LINES[event];
    if (!pool) return;
    const line = pool[Math.floor(Math.random() * pool.length)];
    if (line) this._queue.push(line);
  }

  /** Queue an arbitrary (e.g. generated) line for Bubbles to say. */
  say(text) {
    if (text) this._queue.push(text);
  }

  /** Optional generator for idle flavor — returns a contextual comment string. */
  onGenerate = null;

  // ── Update loop ────────────────────────────────────────────────────────────

  update(deltaMS) {
    const dt = deltaMS / 16;
    const t  = Date.now() * 0.001;

    // Flavor timer — only fires when docked and idle
    if (this._state === 'docked' && this._queue.length === 0) {
      this._flavorTimer -= deltaMS;
      if (this._flavorTimer <= 0) {
        this._flavorTimer = this._nextFlavor();
        // Prefer a generated, reef-aware comment; fall back to scripted flavor
        const gen = this.onGenerate?.();
        if (gen) this._queue.push(gen);
        else this.trigger('flavor');
      }
    }

    // ── State machine ─────────────────────────────────────────────────────
    switch (this._state) {
      case 'docked':
        if (this._queue.length > 0) {
          this._state = 'floating';
          const pos = SPEAK_POSITIONS[Math.floor(Math.random() * SPEAK_POSITIONS.length)];
          this._tX = pos.x;
          this._tY = pos.y;
        }
        break;

      case 'floating':
        this._moveToward(dt);
        if (this._atTarget()) {
          this._startSpeaking(this._queue.shift());
        }
        break;

      case 'speaking':
        this._speechTimer -= deltaMS;
        if (this._speechTimer <= 0) {
          this._hideBubble();
          if (this._queue.length > 0) {
            this._startSpeaking(this._queue.shift());
          } else {
            this._state = 'returning';
            this._tX = DOCK_X;
            this._tY = DOCK_Y;
          }
        }
        break;

      case 'returning':
        this._moveToward(dt);
        if (this._atTarget()) {
          this._state = 'docked';
        }
        break;
    }

    // ── Bob animation ──────────────────────────────────────────────────────
    const bobAmp = this._state === 'docked' ? BOB_AMP * 0.5 : BOB_AMP;
    this.container.x = this.x;
    this.container.y = this.y + Math.sin(t * 1.6 + this._bobOffset) * bobAmp;

    // Subtle rotation when moving
    const moving = this._state === 'floating' || this._state === 'returning';
    const tiltTarget = moving ? (this._tY < this.y ? -0.12 : 0.08) : 0;
    this.container.rotation += (tiltTarget - this.container.rotation) * 0.05;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _startSpeaking(text) {
    if (!text) return;
    this._state = 'speaking';
    this._showBubble(text);
    // Read time: ~50ms per character, min 2.5s, max 6s
    this._speechTimer = Math.min(Math.max(text.length * 52, 2500), 6000);
  }

  _moveToward(dt) {
    const dx   = this._tX - this.x;
    const dy   = this._tY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return;
    const step = Math.min(SPEED * dt, dist);
    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
  }

  _atTarget() {
    return Math.abs(this._tX - this.x) < 3 && Math.abs(this._tY - this.y) < 3;
  }

  _nextFlavor() {
    return 45000 + Math.random() * 45000;  // 45–90 seconds
  }
}
