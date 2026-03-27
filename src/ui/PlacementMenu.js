import { Container, Graphics, Text } from 'pixi.js';
import {
  PANEL_X, PANEL_Y, PANEL_W, PANEL_H,
  COLORS, CORAL_SPECIES, FISH_SPECIES, CORAL_COST, FISH_COST, TIER_LABEL,
} from '../constants.js';
import { state } from '../state.js';
import { recordInteraction } from '../systems/BEEconomy.js';

const FONT    = 'system-ui, -apple-system, sans-serif';
const ROW_H   = 48;
const ICON_SZ = 30;
const PAD     = 10;
const REMOVE_BTN_H = 36;
const SCROLL_AREA_H = PANEL_H - 4 - REMOVE_BTN_H - 6;

/**
 * PlacementMenu — scrollable right panel for species selection.
 *
 * Scroll mechanics:
 *   - Pointer drag anywhere in the panel area
 *   - Mouse wheel / trackpad scroll
 *   - Momentum decay after release
 *   - Tap (< 8px movement) selects a row
 */
export class PlacementMenu {
  constructor(onCoralSelect, onFishSelect) {
    this.container     = new Container();
    this.onCoralSelect = onCoralSelect;
    this.onFishSelect  = onFishSelect;

    this._rows         = [];   // { type, id, rowY, hl, lockText, lockDim, unlockLevel }
    this._scrollY      = 0;
    this._maxScrollY   = 0;
    this._contentH     = 0;

    // Drag tracking
    this._dragActive    = false;
    this._dragStartY    = 0;
    this._dragStartScroll = 0;
    this._dragMoved     = false;
    this._lastDragY     = 0;
    this._momentum      = 0;

    // Hover tracking
    this._hoverRowId    = null;

    this._scrollContent = new Container();
    this._scrollContent.x = PANEL_X;
    this._scrollContent.y = PANEL_Y + REMOVE_BTN_H + 6;

    this._sbGfx       = new Graphics();   // scrollbar graphic
    this._removeBtnGfx = new Graphics();  // remove mode toggle

    this._build();
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  _build() {
    // 1. Panel background (static)
    const bg = new Graphics();
    bg.roundRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 6)
      .fill({ color: COLORS.panel_bg, alpha: 0.94 });
    bg.rect(PANEL_X, PANEL_Y, 1, PANEL_H)
      .fill({ color: COLORS.panel_border, alpha: 1 });
    this.container.addChild(bg);

    // 1b. Remove mode toggle button (top of panel)
    this._drawRemoveBtn();
    this.container.addChild(this._removeBtnGfx);

    const removeBtnHit = new Graphics();
    removeBtnHit.rect(PANEL_X + 4, PANEL_Y + 4, PANEL_W - 16, REMOVE_BTN_H - 2)
      .fill({ color: 0x000000, alpha: 0 });
    removeBtnHit.interactive = true;
    removeBtnHit.cursor = 'pointer';
    removeBtnHit.on('pointerdown', () => this._toggleRemoveMode());
    this.container.addChild(removeBtnHit);

    // 2. Scrollable content (positioned relative to scroll offset)
    const scrollTop = PANEL_Y + REMOVE_BTN_H + 6;
    let cursor = PAD;
    cursor = this._sectionLabel('CORAL', cursor);
    Object.values(CORAL_SPECIES).forEach(spec => { cursor = this._addRow('coral', spec, cursor); });
    cursor += PAD * 2;
    cursor = this._sectionLabel('FISH', cursor);
    Object.values(FISH_SPECIES).forEach(spec =>  { cursor = this._addRow('fish',  spec, cursor); });
    cursor += PAD;

    this._contentH   = cursor;
    this._maxScrollY = Math.max(0, this._contentH - SCROLL_AREA_H);

    this.container.addChild(this._scrollContent);

    // 3. Scroll mask (clips the content)
    const maskGfx = new Graphics();
    maskGfx.rect(PANEL_X, scrollTop + 2, PANEL_W - 8, SCROLL_AREA_H).fill(0xffffff);
    this._scrollContent.mask = maskGfx;
    this.container.addChild(maskGfx);

    // 4. Scrollbar track + thumb
    this.container.addChild(this._sbGfx);
    this._drawScrollbar();

    // 5. Hit area — covers full scroll region, sits above content
    const hitArea = new Graphics();
    hitArea.rect(PANEL_X, scrollTop, PANEL_W - 10, SCROLL_AREA_H).fill({ color: 0x000000, alpha: 0 });
    hitArea.interactive = true;
    hitArea.on('pointerdown',    e => this._onDown(e));
    hitArea.on('pointermove',    e => this._onMove(e));
    hitArea.on('pointerup',      e => this._onUp(e));
    hitArea.on('pointerupoutside', () => this._onCancel());
    hitArea.on('wheel',          e => this._onWheel(e));
    this.container.addChild(hitArea);
  }

