import { Container, Graphics, Text } from 'pixi.js';
import { SCREEN_W, HUD_H, IS_PORTRAIT, COLORS } from '../constants.js';
import { state } from '../state.js';
import { eventDaysRemaining } from '../systems/EventSystem.js';

const FONT = 'system-ui, -apple-system, sans-serif';

/**
 * HUD — top bar showing BE, Harmony bar, and Level.
 */
export class HUD {
  constructor(onHome, onPearlShop, onJournal, onAccount, onEventBtn) {
    this._onHome      = onHome;
    this._onPearlShop = onPearlShop;
    this._onJournal   = onJournal;
    this._onAccount   = onAccount;
    this._onEventBtn  = onEventBtn;
    this.container = new Container();
    this._bg          = new Graphics();
    this._beText      = null;
    this._pearlText   = null;
    this._bonusText   = null;
    this._bonusTimer  = 0;
    this._harmonyBar  = new Graphics();
    this._eventBtn    = null;
    this._eventPulse  = 0;
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

    // ── Journal button ───────────────────────────────────────────────────────
    this._buildJournalBtn();

    // ── Event button ─────────────────────────────────────────────────────────
    this._buildEventBtn();

    // ── Account button ───────────────────────────────────────────────────────
    this._buildAccountBtn();

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

  _buildJournalBtn() {
    const W  = IS_PORTRAIT ? 30 : 70;
    const H  = IS_PORTRAIT ? 26 : 30;
    const R  = 8;
    const bx = IS_PORTRAIT ? 218 : 622;
    const by = (HUD_H - H) / 2;

    const bg = new Graphics();
    const drawBg = (hover) => {
      bg.clear();
      bg.roundRect(0, 0, W, H, R)
        .fill({ color: hover ? 0x2a3a5a : 0x10203a, alpha: hover ? 1 : 0.85 });
      bg.roundRect(0, 0, W, H, R)
        .stroke({ color: 0x3a5a8a, width: 1.5, alpha: 0.9 });
    };
    drawBg(false);

    const label = new Text({
      text: IS_PORTRAIT ? '📖' : '📖 Journal',
      style: { fontSize: IS_PORTRAIT ? 14 : 11, fill: 0xa8c8f0, fontFamily: FONT, fontWeight: '600' },
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
    btn.on('pointerout',   () => { drawBg(false); label.style.fill = 0xa8c8f0; });
    btn.on('pointerdown',  () => this._onJournal?.());

    this.container.addChild(btn);
  }

  _buildEventBtn() {
    // Portrait: floats just below the HUD on the right side (outside HUD bar)
    // Landscape: sits inside the HUD between the journal and account buttons
    const W  = IS_PORTRAIT ? 80 : 110;
    const H  = IS_PORTRAIT ? 24 : 30;
    const R  = 12;
    const bx = IS_PORTRAIT ? SCREEN_W - W - 6 : 700;
    const by = IS_PORTRAIT ? HUD_H + 4         : (HUD_H - H) / 2;

    const bg = new Graphics();
    const drawBg = (color, alpha) => {
      bg.clear();
      bg.roundRect(0, 0, W, H, R).fill({ color, alpha });
      bg.roundRect(0, 0, W, H, R).stroke({ color: 0xffffff, width: 1, alpha: 0.3 });
    };
    drawBg(0x2a1a40, 0.92);

    const label = new Text({
      text: IS_PORTRAIT ? '⚡ Event' : '⚡ Event',
      style: { fontSize: IS_PORTRAIT ? 11 : 11, fill: 0xddaaff, fontFamily: FONT, fontWeight: '700' },
    });
    label.anchor.set(0, 0.5);
    label.x = 10;
    label.y = H / 2;

    // Days-remaining sub-label (landscape only)
    const daysLabel = new Text({
      text: '',
      style: { fontSize: 9, fill: 0xbbaacc, fontFamily: FONT },
    });
    daysLabel.anchor.set(1, 0.5);
    daysLabel.x = W - 8;
    daysLabel.y = H / 2;

    const btn = new Container();
    btn.addChild(bg);
    btn.addChild(label);
    if (!IS_PORTRAIT) btn.addChild(daysLabel);
    btn.x = bx;
    btn.y = by;
    btn.interactive = true;
    btn.cursor = 'pointer';
    btn.visible = false;
    btn.on('pointerover',  () => drawBg(0x4a2a6a, 1));
    btn.on('pointerout',   () => {
      const isComplete = state.event?.status === 'complete';
      drawBg(isComplete ? 0x3a1a5a : 0x2a1a40, 0.92);
    });
    btn.on('pointerdown',  () => this._onEventBtn?.());

    this._eventBtnBg       = bg;
    this._eventBtnDrawBg   = drawBg;
    this._eventBtnDaysText = daysLabel;
    this._eventBtn         = btn;
    this.container.addChild(btn);
  }

  _buildAccountBtn() {
    const W  = IS_PORTRAIT ? 30 : 32;
    const H  = IS_PORTRAIT ? 26 : 30;
    const R  = 8;
    // Portrait: just right of the journal button (journal bx=218, W=30 → ends at 248)
    // Landscape: between journal (622+70=692) and home (SCREEN_W-148), at SCREEN_W-188
    const bx = IS_PORTRAIT ? 252 : SCREEN_W - 188;
    const by = (HUD_H - H) / 2;

    const bg = new Graphics();
    const drawBg = (hover) => {
      bg.clear();
      bg.roundRect(0, 0, W, H, R)
        .fill({ color: hover ? 0x2a3060 : 0x101830, alpha: hover ? 1 : 0.85 });
      bg.roundRect(0, 0, W, H, R)
        .stroke({ color: 0x3a4a80, width: 1.5, alpha: 0.9 });
    };
    drawBg(false);

    const label = new Text({
      text: '👤',
      style: { fontSize: IS_PORTRAIT ? 14 : 14, fill: 0xaabbee, fontFamily: FONT },
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
    btn.on('pointerover',  () => drawBg(true));
    btn.on('pointerout',   () => drawBg(false));
    btn.on('pointerdown',  () => this._onAccount?.());

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
    this._updateEventBtn(deltaMS);

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

  _updateEventBtn(deltaMS) {
    if (!this._eventBtn) return;
    const ev     = state.event;
    const status = ev?.status ?? null;
    this._eventBtn.visible = !!status;
    if (!status) return;

    const isComplete = status === 'complete';
    const isClaimed  = status === 'claimed';
    this._eventPulse += deltaMS * 0.004;
    const pulse = 0.82 + 0.18 * Math.sin(this._eventPulse);
    this._eventBtn.alpha = isClaimed ? 0.5 : (isComplete ? pulse : 1);

    // Tint background
    const bgColor = isComplete ? 0x4a2060 : (isClaimed ? 0x1a1a2a : 0x2a1a40);
    this._eventBtnDrawBg?.(bgColor, 0.92);

    // Days label
    if (this._eventBtnDaysText && ev) {
      const days = eventDaysRemaining(ev.endDate);
      this._eventBtnDaysText.text = isComplete ? 'CLAIM!' : (isClaimed ? 'Done' : `${days}d`);
      this._eventBtnDaysText.style.fill = isComplete ? 0xffaaff : (isClaimed ? 0x666666 : (days <= 1 ? 0xff7043 : 0xbbaacc));
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
