import { Container, Graphics, Text } from 'pixi.js';
import { SCREEN_W, SCREEN_H, COLORS, STATION_MAX_LEVEL, stationUpgradeCost } from '../constants.js';
import { state } from '../state.js';

const FONT = 'system-ui, -apple-system, sans-serif';

/**
 * StationUpgradeModal — opens when a cleaning station is tapped. Shows its
 * level/capacity, the polyp upgrade cost, and whether a cleaner wrasse is
 * present to operate it. onUpgrade(entry) applies an upgrade.
 */
export class StationUpgradeModal {
  constructor() {
    this.container = new Container();
    this.container.visible = false;

    this._overlay = new Graphics();
    this._panel   = new Graphics();
    this._content = new Container();
    this.container.addChild(this._overlay);
    this.container.addChild(this._panel);
    this.container.addChild(this._content);

    this._overlay.interactive = true;
    this._overlay.on('pointerdown', () => this.hide());

    this._entry = null;
    this._onUpgrade = null;
  }

  show(entry, onUpgrade) {
    this._entry = entry;
    this._onUpgrade = onUpgrade;
    this.container.visible = true;
    this._build();
  }

  hide() {
    this.container.visible = false;
    this._entry = null;
  }

  _build() {
    const entry = this._entry;
    if (!entry) { this.hide(); return; }

    const level = Math.max(1, Math.min(STATION_MAX_LEVEL, entry.level ?? 1));
    const maxed = level >= STATION_MAX_LEVEL;
    const cost  = stationUpgradeCost(level);
    const affordable = state.polyps >= cost;
    const wrasse = state.fish.filter(f => f.speciesId === 'cleanerWrasse').length;

    this._overlay.clear();
    this._overlay.rect(0, 0, SCREEN_W, SCREEN_H).fill({ color: 0x000000, alpha: 0.62 });

    const pw = 330, ph = 300;
    const px = SCREEN_W / 2 - pw / 2;
    const py = SCREEN_H / 2 - ph / 2;

    this._panel.clear();
    this._panel.roundRect(px, py, pw, ph, 14).fill({ color: 0x081016, alpha: 0.98 });
    this._panel.roundRect(px, py, pw, ph, 14).stroke({ color: 0x4a7a30, width: 2 });

    this._content.removeChildren();
    const cx = px + pw / 2;

    this._text('🧽  Cleaning Station', cx, py + 16, 18, 0xc8e6a0, true, 0.5);
    this._text(`Level ${level} / ${STATION_MAX_LEVEL}`, cx, py + 44, 13, COLORS.text_secondary, false, 0.5);

    // Capacity pips
    const pipW = 22, gap = 8;
    const totalW = STATION_MAX_LEVEL * pipW + (STATION_MAX_LEVEL - 1) * gap;
    const startX = cx - totalW / 2;
    for (let i = 0; i < STATION_MAX_LEVEL; i++) {
      const filled = i < level;
      const pip = new Graphics();
      pip.roundRect(startX + i * (pipW + gap), py + 66, pipW, 8, 4)
         .fill({ color: filled ? 0x8bc34a : 0x2a3a20, alpha: filled ? 1 : 0.8 });
      this._content.addChild(pip);
    }

    // Capacity now → next (capacity == level)
    this._text('Fish cleaned at once', cx, py + 86, 11, COLORS.text_secondary, false, 0.5);
    const cap = maxed ? `${level} 🐟  (max)` : `${level} 🐟  →  ${level + 1} 🐟`;
    this._text(cap, cx, py + 104, 16, COLORS.text_primary, true, 0.5);

    // Wrasse requirement
    const wrasseMsg = wrasse > 0
      ? `Staffed by ${wrasse} cleaner wrasse ✓`
      : 'Needs a Cleaner Wrasse to operate';
    this._text(wrasseMsg, cx, py + 138, 12, wrasse > 0 ? 0x9ccc65 : 0xffb74d, false, 0.5);

    this._text(`You have ${state.polyps} 🪸`, cx, py + 162, 13, 0xc8e6a0, false, 0.5);

    if (maxed) {
      this._text('Fully upgraded', cx, py + 200, 15, COLORS.text_secondary, true, 0.5);
    } else {
      const enabled = affordable;
      const btn = this._button(`Upgrade  —  ${cost} 🪸`, cx - 120, py + 190, 240, 44, enabled, () => {
        if (!enabled) return;
        const nl = this._onUpgrade?.(this._entry);
        if (nl) this._build();
      });
      this._content.addChild(btn);
      if (!affordable) this._text('Not enough polyps', cx, py + 240, 11, 0xe08080, false, 0.5);
    }

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
}
