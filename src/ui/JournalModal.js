import { Container, Graphics, Text } from 'pixi.js';
import { SCREEN_W, SCREEN_H, IS_PORTRAIT, COLORS } from '../constants.js';
import { getEntries, getUnlockedCount, getTotalCount } from '../systems/JournalSystem.js';

const FONT = 'system-ui, -apple-system, sans-serif';

const TABS       = ['all', 'biome', 'coral', 'fish', 'other'];
const TAB_LABELS = ['All', 'Biomes', 'Coral', 'Fish', 'Other'];

const ROW_H_UNLOCKED = 80;
const ROW_H_LOCKED   = 44;

export default class JournalModal {
  constructor() {
    // ── Layout ──────────────────────────────────────────────────────────────
    const PW = IS_PORTRAIT ? SCREEN_W - 20 : 660;
    const PH = IS_PORTRAIT ? SCREEN_H - 60 : 640;
    const px = SCREEN_W / 2 - PW / 2;
    const py = SCREEN_H / 2 - PH / 2;

    this._PW = PW;
    this._PH = PH;
    this._px = px;
    this._py = py;

    // ── State ───────────────────────────────────────────────────────────────
    this._activeTab    = 'all';
    this._scrollY      = 0;
    this._maxScroll    = 0;
    this._dragging     = false;
    this._dragStartY   = 0;
    this._dragStartScroll = 0;

    // ── Container tree ──────────────────────────────────────────────────────
    this.container = new Container();
    this.container.visible = false;

    // Full-screen overlay (closes modal on tap)
    this._overlay = new Graphics();
    this._overlay.rect(0, 0, SCREEN_W, SCREEN_H).fill({ color: 0x000000, alpha: 0.6 });
    this._overlay.interactive = true;
    this._overlay.on('pointerdown', () => this.hide());
    this.container.addChild(this._overlay);

    // Panel background
    this._panel = new Graphics();
    this.container.addChild(this._panel);

    // All UI children live here
    this._content = new Container();
    this.container.addChild(this._content);

    // Scroll mask (fixed, child of _content so it doesn't move with scrollContent)
    this._scrollMask = new Graphics();
    this._content.addChild(this._scrollMask);

    // Scrollable content container
    this._scrollContent = new Container();
    this._scrollContent.mask = this._scrollMask;
    this._content.addChild(this._scrollContent);

    // ── Wheel handler (bound once, added/removed on show/hide) ──────────────
    this._wheelHandler = (e) => {
      if (!this.container.visible) return;
      const scrollAreaY = this._py + 120;
      this._scrollY = Math.max(0, Math.min(this._maxScroll, this._scrollY + e.deltaY * 0.5));
      this._scrollContent.y = scrollAreaY - this._scrollY;
    };
  }

  // ── Tier helpers ────────────────────────────────────────────────────────────

  _tierColor(tier) {
    const map = {
      common:    0x9e9e9e,
      uncommon:  0x66bb6a,
      rare:      0x29b6f6,
      superRare: 0xce93d8,
      epic:      0xffd54f,
      legendary: 0xff7043,
      mythic:    0xef5350,
    };
    return map[tier] ?? 0x9e9e9e;
  }

