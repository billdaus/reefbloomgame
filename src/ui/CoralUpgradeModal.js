import { Container, Graphics, Text } from 'pixi.js';
import { SCREEN_W, SCREEN_H, COLORS, CORAL_SPECIES, CORAL_MAX_LEVEL } from '../constants.js';
import { state } from '../state.js';
import { coralLevel, isMaxLevel, coralBEPerTick, upgradeCost } from '../systems/CoralUpgrade.js';

const FONT = 'system-ui, -apple-system, sans-serif';

/**
 * CoralUpgradeModal — opens when a placed coral is tapped. Shows its level,
 * BE/tick now vs. next level, and the Polyp cost. Spending polyps grows the
 * coral (bigger sprite, more BE). onUpgrade(entry) is called to apply it.
 */
export class CoralUpgradeModal {
  constructor() {
    this.container = new Container();
    this.container.visible = false;

    this._overlay  = new Graphics();
    this._panel    = new Graphics();
    this._content  = new Container();

    this.container.addChild(this._overlay);
    this.container.addChild(this._panel);
    this.container.addChild(this._content);

    this._overlay.interactive = true;
    this._overlay.on('pointerdown', () => this.hide());

    this._entry    = null;
    this._onUpgrade = null;
  }

  /** @param entry placedCoral entry  @param onUpgrade (entry) => newLevel|null */
  show(entry, onUpgrade) {
    this._entry     = entry;
    this._onUpgrade = onUpgrade;
    this.container.visible = true;
    this._build();
  }

  hide() {
    this.container.visible = false;
    this._entry = null;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _build() {
    const entry = this._entry;
    const spec  = entry ? CORAL_SPECIES[entry.speciesId] : null;
    if (!spec) { this.hide(); return; }

    const level = coralLevel(entry);
    const maxed = isMaxLevel(entry);
    const cost  = upgradeCost(level);
    const beNow = coralBEPerTick(spec, level);
    const beNext = coralBEPerTick(spec, level + 1);
    const affordable = state.polyps >= cost;

    this._overlay.clear();
    this._overlay.rect(0, 0, SCREEN_W, SCREEN_H).fill({ color: 0x000000, alpha: 0.62 });

    const pw = 320, ph = 286;
    const px = SCREEN_W / 2 - pw / 2;
    const py = SCREEN_H / 2 - ph / 2;

    this._panel.clear();
    this._panel.roundRect(px, py, pw, ph, 14).fill({ color: 0x081016, alpha: 0.98 });
    this._panel.roundRect(px, py, pw, ph, 14).stroke({ color: 0x4a7a30, width: 2 });

    this._content.removeChildren();
    const cx = px + pw / 2;

    this._text(`🪸 ${spec.name}`, cx, py + 18, 18, 0xc8e6a0, true, 0.5);
    this._text(`Level ${level} / ${CORAL_MAX_LEVEL}`, cx, py + 46, 13, COLORS.text_secondary, false, 0.5);

    // Level pips
    const pipW = 22, gap = 8;
    const totalW = CORAL_MAX_LEVEL * pipW + (CORAL_MAX_LEVEL - 1) * gap;
    const startX = cx - totalW / 2;
    for (let i = 0; i < CORAL_MAX_LEVEL; i++) {
      const filled = i < level;
      const pip = new Graphics();
      pip.roundRect(startX + i * (pipW + gap), py + 70, pipW, 8, 4)
         .fill({ color: filled ? 0x8bc34a : 0x2a3a20, alpha: filled ? 1 : 0.8 });
      this._content.addChild(pip);
    }

    // Production now → next
    this._text('Bubble Essence / tick', cx, py + 92, 11, COLORS.text_secondary, false, 0.5);
    const prod = maxed
      ? `${this._fmt(beNow)} 🫧  (max)`
      : `${this._fmt(beNow)} 🫧  →  ${this._fmt(beNext)} 🫧`;
    this._text(prod, cx, py + 110, 16, COLORS.text_primary, true, 0.5);

    // Your polyps
    this._text(`You have ${state.polyps} 🪸`, cx, py + 150, 13, 0xc8e6a0, false, 0.5);

    // Upgrade button
    if (maxed) {
      this._text('Fully grown', cx, py + 196, 15, COLORS.text_secondary, true, 0.5);
    } else {
      const label = `Upgrade  —  ${cost} 🪸`;
      const enabled = affordable;
      const btn = this._button(label, cx - 120, py + 184, 240, 44, enabled, () => {
        if (!enabled) return;
        const newLevel = this._onUpgrade?.(this._entry);
        if (newLevel) this._build();   // refresh in place to show new level/cost
      });
      this._content.addChild(btn);
      if (!affordable) {
        this._text('Not enough polyps', cx, py + 232, 11, 0xe08080, false, 0.5);
      }
    }

    // Close
    const close = this._button('Close', cx - 44, py + ph - 38, 88, 26, true, () => this.hide(), true);
    this._content.addChild(close);
  }

  _button(label, bx, by, bw, bh, enabled, onClick, subtle = false) {
    const btn = new Container();
    const bg  = new Graphics();
    const baseCol = subtle ? 0x2a3a4a : 0x2e6a18;
    bg.roundRect(0, 0, bw, bh, 8).fill({ color: baseCol, alpha: enabled ? 1 : 0.35 });
    bg.roundRect(0, 0, bw, bh, 8).stroke({ color: enabled ? 0x6abf3a : 0x456, width: 1.5, alpha: 0.9 });
    btn.addChild(bg);

    const txt = new Text({
      text: label,
      style: { fontSize: subtle ? 12 : 15, fill: enabled ? 0xffffff : 0x90a0b0, fontFamily: FONT, fontWeight: '700' },
    });
    txt.anchor.set(0.5, 0.5);
    txt.x = bw / 2;
    txt.y = bh / 2;
    btn.addChild(txt);

    btn.x = bx;
    btn.y = by;
    if (enabled) {
      btn.interactive = true;
      btn.cursor = 'pointer';
      btn.on('pointerdown', (e) => { e.stopPropagation(); onClick(); });
    }
    return btn;
  }

  _text(str, x, y, size, fill, bold, anchorX = 0) {
    const t = new Text({
      text: str,
      style: { fontSize: size, fill, fontFamily: FONT, fontWeight: bold ? '700' : '400' },
    });
    t.anchor.set(anchorX, 0);
    t.x = x;
    t.y = y;
    this._content.addChild(t);
    return t;
  }

  _fmt(n) {
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }
}