  _sectionLabel(text, y) {
    const t = new Text({
      text,
      style: { fontSize: 9, fill: COLORS.text_dim, fontFamily: FONT, letterSpacing: 3 },
    });
    t.x = PAD;
    t.y = y;
    this._scrollContent.addChild(t);
    return y + 20;
  }

  _addRow(type, spec, y) {
    const row = new Container();
    row.x = 0;
    row.y = y;

    // Highlight background (selection / hover)
    const hl = new Graphics();
    row.addChild(hl);

    // Color swatch icon
    const icon = new Graphics();
    const iy = (ROW_H - ICON_SZ) / 2;
    icon.roundRect(PAD, iy, ICON_SZ, ICON_SZ, 6).fill({ color: spec.color, alpha: 0.9 });
    const tierColor = COLORS[`tier_${spec.tier}`] ?? 0xffffff;
    icon.circle(PAD + ICON_SZ - 5, iy + 5, 4).fill(tierColor);
    row.addChild(icon);

    // Name
    const name = new Text({
      text: spec.name,
      style: { fontSize: 11, fill: COLORS.text_primary, fontFamily: FONT },
    });
    name.x = PAD + ICON_SZ + 8;
    name.y = ROW_H / 2 - 12;
    row.addChild(name);

    // Cost — pearl species show 💎 instead of 🫧
    const isPearl = !!spec.pearlCost;
    const cost    = isPearl ? spec.pearlCost
                            : (type === 'coral' ? CORAL_COST[spec.tier] : FISH_COST[spec.tier]);
    const costTxt = new Text({
      text: isPearl ? `${cost} 💎` : `${cost} 🫧`,
      style: { fontSize: 10, fill: isPearl ? 0xb0bec5 : COLORS.text_secondary, fontFamily: FONT },
    });
    costTxt.x = PAD + ICON_SZ + 8;
    costTxt.y = ROW_H / 2 + 1;
    row.addChild(costTxt);

    // Rarity label (right side, tier color)
    const tierLabel = new Text({
      text: TIER_LABEL[spec.tier] ?? spec.tier.toUpperCase(),
      style: { fontSize: 8, fill: tierColor, fontFamily: FONT, letterSpacing: 1 },
    });
    tierLabel.x = PANEL_W - 56;
    tierLabel.y = ROW_H / 2 - 4;
    row.addChild(tierLabel);

    // Lock overlay (dim + text)
    const lockDim = new Graphics();
    lockDim.rect(0, 0, PANEL_W - 2, ROW_H - 1).fill({ color: 0x000000, alpha: 0.4 });
    lockDim.visible = spec.unlockLevel > state.level;
    row.addChild(lockDim);

    const lockText = new Text({
      text: `Lvl ${spec.unlockLevel}`,
      style: { fontSize: 9, fill: COLORS.text_dim, fontFamily: FONT },
    });
    lockText.x = PANEL_W - 46;
    lockText.y = ROW_H / 2 - 6;
    lockText.visible = spec.unlockLevel > state.level;
    row.addChild(lockText);

    this._scrollContent.addChild(row);
    this._rows.push({ row, hl, type, id: spec.id, lockText, lockDim, unlockLevel: spec.unlockLevel, rowY: y });

    return y + ROW_H;
  }

  // ── Scroll input ───────────────────────────────────────────────────────────

  _onDown(e) {
    this._dragActive     = true;
    this._dragStartY     = e.global.y;
    this._lastDragY      = e.global.y;
    this._dragStartScroll = this._scrollY;
    this._dragMoved      = false;
    this._momentum       = 0;
  }

  _onMove(e) {
    const py = e.global.y;
    const scrollTop = PANEL_Y + REMOVE_BTN_H + 6;

    // Update hover row (for visual feedback)
    const contentY = py - scrollTop + this._scrollY;
    const hovered  = this._rows.find(r => contentY >= r.rowY && contentY < r.rowY + ROW_H);
    const hoverId  = hovered ? `${hovered.type}:${hovered.id}` : null;
    if (hoverId !== this._hoverRowId) {
      this._hoverRowId = hoverId;
      this._updateHighlights();
    }

    if (!this._dragActive) return;

    const dy = py - this._dragStartY;
    if (Math.abs(dy) > 6) this._dragMoved = true;

    if (this._dragMoved) {
      this._momentum = this._lastDragY - py;
      this._lastDragY = py;
      this._setScroll(this._dragStartScroll - dy);
    }
  }

  _onUp(e) {
    if (!this._dragMoved) {
      // It was a tap — find which row
      const scrollTop = PANEL_Y + REMOVE_BTN_H + 6;
      const contentY = e.global.y - scrollTop + this._scrollY;
      const row = this._rows.find(r => contentY >= r.rowY && contentY < r.rowY + ROW_H);
      if (row && row.unlockLevel <= state.level) {
        recordInteraction();
        state.removeMode   = false;
        state.selectedType = row.type;
        state.selectedId   = row.id;
        this._drawRemoveBtn();
        if (row.type === 'coral') this.onCoralSelect(row.id);
        else                      this.onFishSelect(row.id);
        this._updateHighlights();
      }
    }
    this._dragActive = false;
  }

