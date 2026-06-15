import { Container, Graphics, Text } from 'pixi.js';
import { SCREEN_W, SCREEN_H, COLORS } from '../constants.js';
import { getHarmonyAdvice, getFishOpinions } from '../systems/HarmonySystem.js';

const FONT = 'system-ui, -apple-system, sans-serif';

/**
 * HarmonyAdvisorModal — opened by the "···" beside the harmony bar. Fixed
 * header (harmony status) and Close button; the body ("How to improve" plus
 * fish opinions) scrolls via mouse wheel or drag when it overflows.
 */
export class HarmonyAdvisorModal {
  constructor() {
    this.container = new Container();
    this.container.visible = false;

    this._overlay  = new Graphics();   // tap outside to close
    this._panel    = new Graphics();
    this._panelHit = new Graphics();   // swallow taps inside the panel
    this._maskG    = new Graphics();
    this._content  = new Container();  // scrolling body
    this._viewport = new Graphics();   // transparent drag surface over the body
    this._fixed    = new Container();  // header + close + scrollbar

    this.container.addChild(this._overlay, this._panel, this._panelHit,
                            this._maskG, this._content, this._viewport, this._fixed);

    this._content.mask = this._maskG;

    this._overlay.eventMode = 'static';
    this._overlay.on('pointerdown', () => this.hide());

    this._panelHit.eventMode = 'static';
    this._panelHit.on('pointerdown', (e) => e.stopPropagation());

    // Drag-to-scroll
    this._scroll = 0;
    this._scrollMin = 0;
    this._dragging = false;
    this._viewport.eventMode = 'static';
    this._viewport.on('pointerdown', (e) => {
      e.stopPropagation();
      this._dragging = true;
      this._dragStartY = e.global.y;
      this._scrollStart = this._scroll;
    });
    this._viewport.on('globalpointermove', (e) => {
      if (this._dragging) this._setScroll(this._scrollStart + (e.global.y - this._dragStartY));
    });
    this._viewport.on('pointerup', () => { this._dragging = false; });
    this._viewport.on('pointerupoutside', () => { this._dragging = false; });

    // Wheel-to-scroll (added only while the modal is open)
    this._onWheel = (e) => {
      if (!this.container.visible) return;
      e.preventDefault();
      this._setScroll(this._scroll - e.deltaY);
    };
  }

  show() {
    this.container.visible = true;
    this._scroll = 0;
    this._build();
    window.addEventListener('wheel', this._onWheel, { passive: false });
  }

  hide() {
    this.container.visible = false;
    this._dragging = false;
    window.removeEventListener('wheel', this._onWheel);
  }

  _setScroll(v) {
    this._scroll = Math.max(this._scrollMin, Math.min(0, v));
    this._content.y = this._bodyTop + this._scroll;
    this._drawScrollbar();
  }

