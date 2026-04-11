import { Container, Graphics, Text } from 'pixi.js';
import { SCREEN_W, SCREEN_H, COLORS, FISH_SPECIES, CORAL_SPECIES } from '../constants.js';
import { state } from '../state.js';
import { acceptEvent, claimEvent, purchasePass, eventDaysRemaining } from '../systems/EventSystem.js';

const FONT = 'system-ui, -apple-system, sans-serif';
const PW   = 340;

/**
 * EventModal — displayed when the player taps the event button in the HUD.
 *
 * Status flow:
 *   'available' → challenges + Accept button
 *   'active'    → challenge progress bars + pass section + Keep Going button
 *   'complete'  → full progress + Claim Reward button
 *   'claimed'   → completion summary
 */
export class EventModal {
  constructor(onAccept, onClaim, onPassPurchased) {
    this._onAccept       = onAccept;
    this._onClaim        = onClaim;
    this._onPassPurchased = onPassPurchased;

    this.container = new Container();
    this.container.visible = false;

    this._overlay = new Graphics();
    this._panel   = new Graphics();
    this._content = new Container();

    this.container.addChild(this._overlay);
    this.container.addChild(this._panel);
    this.container.addChild(this._content);

    this._overlay.interactive = true;
    this._overlay.on('pointerdown', () => {
      const s = state.event?.status;
      if (s !== 'available') this.hide();
    });
  }

  show() {
    this.container.visible = true;
    this._render();
  }

  hide() {
    this.container.visible = false;
  }

