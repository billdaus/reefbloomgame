import { Container, Graphics, Text } from 'pixi.js';
import { SCREEN_W, HUD_H, IS_PORTRAIT, COLORS } from '../constants.js';
import { state } from '../state.js';

const FONT = 'system-ui, -apple-system, sans-serif';

/**
 * HUD — top bar showing BE, Harmony bar, and Level.
 */
export class HUD {
  constructor(onHome, onPearlShop) {
    this._onHome      = onHome;
    this._onPearlShop = onPearlShop;
    this.container = new Container();
    this._bg          = new Graphics();
    this._beText      = null;
    this._pearlText   = null;
    this._bonusText   = null;
    this._bonusTimer  = 0;
    this._harmonyBar  = new Graphics();
    this._harmonyText = null;
    this._levelText   = null;
    this._lvlUpBanner = null;
    this._lvlUpTimer  = 0;

    this._build();
  }

  _build() {
    const g = this._bg;
    g.rect(0, 0, SCREEN_W, HUD_H).fill({ color: COLORS.hud_bg, alpha: 0.92 });
    // thin bottom border
    g.rect(0, HUD_H - 1, SCREEN_W, 1).fill({ color: COLORS.panel_border, alpha: 1 });
    this.container.addChild(g);

    // ── BE section ──────────────────────────────────────────────────────────
    const beLabel = new Text({ text: '🫧', style: { fontSize: 22, fill: COLORS.be_icon } });
    beLabel.x = 18;
    beLabel.y = HUD_H / 2 - 14;
    this.container.addChild(beLabel);

    this._beText = new Text({
      text: String(state.be),
      style: { fontSize: 22, fill: COLORS.text_primary, fontFamily: FONT, fontWeight: 'bold' },
    });
    this._beText.x = 48;
    this._beText.y = HUD_H / 2 - 14;
    this.container.addChild(this._beText);

    // Bonus flash label
    this._bonusText = new Text({
      text: '',
      style: { fontSize: 13, fill: COLORS.be_icon, fontFamily: FONT },
    });
    this._bonusText.x = 48;
    this._bonusText.y = HUD_H / 2 + 8;
    this._bonusText.alpha = 0;
    this.container.addChild(this._bonusText);

    // ── Pearl section ─────────────────────────────────────────────────────────
    const pearlSection = new Container();
    pearlSection.interactive = true;
    pearlSection.cursor = 'pointer';
    pearlSection.on('pointerdown', () => this._onPearlShop?.());

    const pearlX = IS_PORTRAIT ? 86 : 128;
    const pearlIcon = new Text({ text: '💎', style: { fontSize: IS_PORTRAIT ? 16 : 18 } });
    pearlIcon.x = pearlX;
    pearlIcon.y = HUD_H / 2 - 12;
    pearlSection.addChild(pearlIcon);

    this._pearlText = new Text({
      text: '0',
      style: { fontSize: IS_PORTRAIT ? 16 : 18, fill: COLORS.text_primary, fontFamily: FONT, fontWeight: 'bold' },
    });
    this._pearlText.x = pearlX + 22;
    this._pearlText.y = HUD_H / 2 - 12;
    pearlSection.addChild(this._pearlText);

    const pearlHit = new Graphics();
    pearlHit.rect(pearlX - 4, HUD_H / 2 - 16, 70, 30).fill({ color: 0xffffff, alpha: 0 });
    pearlSection.addChild(pearlHit);
    this.container.addChild(pearlSection);

    // ── Harmony section ──────────────────────────────────────────────────────
    if (!IS_PORTRAIT) {
      const hmLabel = new Text({
        text: 'HARMONY',
        style: { fontSize: 10, fill: COLORS.text_secondary, fontFamily: FONT, letterSpacing: 2 },
      });
      hmLabel.x = 200;
      hmLabel.y = HUD_H / 2 - 22;
      this.container.addChild(hmLabel);
    }

    this.container.addChild(this._harmonyBar);

    this._harmonyText = new Text({
      text: `${state.harmony}`,
      style: {
        fontSize: IS_PORTRAIT ? 9 : 13,
        fill: COLORS.harmony_fill,
        fontFamily: FONT,
        fontWeight: 'bold',
      },
    });
    if (IS_PORTRAIT) {
      // Show value as a tiny label below the compact bar
      this._harmonyText.x = 155;
      this._harmonyText.y = HUD_H / 2 + 4;
    } else {
      this._harmonyText.x = 200;
      this._harmonyText.y = HUD_H / 2 + 4;
    }
    this.container.addChild(this._harmonyText);

    // ── Level section ────────────────────────────────────────────────────────
    const lvlLabel = new Text({
      text: 'LEVEL',
      style: { fontSize: 10, fill: COLORS.text_secondary, fontFamily: FONT, letterSpacing: 2 },
    });
    lvlLabel.x = IS_PORTRAIT ? SCREEN_W - 46 : SCREEN_W - 90;
    lvlLabel.y = IS_PORTRAIT ? HUD_H / 2 - 18 : HUD_H / 2 - 22;
    this.container.addChild(lvlLabel);

    this._levelText = new Text({
      text: String(state.level),
      style: { fontSize: IS_PORTRAIT ? 20 : 28, fill: COLORS.text_primary, fontFamily: FONT, fontWeight: 'bold' },
    });
    this._levelText.x = IS_PORTRAIT ? SCREEN_W - 40 : SCREEN_W - 70;
    this._levelText.y = IS_PORTRAIT ? HUD_H / 2 - 4 : HUD_H / 2 - 16;
    this.container.addChild(this._levelText);

    // ── Pearl Market button ───────────────────────────────────────────────────
    this._buildMarketBtn();

    // ── Home button ──────────────────────────────────────────────────────────
    this._buildHomeBtn();

    // ── Level-up banner ──────────────────────────────────────────────────────
    this._lvlUpBanner = new Container();
    this._lvlUpBanner.visible = false;

    const bannerGfx = new Graphics();
    bannerGfx.roundRect(-120, -22, 240, 44, 10)
             .fill({ color: COLORS.selected_hl, alpha: 0.95 });
    this._lvlUpBanner.addChild(bannerGfx);

    this._lvlUpText = new Text({
      text: '',
      style: { fontSize: 16, fill: 0x000000, fontFamily: FONT, fontWeight: 'bold' },
    });
    this._lvlUpText.anchor.set(0.5, 0.5);
    this._lvlUpBanner.addChild(this._lvlUpText);

    this._lvlUpBanner.x = SCREEN_W / 2;
    this._lvlUpBanner.y = HUD_H / 2;
    this.container.addChild(this._lvlUpBanner);
  }