  _onCancel() {
    this._dragActive = false;
  }

  _onWheel(e) {
    this._setScroll(this._scrollY + e.deltaY * 0.6);
    this._momentum = 0;
  }

  // ── Per-frame update (momentum) ─────────────────────────────────────────────

  update(_deltaMS) {
    if (!this._dragActive && Math.abs(this._momentum) > 0.3) {
      this._setScroll(this._scrollY + this._momentum);
      this._momentum *= 0.90;
      if (Math.abs(this._momentum) < 0.3) this._momentum = 0;
    }
  }

  // ── Scroll helpers ─────────────────────────────────────────────────────────

  _setScroll(y) {
    const scrollTop = PANEL_Y + REMOVE_BTN_H + 6;
    this._scrollY = Math.max(0, Math.min(this._maxScrollY, y));
    this._scrollContent.y = scrollTop - this._scrollY;
    this._drawScrollbar();
  }

  _drawScrollbar() {
    const g = this._sbGfx;
    g.clear();
    if (this._maxScrollY <= 0) return;

    const scrollTop = PANEL_Y + REMOVE_BTN_H + 6;
    const trackX = PANEL_X + PANEL_W - 5;
    const trackY = scrollTop + 4;
    const trackH = SCROLL_AREA_H - 8;

    // Track
    g.rect(trackX, trackY, 3, trackH).fill({ color: COLORS.panel_border, alpha: 0.4 });

    // Thumb
    const ratio   = SCROLL_AREA_H / this._contentH;
    const thumbH  = Math.max(24, trackH * ratio);
    const thumbY  = trackY + (trackH - thumbH) * (this._scrollY / this._maxScrollY);
    g.roundRect(trackX, thumbY, 3, thumbH, 1.5).fill({ color: COLORS.text_secondary, alpha: 0.6 });
  }

  // ── Remove mode ───────────────────────────────────────────────────────

  _toggleRemoveMode() {
    state.removeMode = !state.removeMode;
    if (state.removeMode) {
      state.selectedType = null;
      state.selectedId   = null;
    }
    this._drawRemoveBtn();
    this._updateHighlights();
    this.onCoralSelect(null);   // refreshes grid hover
  }

  _drawRemoveBtn() {
    const g = this._removeBtnGfx;
    g.clear();
    const bx = PANEL_X + 6;
    const by = PANEL_Y + 5;
    const bw = PANEL_W - 20;
    const bh = REMOVE_BTN_H - 6;

    if (state.removeMode) {
      g.roundRect(bx, by, bw, bh, 5).fill({ color: 0xef5350, alpha: 0.35 });
      g.roundRect(bx, by, bw, bh, 5).stroke({ color: 0xef5350, width: 1.5, alpha: 0.9 });
    } else {
      g.roundRect(bx, by, bw, bh, 5).fill({ color: COLORS.panel_border, alpha: 0.5 });
      g.roundRect(bx, by, bw, bh, 5).stroke({ color: COLORS.panel_border, width: 1, alpha: 0.7 });
    }

    // "✕ REMOVE" label — draw as PixiJS text, but we'll just use a Text child
    // We reuse a cached text node to avoid recreating each frame
    if (!this._removeLabelText) {
      this._removeLabelText = new Text({
        text: '✕  REMOVE',
        style: { fontSize: 10, fontFamily: FONT, letterSpacing: 3, fill: 0xffffff },
      });
      this._removeBtnGfx.addChild(this._removeLabelText);
    }
    this._removeLabelText.style.fill = state.removeMode ? 0xef5350 : COLORS.text_secondary;
    this._removeLabelText.x = bx + bw / 2 - this._removeLabelText.width / 2;
    this._removeLabelText.y = by + bh / 2 - this._removeLabelText.height / 2;
  }

  // ── Highlight ──────────────────────────────────────────────────────────────

  _updateHighlights() {
    this._rows.forEach(r => {
      r.hl.clear();
      const isSelected = state.selectedType === r.type && state.selectedId === r.id;
      const isHovered  = this._hoverRowId === `${r.type}:${r.id}` && r.unlockLevel <= state.level;

      if (isSelected) {
        r.hl.rect(0, 0, PANEL_W - 2, ROW_H - 1).fill({ color: COLORS.selected_hl, alpha: 0.15 });
        r.hl.rect(0, 0, 3, ROW_H - 1).fill({ color: COLORS.selected_hl, alpha: 1 });
      } else if (isHovered) {
        r.hl.rect(0, 0, PANEL_W - 2, ROW_H - 1).fill({ color: COLORS.grid_hover, alpha: 0.3 });
      }
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Refresh lock states after a level up. */
  updateLevel() {
    this._rows.forEach(r => {
      const locked = r.unlockLevel > state.level;
      r.lockDim.visible  = locked;
      r.lockText.visible = locked;
    });
    this._updateHighlights();
  }

  /** Deselect everything. */
  clearSelection() {
    state.selectedType = null;
    state.selectedId   = null;
    this._updateHighlights();
  }
}
