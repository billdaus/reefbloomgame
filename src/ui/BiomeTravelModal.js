import { Container, Graphics, Text } from 'pixi.js';
import { SCREEN_W, SCREEN_H, COLORS, BIOMES, SEAGRASS_UNLOCK_LEVEL, DEEP_TWILIGHT_UNLOCK_LEVEL } from '../constants.js';
import { state } from '../state.js';

const FONT    = 'system-ui, -apple-system, sans-serif';
const PW      = 370;
const CARD_H  = 88;
const CARD_GAP = 10;

function unlockLevel(biomeId) {
  if (biomeId === 'seagrass')     return SEAGRASS_UNLOCK_LEVEL;
  if (biomeId === 'deepTwilight') return DEEP_TWILIGHT_UNLOCK_LEVEL;
  return 1;
}

/**
 * BiomeTravelModal — full-screen overlay showing all biomes as selectable cards.
 * show(onSelect) opens the modal; onSelect(biomeId) fires when the player picks a destination.
 */
export class BiomeTravelModal {
  constructor() {
    this.container = new Container();
    this.container.visible = false;

    this._overlay  = new Graphics();
    this._panel    = new Graphics();
    this._content  = new Container();
    this._onSelect = null;

    this.container.addChild(this._overlay);
    this.container.addChild(this._panel);
    this.container.addChild(this._content);

    // Tap backdrop to dismiss
    this._overlay.interactive = true;
    this._overlay.on('pointerdown', () => this.hide());
  }

  show(onSelect) {
    this._onSelect = onSelect;
    this.container.visible = true;
    this._build();
  }

