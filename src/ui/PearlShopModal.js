import { Container, Graphics, Text } from 'pixi.js';
import { SCREEN_W, SCREEN_H, COLORS } from '../constants.js';
import { state } from '../state.js';

const FONT = 'system-ui, -apple-system, sans-serif';

// TODO: replace _grantPearls with a real IAP flow (Stripe, Apple/Google IAP)
const PACKS = [
  { label: 'Small',  pearls: 10,  price: '$0.99' },
  { label: 'Medium', pearls: 35,  price: '$2.99' },
  { label: 'Large',  pearls: 60,  price: '$4.99' },
];

/**
 * PearlShopModal — shows IAP packs for purchasing pearls.
 *
 * Currently stubs the purchase: clicking buy adds pearls directly.
 * Replace the pointerdown handler with a real payment SDK call in production.
 */
export class PearlShopModal {
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

  // ── Private ────────────────────────────────────────────────────────────────

  _build() {
    this._overlay.clear();
    this._overlay.rect(0, 0, SCREEN_W, SCREEN_H).fill({ color: 0x000000, alpha: 0.62 });

    const pw = 340, ph = 310;
    const px = SCREEN_W / 2 - pw / 2;
    const py = SCREEN_H / 2 - ph / 2;

    this._panel.clear();
    this._panel.roundRect(px, py, pw, ph, 14).fill({ color: 0x080e18, alpha: 0.98 });
    this._panel.roundRect(px, py, pw, ph, 14).stroke({ color: COLORS.panel_border, width: 2 });

    this._content.removeChildren();
    const cx = px + pw / 2;

    const title = new Text({
      text: '💎  Pearl Shop',
      style: { fontSize: 18, fill: COLORS.selected_hl, fontFamily: FONT, fontWeight: 'bold' },
    });
    title.anchor.set(0.5, 0);
    title.x = cx;
    title.y = py + 18;
    this._content.addChild(title);

    const sub = new Text({
      text: 'Pearls unlock premium species',
      style: { fontSize: 10, fill: COLORS.text_secondary, fontFamily: FONT },
    });
    sub.anchor.set(0.5, 0);
    sub.x = cx;
    sub.y = py + 46;
    this._content.addChild(sub);

    PACKS.forEach((pack, i) => {
      this._addPackRow(pack, px + 18, py + 76 + i * 62, pw - 36, 50);
    });

    // Close button
    const closeBtn = this._makeTextBtn('✕  Close', cx - 44, py + ph - 40, 88, 28,
      COLORS.panel_border, () => this.hide());
    this._content.addChild(closeBtn);
  }

  _addPackRow(pack, bx, by, bw, bh) {
    const btn = new Container();
    const bg  = new Graphics();

    const drawBg = (hover) => {
      bg.clear();
      bg.roundRect(0, 0, bw, bh, 8)
        .fill({ color: hover ? 0x1a3a5a : 0x0d1f33, alpha: 1 });
      bg.roundRect(0, 0, bw, bh, 8)
        .stroke({ color: COLORS.panel_border, width: 1.5 });
    };
    drawBg(false);
    btn.addChild(bg);

    const pearlTxt = new Text({
      text: `💎 ${pack.pearls}`,
      style: { fontSize: 15, fill: 0xffd54f, fontFamily: FONT, fontWeight: 'bold' },
    });
    pearlTxt.x = 14;
    pearlTxt.y = (bh - pearlTxt.height) / 2;
    btn.addChild(pearlTxt);

    const labelTxt = new Text({
      text: pack.label,
      style: { fontSize: 11, fill: COLORS.text_secondary, fontFamily: FONT },
    });
    labelTxt.x = 92;
    labelTxt.y = (bh - labelTxt.height) / 2;
    btn.addChild(labelTxt);

    const priceTxt = new Text({
      text: `${pack.price}  ▶`,
      style: { fontSize: 13, fill: COLORS.text_primary, fontFamily: FONT, fontWeight: 'bold' },
    });
    priceTxt.x = bw - priceTxt.width - 14;
    priceTxt.y = (bh - priceTxt.height) / 2;
    btn.addChild(priceTxt);

    btn.x = bx;
    btn.y = by;
    btn.interactive = true;
    btn.cursor = 'pointer';
    btn.on('pointerover',  () => drawBg(true));
    btn.on('pointerout',   () => drawBg(false));
    btn.on('pointerdown',  () => {
      // TODO: replace with real IAP flow
      state.pearls += pack.pearls;
      this.hide();
    });

    this._content.addChild(btn);
  }

  _makeTextBtn(label, bx, by, bw, bh, color, onClick) {
    const btn = new Container();
    const bg  = new Graphics();
    bg.roundRect(0, 0, bw, bh, 6).fill({ color, alpha: 0.35 });
    bg.roundRect(0, 0, bw, bh, 6).stroke({ color, width: 1, alpha: 0.7 });
    btn.addChild(bg);

    const txt = new Text({
      text: label,
      style: { fontSize: 10, fill: COLORS.text_secondary, fontFamily: FONT },
    });
    txt.x = (bw - txt.width) / 2;
    txt.y = (bh - txt.height) / 2;
    btn.addChild(txt);

    btn.x = bx;
    btn.y = by;
    btn.interactive = true;
    btn.cursor = 'pointer';
    btn.on('pointerdown', onClick);
    return btn;
  }
}
