import { Container, Graphics, Text } from 'pixi.js';
import { SCREEN_W, SCREEN_H, COLORS } from '../constants.js';

const FONT = 'system-ui, -apple-system, sans-serif';
const STREAK_PIPS = 7;

/**
 * WelcomeBackModal — a receipt shown on return: idle earnings while away and
 * the daily login-streak bonus (already applied by RetentionSystem).
 */
export class WelcomeBackModal {
  constructor() {
    this.container = new Container();
    this.container.visible = false;

    this._overlay = new Graphics();
    this._panel   = new Graphics();
    this._content = new Container();
    this.container.addChild(this._overlay, this._panel, this._content);

    this._overlay.interactive = true;
    this._overlay.on('pointerdown', () => this.hide());
  }

  show(reward) {
    this._r = reward;
    this.container.visible = true;
    this._build();
  }

  hide() { this.container.visible = false; }

  // ── Private ────────────────────────────────────────────────────────────────

  _fmtAway(ms) {
    const m = Math.floor(ms / 60000);
    const h = Math.floor(m / 60);
    if (h >= 24) { const d = Math.floor(h / 24); return `${d}d ${h % 24}h`; }
    if (h > 0) return `${h}h ${m % 60}m`;
    return `${Math.max(1, m)}m`;
  }

  _build() {
    const r = this._r;
    this._overlay.clear();
    this._overlay.rect(0, 0, SCREEN_W, SCREEN_H).fill({ color: 0x000000, alpha: 0.62 });

    const pw = 320, ph = 320;
    const px = SCREEN_W / 2 - pw / 2;
    const py = SCREEN_H / 2 - ph / 2;

    this._panel.clear();
    this._panel.roundRect(px, py, pw, ph, 14).fill({ color: 0x081016, alpha: 0.98 });
    this._panel.roundRect(px, py, pw, ph, 14).stroke({ color: 0x4a7a30, width: 2 });

    this._content.removeChildren();
    const cx = px + pw / 2;

    this._text('🌅 Welcome back!', cx, py + 18, 18, 0xc8e6a0, true, 0.5);
    if (r.awayMs >= 60000) {
      this._text(`Away for ${this._fmtAway(r.awayMs)}`, cx, py + 46, 12, COLORS.text_secondary, false, 0.5);
    }

    let y = py + 78;

    if (r.offlineBE > 0 || r.offlinePolyps > 0) {
      this._text('Your reef kept working', cx, y, 11, COLORS.text_secondary, false, 0.5); y += 18;
      const parts = [];
      if (r.offlineBE > 0)     parts.push(`+${r.offlineBE} 🫧${r.offlineCapped ? ' (cap)' : ''}`);
      if (r.offlinePolyps > 0) parts.push(`+${r.offlinePolyps} 🪸`);
      this._text(parts.join('    '), cx, y, 16, COLORS.text_primary, true, 0.5); y += 36;
    }

    if (r.isNewDay) {
      this._text(`🔥 Day ${r.streakDay} streak`, cx, y, 14, 0xffd54f, true, 0.5); y += 22;
      const sp = [`+${r.streakBE} 🫧`];
      if (r.streakPolyps) sp.push(`+${r.streakPolyps} 🪸`);
      if (r.streakPearls) sp.push(`+${r.streakPearls} 💎`);
      this._text(sp.join('    '), cx, y, 15, 0xc8e6a0, true, 0.5); y += 28;

      // Streak pips — current week of consecutive days
      const filled = ((r.streakDay - 1) % STREAK_PIPS) + 1;
      const pipW = 24, gap = 8;
      const totalW = STREAK_PIPS * pipW + (STREAK_PIPS - 1) * gap;
      const startX = cx - totalW / 2;
      for (let i = 0; i < STREAK_PIPS; i++) {
        const on = i < filled;
        const pip = new Graphics();
        pip.roundRect(startX + i * (pipW + gap), y, pipW, 8, 4)
           .fill({ color: on ? 0xffb300 : 0x2a3a20, alpha: on ? 1 : 0.8 });
        this._content.addChild(pip);
      }
      y += 22;
    }

    const btn = this._button('Continue', cx - 72, py + ph - 52, 144, 40, () => this.hide());
    this._content.addChild(btn);
  }

  _button(label, bx, by, bw, bh, onClick) {
    const btn = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, bw, bh, 8).fill({ color: 0x2e6a18, alpha: 1 });
    bg.roundRect(0, 0, bw, bh, 8).stroke({ color: 0x6abf3a, width: 1.5, alpha: 0.9 });
    btn.addChild(bg);
    const t = new Text({
      text: label,
      style: { fontSize: 15, fill: 0xffffff, fontFamily: FONT, fontWeight: '700' },
    });
    t.anchor.set(0.5);
    t.x = bw / 2; t.y = bh / 2;
    btn.addChild(t);
    btn.x = bx; btn.y = by;
    btn.interactive = true;
    btn.cursor = 'pointer';
    btn.on('pointerdown', (e) => { e.stopPropagation(); onClick(); });
    return btn;
  }

  _text(str, x, y, size, fill, bold, anchorX = 0) {
    const t = new Text({
      text: str,
      style: { fontSize: size, fill, fontFamily: FONT, fontWeight: bold ? '700' : '400' },
    });
    t.anchor.set(anchorX, 0);
    t.x = x; t.y = y;
    this._content.addChild(t);
    return t;
  }
}