  hide() {
    this.container.visible = false;
    this._onSelect = null;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _build() {
    const biomeList = Object.values(BIOMES);
    const ph = 56 + biomeList.length * (CARD_H + CARD_GAP) + 16;
    const px = SCREEN_W / 2 - PW / 2;
    const py = SCREEN_H / 2 - ph / 2;

    // Backdrop
    this._overlay.clear();
    this._overlay.rect(0, 0, SCREEN_W, SCREEN_H).fill({ color: 0x000000, alpha: 0.68 });

    // Panel
    this._panel.clear();
    this._panel.roundRect(px, py, PW, ph, 16).fill({ color: 0x060c18, alpha: 0.98 });
    this._panel.roundRect(px, py, PW, ph, 16).stroke({ color: COLORS.panel_border, width: 1.5 });

    this._content.removeChildren();

    // Title
    const title = new Text({
      text: '🗺  Travel to Biome',
      style: { fontSize: 14, fill: COLORS.text_primary, fontFamily: FONT, fontWeight: '700', letterSpacing: 0.5 },
    });
    title.anchor.set(0.5, 0);
    title.x = px + PW / 2;
    title.y = py + 16;
    this._content.addChild(title);

    // Close button
    const closeBtn = new Graphics();
    closeBtn.roundRect(px + PW - 34, py + 10, 24, 24, 6).fill({ color: COLORS.panel_border, alpha: 0.5 });
    closeBtn.interactive = true;
    closeBtn.cursor = 'pointer';
    closeBtn.on('pointerdown', () => this.hide());
    this._content.addChild(closeBtn);

    const closeX = new Text({
      text: '✕',
      style: { fontSize: 11, fill: COLORS.text_secondary, fontFamily: FONT },
    });
    closeX.anchor.set(0.5, 0.5);
    closeX.x = px + PW - 22;
    closeX.y = py + 22;
    this._content.addChild(closeX);

    // Biome cards
    biomeList.forEach((biome, i) => {
      const cardY  = py + 50 + i * (CARD_H + CARD_GAP);
      const isCurr = state.biome === biome.id;
      const locked = state.level < unlockLevel(biome.id);
      this._buildCard(biome, px + 12, cardY, PW - 24, isCurr, locked);
    });
  }

  _buildCard(biome, cx, cy, cw, isCurr, locked) {
    const cardBg = new Graphics();

    // Card background
    const bgColor = isCurr  ? COLORS.panel_border
                  : locked  ? 0x08101c
                  :           0x0e1a2e;
    const borderC = isCurr  ? COLORS.text_secondary
                  : locked  ? COLORS.panel_border
                  :           COLORS.text_dim;
    cardBg.roundRect(cx, cy, cw, CARD_H, 10).fill({ color: bgColor, alpha: isCurr ? 0.6 : 0.9 });
    cardBg.roundRect(cx, cy, cw, CARD_H, 10).stroke({ color: borderC, width: 1.2, alpha: isCurr ? 0.9 : 0.5 });
    this._content.addChild(cardBg);

    // Icon + Name row
    const icon = new Text({
      text: biome.icon,
      style: { fontSize: 22, fontFamily: FONT },
    });
    icon.x = cx + 14;
    icon.y = cy + (CARD_H - icon.height) / 2 - 6;
    this._content.addChild(icon);

    const nameColor = locked ? COLORS.text_dim : COLORS.text_primary;
    const name = new Text({
      text: biome.name,
      style: { fontSize: 13, fill: nameColor, fontFamily: FONT, fontWeight: '600' },
    });
    name.x = cx + 50;
    name.y = cy + 14;
    this._content.addChild(name);

    // Depth
    const depth = new Text({
      text: biome.depth,
      style: { fontSize: 9, fill: COLORS.text_dim, fontFamily: FONT, letterSpacing: 0.3 },
    });
    depth.x = cx + 50;
    depth.y = cy + 32;
    this._content.addChild(depth);

    // Description (truncated)
    const descStr = biome.description.length > 64
      ? biome.description.slice(0, 63) + '…'
      : biome.description;
    const desc = new Text({
      text: descStr,
      style: { fontSize: 8.5, fill: locked ? COLORS.text_dim : COLORS.text_secondary, fontFamily: FONT, wordWrap: true, wordWrapWidth: cw - 60 },
    });
    desc.x = cx + 50;
    desc.y = cy + 48;
    this._content.addChild(desc);

    // Status badge (right side)
    if (isCurr) {
      const badge = new Text({
        text: '● HERE',
        style: { fontSize: 8, fill: COLORS.text_secondary, fontFamily: FONT, fontWeight: '700', letterSpacing: 1 },
      });
      badge.x = cx + cw - badge.width - 14;
      badge.y = cy + 14;
      this._content.addChild(badge);
    } else if (locked) {
      const badge = new Text({
        text: `🔒  Lvl ${unlockLevel(biome.id)}`,
        style: { fontSize: 9, fill: COLORS.text_dim, fontFamily: FONT },
      });
      badge.x = cx + cw - badge.width - 14;
      badge.y = cy + 14;
      this._content.addChild(badge);
    } else {
      // Travel button
      const btnW = 76, btnH = 26;
      const btnX = cx + cw - btnW - 12;
      const btnY = cy + CARD_H / 2 - btnH / 2;

      const btn = new Graphics();
      btn.roundRect(btnX, btnY, btnW, btnH, 6)
         .fill({ color: COLORS.text_secondary, alpha: 0.18 });
      btn.roundRect(btnX, btnY, btnW, btnH, 6)
         .stroke({ color: COLORS.text_secondary, width: 1.2, alpha: 0.7 });
      btn.interactive = true;
      btn.cursor = 'pointer';
      this._content.addChild(btn);

      const btnLabel = new Text({
        text: '→  Travel',
        style: { fontSize: 10, fill: COLORS.text_primary, fontFamily: FONT, fontWeight: '600' },
      });
      btnLabel.anchor.set(0.5, 0.5);
      btnLabel.x = btnX + btnW / 2;
      btnLabel.y = btnY + btnH / 2;
      this._content.addChild(btnLabel);

      // Hover tint
      btn.on('pointerover',  () => btn.tint = 0xbbddff);
      btn.on('pointerout',   () => btn.tint = 0xffffff);
      btn.on('pointerdown',  () => {
        this.hide();
        this._onSelect?.(biome.id);
      });
    }

    // Make entire card (except current/locked) also tappable for travel
    if (!isCurr && !locked) {
      cardBg.interactive = true;
      cardBg.cursor = 'pointer';
      cardBg.on('pointerover',  () => { cardBg.tint = 0xaaccee; });
      cardBg.on('pointerout',   () => { cardBg.tint = 0xffffff; });
      cardBg.on('pointerdown',  () => {
        this.hide();
        this._onSelect?.(biome.id);
      });
    }
  }
}