  refresh() {
    if (this.container.visible) this._render();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _render() {
    const ev     = state.event;
    const status = ev?.status ?? 'available';
    const theme  = ev?.theme  ?? 0x64b5f6;

    // Compute panel height dynamically based on content
    const hasPass     = !!ev?.pass;
    const passActive  = ev?.passPurchased ?? false;
    const showPassSection = hasPass && (status === 'available' || status === 'active' || status === 'complete');
    const challengeRows   = (ev?.challenges ?? []).length;
    const PH = 108                     // header (52) + desc (~30) + reward (30) + gap (8) + pad (8) top
             + challengeRows * 74      // challenge rows
             + (showPassSection ? 100 : 0)  // pass section
             + 62;                     // action button + bottom pad

    // ── Overlay ───────────────────────────────────────────────────────────────
    this._overlay.clear();
    this._overlay.rect(0, 0, SCREEN_W, SCREEN_H).fill({ color: 0x000000, alpha: 0.65 });

    // ── Panel ─────────────────────────────────────────────────────────────────
    const px = SCREEN_W / 2 - PW / 2;
    const py = SCREEN_H / 2 - PH / 2;
    const cx = px + PW / 2;

    this._panel.clear();
    this._panel.roundRect(px, py, PW, PH, 18).fill({ color: 0x060c18, alpha: 0.98 });
    this._panel.roundRect(px, py, PW, PH, 18).stroke({ color: theme, width: 2 });
    // Themed top accent strip
    this._panel.roundRect(px, py, PW, 52, 18).fill({ color: theme, alpha: 0.12 });
    this._panel.rect(px, py + 36, PW, 16).fill({ color: theme, alpha: 0.12 });

    this._content.removeChildren();

    // ── Header ────────────────────────────────────────────────────────────────
    const icon = new Text({ text: ev?.icon ?? '⚡', style: { fontSize: 24 } });
    icon.anchor.set(0, 0.5);
    icon.x = px + 16;
    icon.y = py + 26;
    this._content.addChild(icon);

    const nameText = new Text({
      text: ev?.name ?? 'Limited Time Event',
      style: { fontSize: 16, fill: theme, fontFamily: FONT, fontWeight: 'bold' },
    });
    nameText.anchor.set(0, 0.5);
    nameText.x = px + 50;
    nameText.y = py + 26;
    this._content.addChild(nameText);

    const days = ev ? eventDaysRemaining(ev.endDate) : 0;
    const daysLabel = new Text({
      text: status === 'claimed' ? 'Complete!' : `${days}d left`,
      style: {
        fontSize: 11, fontFamily: FONT, fontWeight: '600',
        fill: status === 'claimed' ? 0x81c784 : (days <= 1 ? 0xff7043 : 0xaaccdd),
      },
    });
    daysLabel.anchor.set(1, 0.5);
    daysLabel.x = px + PW - 14;
    daysLabel.y = py + 26;
    this._content.addChild(daysLabel);

    // ── Description ───────────────────────────────────────────────────────────
    const desc = new Text({
      text: ev?.description ?? '',
      style: {
        fontSize: 12, fill: COLORS.text_secondary, fontFamily: FONT,
        wordWrap: true, wordWrapWidth: PW - 40, align: 'center',
      },
    });
    desc.anchor.set(0.5, 0);
    desc.x = cx;
    desc.y = py + 60;
    this._content.addChild(desc);

    // ── Reward row ────────────────────────────────────────────────────────────
    let cursor = py + 108;
    if (ev?.reward) {
      const base  = [];
      if (ev.reward.be)     base.push(`${ev.reward.be} 🫧`);
      if (ev.reward.pearls) base.push(`${ev.reward.pearls} 💎`);
      const bonus  = passActive && ev.pass?.bonusReward;
      const bonusParts = [];
      if (bonus?.be)     bonusParts.push(`${bonus.be} 🫧`);
      if (bonus?.pearls) bonusParts.push(`${bonus.pearls} 💎`);

      const rewardStr = base.join('  +  ') + (bonusParts.length ? `  +  ${bonusParts.join('  +  ')} ✦` : '');

      const rewardBg = new Graphics();
      rewardBg.roundRect(px + 20, cursor, PW - 40, 30, 8)
              .fill({ color: theme, alpha: status === 'complete' ? 0.18 : 0.08 });
      this._content.addChild(rewardBg);

      const rewardLabel = new Text({
        text: 'Reward: ' + rewardStr,
        style: {
          fontSize: 13, fontFamily: FONT, fontWeight: 'bold',
          fill: status === 'complete' ? 0xffd700 : theme,
        },
      });
      rewardLabel.anchor.set(0.5, 0.5);
      rewardLabel.x = cx;
      rewardLabel.y = cursor + 15;
      this._content.addChild(rewardLabel);
      cursor += 38;
    }

    // ── Challenge rows ────────────────────────────────────────────────────────
    const rw = PW - 40;
    const rx = px + 20;
    (ev?.challenges ?? []).forEach(c => {
      this._buildChallengeRow(c, rx, cursor, rw, status, theme);
      cursor += 74;
    });

    // ── Pass section ──────────────────────────────────────────────────────────
    if (showPassSection) {
      cursor += 8;
      this._buildPassSection(ev, px, cursor, PW, cx, theme, status);
      cursor += 92;
    }

    // ── Action button ─────────────────────────────────────────────────────────
    const btnY = cursor + 8;

    if (status === 'available') {
      this._buildActionBtn(cx, btnY, 'Join Event', 0x1a4a1a, 0x0e2e0e, theme, theme, () => {
        acceptEvent();
        this._onAccept?.();
        this._render();
      });
    } else if (status === 'complete') {
      this._buildActionBtn(cx, btnY, '✦  Claim Reward!', 0x6a4a00, 0x402e00, 0xfff0a0, 0x8a6a00, () => {
        claimEvent();
        this._onClaim?.();
        this._render();
      });
    } else if (status === 'claimed') {
      this._buildActionBtn(cx, btnY, 'Close', 0x1a2438, 0x0e1628, COLORS.text_secondary, COLORS.panel_border, () => {
        this.hide();
      });
    } else {
      this._buildActionBtn(cx, btnY, 'Keep going!', 0x1a2438, 0x0e1628, COLORS.text_secondary, COLORS.panel_border, () => {
        this.hide();
      });
    }

    // Dismiss hint
    if (status !== 'available') {
      const py2 = py + PH;
      const hint = new Text({
        text: 'tap outside to close',
        style: { fontSize: 9, fill: COLORS.text_dim, fontFamily: FONT },
      });
      hint.anchor.set(0.5, 0);
      hint.x = cx;
      hint.y = py2 - 18;
      this._content.addChild(hint);
    }
  }

  _buildPassSection(ev, px, y, pw, cx, theme, eventStatus) {
    const pass     = ev.pass;
    const purchased = ev.passPurchased;
    const canAfford = state.pearls >= pass.pearlCost;

    // Section background
    const bg = new Graphics();
    bg.roundRect(px + 12, y, pw - 24, 84, 10)
      .fill({ color: purchased ? 0x0a2a0a : 0x1a0a2a, alpha: 0.7 });
    bg.roundRect(px + 12, y, pw - 24, 84, 10)
      .stroke({ color: purchased ? 0x4a8a40 : (theme), width: 1.5 });
    this._content.addChild(bg);

    // "EVENT PASS" label
    const passLabel = new Text({
      text: purchased ? '✦  PASS ACTIVE' : '⚡  EVENT PASS',
      style: {
        fontSize: 10, fontFamily: FONT, fontWeight: '700', letterSpacing: 2,
        fill: purchased ? 0x81c784 : theme,
      },
    });
    passLabel.anchor.set(0, 0.5);
    passLabel.x = px + 22;
    passLabel.y = y + 14;
    this._content.addChild(passLabel);

    // Cost badge (right side)
    if (!purchased) {
      const costText = new Text({
        text: `${pass.pearlCost} 💎`,
        style: { fontSize: 13, fontFamily: FONT, fontWeight: 'bold', fill: canAfford ? 0xffd700 : 0x888888 },
      });
      costText.anchor.set(1, 0.5);
      costText.x = px + pw - 22;
      costText.y = y + 14;
      this._content.addChild(costText);
    }

    // Exclusive species names
    const exclusiveIds = [
      ...(pass.exclusiveFish ?? []),
      ...(pass.exclusiveCoral ?? []),
    ];
    const exclusiveNames = exclusiveIds.map(id =>
      FISH_SPECIES[id]?.name ?? CORAL_SPECIES[id]?.name ?? id
    );

    const specsText = new Text({
      text: '✦ Exclusive: ' + (exclusiveNames.join(', ') || '—'),
      style: { fontSize: 11, fontFamily: FONT, fill: purchased ? 0xa8e8a0 : 0xccbbee },
    });
    specsText.x = px + 22;
    specsText.y = y + 30;
    this._content.addChild(specsText);

    // Bonus reward line
    const b = pass.bonusReward;
    const bonusParts = [];
    if (b?.be)     bonusParts.push(`+${b.be} 🫧`);
    if (b?.pearls) bonusParts.push(`+${b.pearls} 💎`);
    const bonusStr = bonusParts.length ? 'Bonus on claim: ' + bonusParts.join('  ') : '';

    if (bonusStr) {
      const bonusTxt = new Text({
        text: bonusStr,
        style: { fontSize: 11, fontFamily: FONT, fill: purchased ? 0xa8e8a0 : 0xbbaacc },
      });
      bonusTxt.x = px + 22;
      bonusTxt.y = y + 48;
      this._content.addChild(bonusTxt);
    }

    // Buy button or active indicator
    if (purchased) {
      const activeTxt = new Text({
        text: 'Exclusive species unlocked in menu →',
        style: { fontSize: 9, fontFamily: FONT, fill: 0x81c784, fontStyle: 'italic' },
      });
      activeTxt.x = px + 22;
      activeTxt.y = y + 65;
      this._content.addChild(activeTxt);
    } else if (eventStatus !== 'claimed') {
      const btnW = 120, btnH = 26, btnX = px + pw - 22 - btnW, btnY2 = y + 50;
      const btnBg = new Graphics();
      const draw = (hover) => {
        btnBg.clear();
        btnBg.roundRect(btnX, btnY2, btnW, btnH, 7)
             .fill({ color: hover && canAfford ? 0x4a2080 : (canAfford ? 0x2a1060 : 0x1a1a1a), alpha: 1 });
        btnBg.roundRect(btnX, btnY2, btnW, btnH, 7)
             .stroke({ color: canAfford ? theme : 0x444444, width: 1 });
      };
      draw(false);
      this._content.addChild(btnBg);

      const btnTxt = new Text({
        text: canAfford ? 'Get Pass' : 'Need pearls',
        style: { fontSize: 11, fontFamily: FONT, fontWeight: '700', fill: canAfford ? theme : 0x666666 },
      });
      btnTxt.anchor.set(0.5, 0.5);
      btnTxt.x = btnX + btnW / 2;
      btnTxt.y = btnY2 + btnH / 2;
      this._content.addChild(btnTxt);

      if (canAfford) {
        const hit = new Graphics();
        hit.rect(btnX, btnY2, btnW, btnH).fill({ color: 0xffffff, alpha: 0 });
        hit.interactive = true;
        hit.cursor = 'pointer';
        hit.on('pointerover',  () => draw(true));
        hit.on('pointerout',   () => draw(false));
        hit.on('pointerdown',  () => {
          if (purchasePass()) {
            this._onPassPurchased?.();
            this._render();
          }
        });
        this._content.addChild(hit);
      }
    }
  }

  _buildChallengeRow(c, rx, ry, rw, questStatus, theme) {
    const isDone  = c.done;
    const bgColor = isDone ? 0x061806 : 0x06121e;
    const borderC = isDone ? 0x4a8a40 : COLORS.panel_border;

    const rowBg = new Graphics();
    rowBg.roundRect(rx, ry, rw, 64, 8).fill({ color: bgColor, alpha: 0.55 });
    rowBg.roundRect(rx, ry, rw, 64, 8).stroke({ color: borderC, width: 1 });
    this._content.addChild(rowBg);

    const bullet = new Text({
      text: isDone ? '✓' : '○',
      style: { fontSize: 16, fill: isDone ? 0x7aca60 : COLORS.text_dim, fontFamily: FONT, fontWeight: 'bold' },
    });
    bullet.x = rx + 10;
    bullet.y = ry + 8;
    this._content.addChild(bullet);

    const label = new Text({
      text: c.label,
      style: { fontSize: 13, fill: isDone ? 0xa8e8a0 : COLORS.text_primary, fontFamily: FONT, fontWeight: '600' },
    });
    label.x = rx + 32;
    label.y = ry + 8;
    this._content.addChild(label);

    const bx  = rx + 32, by = ry + 34, bw = rw - 44, bh = 8;
    const pct = questStatus === 'available'
      ? 0
      : c.target > 0 ? Math.min(1, c.progress / c.target) : (isDone ? 1 : 0);

    const barBg = new Graphics();
    barBg.roundRect(bx, by, bw, bh, 4).fill(COLORS.harmony_empty);
    this._content.addChild(barBg);

    if (pct > 0) {
      const fill = new Graphics();
      fill.roundRect(bx, by, bw * pct, bh, 4).fill(isDone ? 0x5ab050 : theme);
      this._content.addChild(fill);
    }

    const progStr = questStatus === 'available'
      ? ''
      : isDone ? 'Done!' : `${c.progress} / ${c.target}`;
    const prog = new Text({
      text: progStr,
      style: { fontSize: 10, fill: isDone ? 0x7aca60 : COLORS.text_secondary, fontFamily: FONT },
    });
    prog.x = bx;
    prog.y = by + bh + 3;
    this._content.addChild(prog);
  }

  _buildActionBtn(cx, y, label, hoverFill, normalFill, textColor, borderColor, onPress) {
    const W = 190, H = 38, R = 10;
    const bx = cx - W / 2;

    const bg = new Graphics();
    const draw = (hover) => {
      bg.clear();
      bg.roundRect(bx, y, W, H, R).fill({ color: hover ? hoverFill : normalFill, alpha: 1 });
      bg.roundRect(bx, y, W, H, R).stroke({ color: borderColor, width: 1.5 });
    };
    draw(false);
    this._content.addChild(bg);

    const txt = new Text({
      text: label,
      style: { fontSize: 14, fill: textColor, fontFamily: FONT, fontWeight: '700' },
    });
    txt.anchor.set(0.5, 0.5);
    txt.x = cx;
    txt.y = y + H / 2;
    this._content.addChild(txt);

    const hit = new Graphics();
    hit.rect(bx - 4, y - 4, W + 8, H + 8).fill({ color: 0xffffff, alpha: 0 });
    hit.interactive = true;
    hit.cursor = 'pointer';
    hit.on('pointerover',  () => { draw(true);  txt.style.fill = 0xffffff; });
    hit.on('pointerout',   () => { draw(false); txt.style.fill = textColor; });
    hit.on('pointerdown',  () => onPress());
    this._content.addChild(hit);
  }
}