  _build() {
    const advice   = getHarmonyAdvice();
    const opinions = getFishOpinions();

    this._overlay.clear();
    this._overlay.rect(0, 0, SCREEN_W, SCREEN_H).fill({ color: 0x000000, alpha: 0.62 });

    const pw      = Math.min(380, SCREEN_W - 32);
    const headerH = 66;
    const footerH = 42;
    const lx      = 22;                       // left pad inside the body (content-local)

    // ── Lay out the scrolling body into _content (local coords from y=0) ──────
    this._content.removeChildren();
    let by = 0;
    this._bodyText('How to improve', lx, by, 12, 0x7fc8e0, true); by += 22;
    advice.suggestions.forEach(s => {
      const t = this._bodyWrap(`•  ${s}`, lx, by, pw - 44, 13, COLORS.text_primary);
      by += t.height + 7;
    });
    if (opinions.length) {
      by += 10;
      this._bodyText('What the fish are saying', lx, by, 12, 0x7fc8e0, true); by += 22;
      opinions.forEach(o => {
        this._bodyText(`${o.speaker}:`, lx, by, 12, 0xffd591, true);
        const q = this._bodyWrap(`“${o.text}”`, lx + 6, by + 15, pw - 50, 12, COLORS.text_secondary);
        by += 17 + q.height + 8;
      });
    }
    const bodyH = by;

    // ── Size the panel, capping height so it always fits on screen ───────────
    const maxPh    = SCREEN_H - 24;
    const viewportH = Math.min(bodyH, maxPh - headerH - footerH);
    const ph = headerH + viewportH + footerH;
    const px = SCREEN_W / 2 - pw / 2;
    const py = SCREEN_H / 2 - ph / 2;

    this._panel.clear();
    this._panel.roundRect(px, py, pw, ph, 14).fill({ color: 0x08131e, alpha: 0.98 });
    this._panel.roundRect(px, py, pw, ph, 14).stroke({ color: 0x3a6a8a, width: 2 });

    this._panelHit.clear();
    this._panelHit.roundRect(px, py, pw, ph, 14).fill({ color: 0xffffff, alpha: 0.001 });

    // ── Fixed header + close ─────────────────────────────────────────────────
    this._fixed.removeChildren();
    const cx = px + pw / 2;
    this._fixedText('🌿  Reef Harmony', cx, py + 14, 18, 0x9fe0c0, true, 0.5);
    this._fixedText(`${advice.harmony} · ${advice.status}`, cx, py + 40, 14, COLORS.text_secondary, false, 0.5);
    this._fixed.addChild(this._button('Close', cx - 44, py + ph - 34, 88, 24, () => this.hide()));

    // ── Scroll viewport (mask + drag surface) ────────────────────────────────
    const vpTop = py + headerH;
    this._bodyTop = vpTop;
    this._content.x = px;                     // body laid out from x=0 → offset by px
    this._maskG.clear();
    this._maskG.rect(px, vpTop, pw, viewportH).fill({ color: 0xffffff });
    this._viewport.clear();
    this._viewport.rect(px, vpTop, pw, viewportH).fill({ color: 0xffffff, alpha: 0.001 });

    this._scrollMin = Math.min(0, viewportH - bodyH);   // negative if it overflows
    this._vpTop = vpTop; this._vpH = viewportH; this._bodyH = bodyH; this._px = px; this._pw = pw;
    this._setScroll(0);
  }

  _drawScrollbar() {
    if (this._scrollbar) { this._scrollbar.parent?.removeChild(this._scrollbar); this._scrollbar = null; }
    if (this._bodyH <= this._vpH) return;     // nothing to scroll
    const trackH = this._vpH - 8;
    const thumbH = Math.max(24, trackH * (this._vpH / this._bodyH));
    const frac   = this._scrollMin === 0 ? 0 : this._scroll / this._scrollMin;  // 0..1
    const thumbY = this._vpTop + 4 + frac * (trackH - thumbH);
    const g = new Graphics();
    g.roundRect(this._px + this._pw - 7, thumbY, 3, thumbH, 2).fill({ color: 0x7fc8e0, alpha: 0.7 });
    this._fixed.addChild(g);
    this._scrollbar = g;
  }

  // ── helpers ──────────────────────────────────────────────────────────────
  _bodyText(str, x, y, size, fill, bold) {
    const t = new Text({ text: str, style: { fontSize: size, fill, fontFamily: FONT, fontWeight: bold ? '700' : '400' } });
    t.x = x; t.y = y;
    this._content.addChild(t);
    return t;
  }

  _bodyWrap(str, x, y, maxW, size, fill) {
    const t = new Text({ text: str, style: { fontSize: size, fill, fontFamily: FONT, wordWrap: true, wordWrapWidth: maxW, lineHeight: 17 } });
    t.x = x; t.y = y;
    this._content.addChild(t);
    return t;
  }

  _fixedText(str, x, y, size, fill, bold, anchorX = 0) {
    const t = new Text({ text: str, style: { fontSize: size, fill, fontFamily: FONT, fontWeight: bold ? '700' : '400' } });
    t.anchor.set(anchorX, 0);
    t.x = x; t.y = y;
    this._fixed.addChild(t);
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
    btn.eventMode = 'static'; btn.cursor = 'pointer';
    btn.on('pointerdown', (e) => { e.stopPropagation(); onClick(); });
    return btn;
  }
}