  _tierLabel(tier) {
    const map = {
      common:    'Common',
      uncommon:  'Uncommon',
      rare:      'Rare',
      superRare: 'Super Rare',
      epic:      'Epic',
      legendary: 'Legendary',
      mythic:    'Mythic',
    };
    return map[tier] ?? tier;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  show() {
    this.container.visible = true;
    this._activeTab = 'all';
    this._scrollY   = 0;
    this._render();
    window.addEventListener('wheel', this._wheelHandler);
  }

  hide() {
    this.container.visible = false;
    window.removeEventListener('wheel', this._wheelHandler);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  _render() {
    const { _px: px, _py: py, _PW: PW, _PH: PH } = this;

    // ── Clear previous content ────────────────────────────────────────────────
    this._content.removeChildren();
    this._scrollMask = new Graphics();
    this._scrollContent = new Container();

    // ── Panel background ──────────────────────────────────────────────────────
    this._panel.clear();
    this._panel
      .roundRect(px, py, PW, PH, 12)
      .fill({ color: 0x080e18 })
      .roundRect(px, py, PW, PH, 12)
      .stroke({ color: 0x1a2e3e, width: 1.5 });

    // ── Header ────────────────────────────────────────────────────────────────
    const headerY = py + 18;

    const titleText = new Text({
      text: '📖 Ocean Journal',
      style: {
        fontFamily: FONT,
        fontSize: 18,
        fontWeight: 'bold',
        fill: 0xddeeff,
      },
    });
    titleText.x = px + 16;
    titleText.y = headerY;
    this._content.addChild(titleText);

    // Close button
    const closeBg = new Graphics();
    const closeX  = px + PW - 36;
    const closeY  = headerY;
    closeBg.roundRect(closeX, closeY, 28, 28, 6).fill({ color: 0x1a2e3e });
    closeBg.interactive = true;
    closeBg.cursor = 'pointer';
    closeBg.on('pointerdown', () => this.hide());
    this._content.addChild(closeBg);

    const closeText = new Text({
      text: '×',
      style: {
        fontFamily: FONT,
        fontSize: 20,
        fontWeight: 'bold',
        fill: 0x7ab0cc,
      },
    });
    closeText.x = closeX + 8;
    closeText.y = closeY + 3;
    this._content.addChild(closeText);

    // ── Tab bar ───────────────────────────────────────────────────────────────
    const tabBarY    = py + 56;
    const tabW       = Math.floor(PW / TABS.length);
    const tabH       = 32;

    TABS.forEach((tab, i) => {
      const tx      = px + i * tabW;
      const isActive = tab === this._activeTab;

      const tabBg = new Graphics();
      tabBg.roundRect(tx + 2, tabBarY, tabW - 4, tabH, 6)
        .fill({ color: isActive ? 0x1e4068 : 0x0d1526 });
      if (isActive) {
        tabBg.roundRect(tx + 2, tabBarY, tabW - 4, tabH, 6)
          .stroke({ color: 0x3a7fb5, width: 1 });
      }
      tabBg.interactive = true;
      tabBg.cursor = 'pointer';
      tabBg.on('pointerdown', () => {
        this._activeTab = tab;
        this._scrollY   = 0;
        this._render();
      });
      this._content.addChild(tabBg);

      const tabText = new Text({
        text: TAB_LABELS[i],
        style: {
          fontFamily: FONT,
          fontSize:   12,
          fontWeight: isActive ? 'bold' : 'normal',
          fill:       isActive ? 0xddeeff : 0x7ab0cc,
        },
      });
      tabText.x = tx + Math.floor((tabW - tabText.width) / 2);
      tabText.y = tabBarY + 8;
      tabText.interactive = true;
      tabText.cursor = 'pointer';
      tabText.on('pointerdown', () => {
        this._activeTab = tab;
        this._scrollY   = 0;
        this._render();
      });
      this._content.addChild(tabText);
    });

    // ── Counter bar ───────────────────────────────────────────────────────────
    const counterY     = tabBarY + tabH + 8;
    const catFilter    = this._activeTab === 'all' ? null : this._activeTab;
    const unlockedCount = getUnlockedCount(catFilter);
    const totalCount    = getTotalCount(catFilter);

    const counterText = new Text({
      text: `${unlockedCount} / ${totalCount} discovered`,
      style: {
        fontFamily: FONT,
        fontSize:   11,
        fill:       0x7ab0cc,
      },
    });
    counterText.x = px + PW - counterText.width - 12;
    counterText.y = counterY + 2;
    this._content.addChild(counterText);

    // Progress bar
    const barW   = 100;
    const barH   = 6;
    const barX   = px + 12;
    const barMid = counterY + 5;
    const prog   = totalCount > 0 ? unlockedCount / totalCount : 0;

    const barBg = new Graphics();
    barBg.roundRect(barX, barMid, barW, barH, 3).fill({ color: 0x1a2e3e });
    this._content.addChild(barBg);

    const barFill = new Graphics();
    barFill.roundRect(barX, barMid, Math.max(4, Math.floor(barW * prog)), barH, 3)
      .fill({ color: 0x3a7fb5 });
    this._content.addChild(barFill);

    // ── Scroll area setup ─────────────────────────────────────────────────────
    const scrollAreaY = py + 120;
    const SCROLL_H    = PH - 120;

    // Mask (stays fixed)
    this._scrollMask = new Graphics();
    this._scrollMask.rect(px, scrollAreaY, PW, SCROLL_H).fill(0xffffff);
    this._content.addChild(this._scrollMask);

    // Scroll content container
    this._scrollContent = new Container();
    this._scrollContent.mask = this._scrollMask;
    this._content.addChild(this._scrollContent);

    // ── Build entries list ────────────────────────────────────────────────────
    const entries = getEntries(catFilter);

    let rowY         = 0; // relative to scrollContent
    let totalContentH = 0;

    entries.forEach((entry, index) => {
      const rowH   = entry.unlocked ? ROW_H_UNLOCKED : ROW_H_LOCKED;
      const rowAbsX = px;
      const rowAbsY = rowY;
      const isEven  = index % 2 === 0;

      // Row background
      const rowBg = new Graphics();
      const rowBgColor = entry.unlocked
        ? (isEven ? 0x0d1b2e : 0x0a1528)
        : 0x0a0f1a;
      rowBg.roundRect(rowAbsX + 4, rowAbsY + 2, PW - 8, rowH - 4, 6)
        .fill({ color: rowBgColor });
      this._scrollContent.addChild(rowBg);

      if (entry.unlocked) {
        // ── Icon circle ─────────────────────────────────────────────────────
        const circleX = rowAbsX + 26;
        const circleY = rowAbsY + rowH / 2;
        const circle  = new Graphics();
        circle.circle(circleX, circleY, 18).fill({ color: entry.color, alpha: 0.4 });
        circle.circle(circleX, circleY, 18).stroke({ color: entry.color, alpha: 0.6, width: 1 });
        this._scrollContent.addChild(circle);

        const iconText = new Text({
          text: entry.icon,
          style: {
            fontFamily: FONT,
            fontSize:   16,
          },
        });
        iconText.x = circleX - iconText.width / 2;
        iconText.y = circleY - iconText.height / 2;
        this._scrollContent.addChild(iconText);

        // ── Tier badge ───────────────────────────────────────────────────────
        if (entry.tier) {
          const tierColor = this._tierColor(entry.tier);
          const tierLabel = this._tierLabel(entry.tier);

          const badgeText = new Text({
            text: tierLabel,
            style: {
              fontFamily: FONT,
              fontSize:   9,
              fontWeight: 'bold',
              fill:       0x000000,
            },
          });
          const badgeW    = badgeText.width + 8;
          const badgeH    = 14;
          const badgeX    = rowAbsX + PW - badgeW - 10;
          const badgeY    = rowAbsY + 6;

          const badge = new Graphics();
          badge.roundRect(badgeX, badgeY, badgeW, badgeH, 4).fill({ color: tierColor });
          this._scrollContent.addChild(badge);

          badgeText.x = badgeX + 4;
          badgeText.y = badgeY + 2;
          this._scrollContent.addChild(badgeText);
        }

        // ── Name ─────────────────────────────────────────────────────────────
        const nameText = new Text({
          text: entry.name,
          style: {
            fontFamily: FONT,
            fontSize:   13,
            fontWeight: 'bold',
            fill:       0xddeeff,
          },
        });
        nameText.x = rowAbsX + 52;
        nameText.y = rowAbsY + 8;
        this._scrollContent.addChild(nameText);

        // ── Scientific name ───────────────────────────────────────────────────
        let sciBottom = nameText.y + nameText.height;
        if (entry.scientific) {
          const sciText = new Text({
            text: entry.scientific,
            style: {
              fontFamily:   FONT,
              fontSize:     10,
              fontStyle:    'italic',
              fill:         0x3a5a6a,
            },
          });
          sciText.x = rowAbsX + 52;
          sciText.y = sciBottom + 1;
          this._scrollContent.addChild(sciText);
          sciBottom = sciText.y + sciText.height;
        }

        // ── Description ───────────────────────────────────────────────────────
        const descText = new Text({
          text: entry.description,
          style: {
            fontFamily:    FONT,
            fontSize:      11,
            fill:          0x7ab0cc,
            wordWrap:      true,
            wordWrapWidth: PW - 80,
          },
        });
        descText.x = rowAbsX + 52;
        descText.y = sciBottom + 2;
        // Clamp to 2 lines approximate: cap height to 2 * (fontSize * lineHeight)
        // We allow word wrap to naturally handle it; 2-line cap via explicit height mask
        if (descText.height > 30) {
          const descMask = new Graphics();
          descMask.rect(rowAbsX + 52, descText.y, PW - 80, 28).fill(0xffffff);
          this._scrollContent.addChild(descMask);
          descText.mask = descMask;
        }
        this._scrollContent.addChild(descText);

      } else {
        // ── Locked row ───────────────────────────────────────────────────────

        // Gray "?" circle
        const circleX = rowAbsX + 26;
        const circleY = rowAbsY + rowH / 2;
        const circle  = new Graphics();
        circle.circle(circleX, circleY, 18).fill({ color: 0x1e2a3a });
        circle.circle(circleX, circleY, 18).stroke({ color: 0x2a3a4e, width: 1 });
        this._scrollContent.addChild(circle);

        const qText = new Text({
          text: '?',
          style: {
            fontFamily: FONT,
            fontSize:   16,
            fontWeight: 'bold',
            fill:       0x3a5a6a,
          },
        });
        qText.x = circleX - qText.width / 2;
        qText.y = circleY - qText.height / 2;
        this._scrollContent.addChild(qText);

        // "???" name
        const lockedName = new Text({
          text: '???',
          style: {
            fontFamily: FONT,
            fontSize:   13,
            fontWeight: 'bold',
            fill:       0x3a5a6a,
          },
        });
        lockedName.x = rowAbsX + 52;
        lockedName.y = rowAbsY + 7;
        this._scrollContent.addChild(lockedName);

        // Hint
        const hintText = new Text({
          text: `🔒 ${entry.hint}`,
          style: {
            fontFamily: FONT,
            fontSize:   10,
            fill:       0x2a3e4e,
          },
        });
        hintText.x = rowAbsX + 52;
        hintText.y = lockedName.y + lockedName.height + 2;
        this._scrollContent.addChild(hintText);
      }

      rowY          += rowH;
      totalContentH += rowH;
    });

    // ── Scroll hit area ───────────────────────────────────────────────────────
    const scrollHit = new Graphics();
    scrollHit.rect(px, scrollAreaY, PW, SCROLL_H).fill({ color: 0xffffff, alpha: 0 });
    scrollHit.interactive = true;
    scrollHit.on('pointerdown', (e) => {
      this._dragging        = true;
      this._dragStartY      = e.global.y;
      this._dragStartScroll = this._scrollY;
    });
    scrollHit.on('pointermove', (e) => {
      if (!this._dragging) return;
      const dy = this._dragStartY - e.global.y;
      this._scrollY = Math.max(0, Math.min(this._maxScroll, this._dragStartScroll + dy));
      this._scrollContent.y = scrollAreaY - this._scrollY;
    });
    scrollHit.on('pointerup', () => { this._dragging = false; });
    scrollHit.on('pointerupoutside', () => { this._dragging = false; });
    this._content.addChild(scrollHit);

    // ── Update scroll bounds ──────────────────────────────────────────────────
    this._maxScroll = Math.max(0, totalContentH - SCROLL_H);
    this._scrollY   = Math.min(this._scrollY, this._maxScroll);

    // Position scroll content at correct starting y
    this._scrollContent.y = scrollAreaY - this._scrollY;
  }
}
