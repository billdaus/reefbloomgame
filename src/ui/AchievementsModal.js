import { Container, Graphics, Text } from 'pixi.js';
import { SCREEN_W, SCREEN_H, COLORS, IS_PORTRAIT } from '../constants.js';
import { ACHIEVEMENTS, isUnlocked, achievementCounts } from '../systems/AchievementSystem.js';

const FONT = 'system-ui, -apple-system, sans-serif';
const ROW_H = 44;

/** AchievementsModal — scrollable list of milestones, locked & unlocked. */
export class AchievementsModal {
  constructor() {
    this.container = new Container();
    this.container.visible = false;

    this._overlay = new Graphics();
    this._panel   = new Graphics();
    this._content = new Container();
    this._list    = new Container();
    this.container.addChild(this._overlay, this._panel, this._content, this._list);

    this._overlay.interactive = true;
    this._overlay.on('pointerdown', () => this.hide());

    this._scrollY = 0;
  }

  show() { this.container.visible = true; this._scrollY = 0; this._build(); }
  hide() { this.container.visible = false; }

  _build() {
    const pw = Math.min(360, SCREEN_W - 24);
    const ph = Math.min(440, SCREEN_H - 60);
    const px = SCREEN_W / 2 - pw / 2;
    const py = SCREEN_H / 2 - ph / 2;

    this._overlay.clear();
    this._overlay.rect(0, 0, SCREEN_W, SCREEN_H).fill({ color: 0x000000, alpha: 0.62 });

    this._panel.clear();
    this._panel.roundRect(px, py, pw, ph, 14).fill({ color: 0x081016, alpha: 0.98 });
    this._panel.roundRect(px, py, pw, ph, 14).stroke({ color: 0x4a7a30, width: 2 });

    this._content.removeChildren();
    this._list.removeChildren();
    const cx = px + pw / 2;

    const { unlocked, total } = achievementCounts();
    this._text(this._content, '🏆 Achievements', cx, py + 16, 18, 0xc8e6a0, true, 0.5);
    this._text(this._content, `${unlocked} / ${total} unlocked`, cx, py + 42, 12, COLORS.text_secondary, false, 0.5);

    // Rows (clipped to the list area)
    const listTop = py + 66;
    const listH   = ph - 66 - 44;
    let y = 0;
    for (const a of ACHIEVEMENTS) {
      const done = isUnlocked(a.id);
      const row = new Graphics();
      row.roundRect(px + 12, listTop + y, pw - 24, ROW_H - 6, 8)
         .fill({ color: done ? 0x14301a : 0x10202c, alpha: 0.9 });
      if (done) row.roundRect(px + 12, listTop + y, pw - 24, ROW_H - 6, 8).stroke({ color: 0x6abf3a, width: 1.2, alpha: 0.8 });
      this._list.addChild(row);

      this._text(this._list, (done ? '🏆 ' : '🔒 ') + a.name, px + 24, listTop + y + 6, 13, done ? 0xc8e6a0 : COLORS.text_secondary, true, 0);
      this._text(this._list, a.desc, px + 24, listTop + y + 23, 10, COLORS.text_secondary, false, 0);
      const rw = a.reward;
      const rtxt = rw.be ? `${rw.be} 🫧` : rw.polyps ? `${rw.polyps} 🪸` : rw.pearls ? `${rw.pearls} 💎` : '';
      this._text(this._list, rtxt, px + pw - 24, listTop + y + 14, 11, done ? 0x90a0b0 : 0xc8e6a0, false, 1);
      y += ROW_H;
    }

    // Simple clip mask for the list
    const mask = new Graphics();
    mask.rect(px + 8, listTop, pw - 16, listH).fill(0xffffff);
    this._list.addChild(mask);
    this._list.mask = mask;
    this._listTop = listTop;
    this._listH = listH;
    this._listContentH = y;
    this._list.y = 0;

    this._list.interactive = true;
    this._list.on('wheel', (e) => this._scroll(e.deltaY));

    const close = this._button('Close', cx - 44, py + ph - 34, 88, 24, () => this.hide());
    this._content.addChild(close);
  }

  _scroll(dy) {
    const max = Math.max(0, this._listContentH - this._listH);
    this._scrollY = Math.max(-max, Math.min(0, this._scrollY - dy * 0.5));
    // shift only the row graphics/text (children before the mask)
    for (const c of this._list.children) {
      if (c !== this._list.mask) c.y = this._scrollY;
    }
  }

  _button(label, bx, by, bw, bh, onClick) {
    const btn = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, bw, bh, 8).fill({ color: 0x2a3a4a, alpha: 1 });
    bg.roundRect(0, 0, bw, bh, 8).stroke({ color: 0x456, width: 1.5, alpha: 0.9 });
    btn.addChild(bg);
    const t = new Text({ text: label, style: { fontSize: 12, fill: 0xffffff, fontFamily: FONT, fontWeight: '700' } });
    t.anchor.set(0.5); t.x = bw / 2; t.y = bh / 2;
    btn.addChild(t);
    btn.x = bx; btn.y = by;
    btn.interactive = true; btn.cursor = 'pointer';
    btn.on('pointerdown', (e) => { e.stopPropagation(); onClick(); });
    return btn;
  }

  _text(parent, str, x, y, size, fill, bold, anchorX = 0) {
    const t = new Text({ text: str, style: { fontSize: size, fill, fontFamily: FONT, fontWeight: bold ? '700' : '400' } });
    t.anchor.set(anchorX, 0);
    t.x = x; t.y = y;
    parent.addChild(t);
    return t;
  }
}