  _buildMarketBtn() {
    const W  = IS_PORTRAIT ? 36 : 80;
    const H  = IS_PORTRAIT ? 26 : 30;
    const R  = 8;
    // Portrait: sits between harmony bar (ends ~215) and home button
    const bx = IS_PORTRAIT ? SCREEN_W - 90 - W - 6 : 530;
    const by = (HUD_H - H) / 2;

    const bg = new Graphics();
    const drawBg = (hover) => {
      bg.clear();
      bg.roundRect(0, 0, W, H, R)
        .fill({ color: hover ? 0x2a3a1a : 0x1a2a10, alpha: hover ? 1 : 0.85 });
      bg.roundRect(0, 0, W, H, R)
        .stroke({ color: 0x4a7a30, width: 1.5, alpha: 0.9 });
    };
    drawBg(false);

    const label = new Text({
      text: IS_PORTRAIT ? '💎' : '💎 Market',
      style: { fontSize: IS_PORTRAIT ? 14 : 11, fill: 0xc8e6a0, fontFamily: FONT, fontWeight: '600' },
    });
    label.x = (W - label.width) / 2;
    label.y = (H - label.height) / 2;

    const btn = new Container();
    btn.addChild(bg);
    btn.addChild(label);
    btn.x = bx;
    btn.y = by;
    btn.interactive = true;
    btn.cursor = 'pointer';
    btn.on('pointerover',  () => { drawBg(true);  label.style.fill = 0xffffff; });
    btn.on('pointerout',   () => { drawBg(false); label.style.fill = 0xc8e6a0; });
    btn.on('pointerdown',  () => this._onPearlShop?.());

    this.container.addChild(btn);
  }

