import { Container, Graphics, Text } from 'pixi.js';
import { SCREEN_W, SCREEN_H, COLORS } from '../constants.js';
import { getHarmonyAdvice, getFishOpinions } from '../systems/HarmonySystem.js';

const FONT = 'system-ui, -apple-system, sans-serif';

/**
 * HarmonyAdvisorModal — opened by the "···" beside the harmony bar. Shows the
 * current harmony status, actionable suggestions for raising it, and a few
 * in-character fish opinions about the reef.
 */
export class HarmonyAdvisorModal {
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
  }

  show() {
    this.container.visible = true;
    this._build();
  }

  hide() {
    this.container.visible = false;
  }

  _build() {
    const advice   = getHarmonyAdvice();
    const opinions = getFishOpinions();

    this._overlay.clear();
    this._overlay.rect(0, 0, SCREEN_W, SCREEN_H).fill({ color: 0x000000, alpha: 0.62 });

    const pw = Math.min(380, SCREEN_W - 32);
    const lineH = 20;
    const ph = 150 + advice.suggestions.length * lineH + (opinions.length ? 34 + opinions.length * 30 : 0);
    const px = SCREEN_W / 2 - pw / 2;
    const py = SCREEN_H / 2 - ph / 2;

    this._panel.clear();
    this._panel.roundRect(px, py, pw, ph, 14).fill({ color: 0x08131e, alpha: 0.98 });
    this._panel.roundRect(px, py, pw, ph, 14).stroke({ color: 0x3a6a8a, width: 2 });

    this._content.removeChildren();
    const cx = px + pw / 2;
    const lx = px + 22;
    let y = py + 16;

    this._text('🌿  Reef Harmony', cx, y, 18, 0x9fe0c0, true, 0.5); y += 28;
    this._text(`${advice.harmony} · ${advice.status}`, cx, y, 14, COLORS.text_secondary, false, 0.5); y += 30;

    this._text('How to improve', lx, y, 12, 0x7fc8e0, true); y += 22;
    advice.suggestions.forEach(s => {
      this._wrap(`•  ${s}`, lx, y, pw - 44, 13, COLORS.text_primary);
      y += lineH * this._lineCount(`•  ${s}`, pw - 44, 13);
    });

    if (opinions.length) {
      y += 12;
      this._text('What the fish are saying', lx, y, 12, 0x7fc8e0, true); y += 22;
      opinions.forEach(o => {
        this._text(`${o.speaker}:`, lx, y, 12, 0xffd591, true);
        this._wrap(`“${o.text}”`, lx + 4, y + 14, pw - 48, 12, COLORS.text_secondary);
        y += 30;
      });
    }

    const close = this._button('Close', cx - 44, py + ph - 34, 88, 24, () => this.hide());
    this._content.addChild(close);
  }

  // crude word count → line estimate for spacing
  _lineCount(str, maxW, size) {
    const approx = Math.max(1, Math.ceil((str.length * size * 0.52) / maxW));
    return approx;
  }

  _wrap(str, x, y, maxW, size, fill) {
    const t = new Text({
      text: str,
      style: { fontSize: size, fill, fontFamily: FONT, wordWrap: true, wordWrapWidth: maxW, lineHeight: 17 },
    });
    t.x = x; t.y = y;
    this._content.addChild(t);
    return t;
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

  _button(label, bx, by, bw, bh, onClick) {
    const btn = new Container();
    const bg  = new Graphics();
    bg.roundRect(0, 0, bw, bh, 8).fill({ color: 0x2a3a4a, alpha: 1 });
    bg.roundRect(0, 0, bw, bh, 8).stroke({ color: 0x4a6a8a, width: 1.5, alpha: 0.9 });
    btn.addChild(bg);
    const txt = new Text({ text: label, style: { fontSize: 12, fill: 0xffffff, fontFamily: FONT, fontWeight: '700' } });
    txt.anchor.set(0.5, 0.5); txt.x = bw / 2; txt.y = bh / 2;
    btn.addChild(txt);
    btn.x = bx; btn.y = by;
    btn.interactive = true; btn.cursor = 'pointer';
    btn.on('pointerdown', (e) => { e.stopPropagation(); onClick(); });
    return btn;
  }
}
