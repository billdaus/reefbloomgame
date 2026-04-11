import { Container, Graphics, Text } from 'pixi.js';
import { SCREEN_W, SCREEN_H, COLORS } from '../constants.js';

const FONT = 'system-ui, -apple-system, sans-serif';

/**
 * AccountModal — placeholder for future account / cloud-save feature.
 * Shown when the player taps the account icon in the HUD.
 */
export class AccountModal {
  constructor() {
    this.container = new Container();
    this.container.visible = false;

    this._overlay = new Graphics();
    this._panel   = new Graphics();
    this._texts   = new Container();

    this.container.addChild(this._overlay);
    this.container.addChild(this._panel);
    this.container.addChild(this._texts);

    this._overlay.interactive = true;
    this._overlay.on('pointerdown', () => this.hide());

    this._build();
  }

  show() {
    this.container.visible = true;
  }

  hide() {
    this.container.visible = false;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  _build() {
    const pw = 300, ph = 260;
    const px = SCREEN_W / 2 - pw / 2;
    const py = SCREEN_H / 2 - ph / 2;
    const cx = SCREEN_W / 2;

    // Dim overlay
    this._overlay.rect(0, 0, SCREEN_W, SCREEN_H).fill({ color: 0x000000, alpha: 0.55 });

    // Panel
    this._panel.roundRect(px, py, pw, ph, 14).fill({ color: 0x080e18, alpha: 0.97 });
    this._panel.roundRect(px, py, pw, ph, 14).stroke({ color: COLORS.panel_border, width: 2 });
    // Stop propagation so clicking the panel doesn't dismiss
    this._panel.interactive = true;
    this._panel.on('pointerdown', (e) => e.stopPropagation());

    // Icon
    const icon = new Text({
      text: '👤',
      style: { fontSize: 36, fontFamily: FONT },
    });
    icon.anchor.set(0.5, 0);
    icon.x = cx;
    icon.y = py + 24;
    this._texts.addChild(icon);

    // Title
    const title = new Text({
      text: 'Account',
      style: { fontSize: 18, fill: COLORS.text_primary, fontFamily: FONT, fontWeight: 'bold' },
    });
    title.anchor.set(0.5, 0);
    title.x = cx;
    title.y = py + 72;
    this._texts.addChild(title);

    // Coming soon badge
    const badge = new Graphics();
    badge.roundRect(cx - 60, py + 102, 120, 24, 6)
         .fill({ color: 0x1a3a5a, alpha: 0.9 });
    badge.roundRect(cx - 60, py + 102, 120, 24, 6)
         .stroke({ color: 0x3a6a9a, width: 1 });
    this._panel.addChild(badge);

    const comingSoon = new Text({
      text: 'COMING SOON',
      style: { fontSize: 10, fill: COLORS.selected_hl, fontFamily: FONT, fontWeight: '700', letterSpacing: 3 },
    });
    comingSoon.anchor.set(0.5, 0.5);
    comingSoon.x = cx;
    comingSoon.y = py + 114;
    this._texts.addChild(comingSoon);

    // Description lines
    [
      'Sign in to unlock cloud saves,',
      'leaderboards, and purchase history.',
    ].forEach((line, i) => {
      const t = new Text({
        text: line,
        style: { fontSize: 12, fill: COLORS.text_secondary, fontFamily: FONT },
      });
      t.anchor.set(0.5, 0);
      t.x = cx;
      t.y = py + 144 + i * 20;
      this._texts.addChild(t);
    });

    // Close button
    const btnW = 120, btnH = 32;
    const btnX = cx - btnW / 2;
    const btnY = py + ph - 52;

    const btnBg = new Graphics();
    const drawBtn = (hover) => {
      btnBg.clear();
      btnBg.roundRect(btnX, btnY, btnW, btnH, 8)
           .fill({ color: hover ? 0x2a4a6a : 0x142438, alpha: hover ? 1 : 0.85 });
      btnBg.roundRect(btnX, btnY, btnW, btnH, 8)
           .stroke({ color: COLORS.panel_border, width: 1 });
    };
    drawBtn(false);
    this._panel.addChild(btnBg);

    const btnLabel = new Text({
      text: 'Close',
      style: { fontSize: 13, fill: COLORS.text_secondary, fontFamily: FONT, fontWeight: '600' },
    });
    btnLabel.anchor.set(0.5, 0.5);
    btnLabel.x = cx;
    btnLabel.y = btnY + btnH / 2;
    this._texts.addChild(btnLabel);

    const btnHit = new Graphics();
    btnHit.rect(btnX, btnY, btnW, btnH).fill({ color: 0xffffff, alpha: 0 });
    btnHit.interactive = true;
    btnHit.cursor = 'pointer';
    btnHit.on('pointerover',  () => { drawBtn(true);  btnLabel.style.fill = COLORS.text_primary; });
    btnHit.on('pointerout',   () => { drawBtn(false); btnLabel.style.fill = COLORS.text_secondary; });
    btnHit.on('pointerdown',  () => this.hide());
    this._texts.addChild(btnHit);

    // Hint
    const hint = new Text({
      text: 'tap outside to close',
      style: { fontSize: 9, fill: COLORS.text_dim, fontFamily: FONT },
    });
    hint.anchor.set(0.5, 0);
    hint.x = cx;
    hint.y = py + ph - 18;
    this._texts.addChild(hint);
  }
}