  _buildHomeBtn() {
    const W = IS_PORTRAIT ? 38 : 64, H = IS_PORTRAIT ? 26 : 30, R = 8;
    const bx = IS_PORTRAIT ? SCREEN_W - 90 : SCREEN_W - 148;
    const by = (HUD_H - H) / 2;

    const bg = new Graphics();
    const drawBg = (hover) => {
      bg.clear();
      bg.roundRect(0, 0, W, H, R)
        .fill({ color: hover ? 0x2a4a6a : 0x142438, alpha: hover ? 1 : 0.85 });
      bg.roundRect(0, 0, W, H, R)
        .stroke({ color: COLORS.panel_border, width: 1, alpha: 0.8 });
    };
    drawBg(false);

    const label = new Text({
      text: IS_PORTRAIT ? '⌂' : '⌂ Menu',
      style: { fontSize: 11, fill: COLORS.text_secondary, fontFamily: FONT, fontWeight: '600' },
    });
    label.x = IS_PORTRAIT ? (W - label.width) / 2 : 10;
    label.y = (H - label.height) / 2;

    const btn = new Container();
    btn.addChild(bg);
    btn.addChild(label);
    btn.x = bx;
    btn.y = by;
    btn.interactive = true;
    btn.cursor = 'pointer';
    btn.on('pointerover',  () => { drawBg(true);  label.style.fill = COLORS.text_primary; });
    btn.on('pointerout',   () => { drawBg(false); label.style.fill = COLORS.text_secondary; });
    btn.on('pointerdown',  () => { if (this._onHome) this._onHome(); });

    this.container.addChild(btn);
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  /** Call every frame. deltaMS from PixiJS ticker. */
  update(deltaMS) {
    this._beText.text    = String(Math.floor(state.be));
    this._pearlText.text = String(Math.floor(state.pearls));
    this._levelText.text = String(state.level);
    this._harmonyText.text = String(Math.round(state.harmony));
    this._drawHarmonyBar();


    // Level-up banner fade
    if (this._lvlUpTimer > 0) {
      this._lvlUpTimer -= deltaMS;
      this._lvlUpBanner.alpha = Math.min(1, this._lvlUpTimer / 400);
      if (this._lvlUpTimer <= 0) this._lvlUpBanner.visible = false;
    }

    // Fade out bonus flash
    if (this._bonusTimer > 0) {
      this._bonusTimer -= deltaMS;
      this._bonusText.alpha = Math.min(1, this._bonusTimer / 600);
    } else {
      this._bonusText.alpha = 0;
    }
  }

  _drawHarmonyBar() {
    const g   = this._harmonyBar;
    const bx  = IS_PORTRAIT ? 155 : 200;
    const by  = HUD_H / 2 - (IS_PORTRAIT ? 3 : 6);
    const bw  = IS_PORTRAIT ? 60  : 300;
    const bh  = IS_PORTRAIT ? 6   : 10;
    const pct = state.harmony / 100;

    g.clear();
    // Track
    g.roundRect(bx, by, bw, bh, 5).fill(COLORS.harmony_empty);
    // Fill
    if (pct > 0) {
      g.roundRect(bx, by, bw * pct, bh, 5).fill(COLORS.harmony_fill);
    }
  }

  /** Show a transient bonus message next to the BE counter. */
  showBonus(msg) {
    this._bonusText.text  = msg;
    this._bonusTimer      = 2000;
    this._bonusText.alpha = 1;
  }

  /** Flash a level-up banner in the HUD. */
  showLevelUp(level) {
    this._lvlUpText.text   = `LEVEL ${level}  ✦  Reef Evolved`;
    this._lvlUpTimer       = 3000;
    this._lvlUpBanner.alpha  = 1;
    this._lvlUpBanner.visible = true;
  }
}
