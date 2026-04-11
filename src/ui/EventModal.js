import { Container, Graphics, Text } from 'pixi.js';
import { SCREEN_W, SCREEN_H, COLORS } from '../constants.js';
import { state } from '../state.js';
import { acceptEvent, claimEvent, eventDaysRemaining } from '../systems/EventSystem.js';

const FONT = 'system-ui, -apple-system, sans-serif';
const PW   = 340;

/**
 * EventModal — displayed when the player taps the event button in the HUD.
 *
 * Status flow:
 *   'available' → challenges + Accept button
 *   'active'    → challenge progress + pass tier track + Keep Going
 *   'complete'  → full progress + Claim Reward button
 *   'claimed'   → summary
 */
export class EventModal {
  constructor(onAccept, onClaim) {
    this._onAccept = onAccept;
    this._onClaim  = onClaim;

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
      if (state.event?.status !== 'available') this.hide();
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

    const hasTiers       = !!(ev?.pass?.tiers?.length);
    const showPassBlock  = hasTiers && status !== 'available';
    const challengeRows  = (ev?.challenges ?? []).length;
    const TIER_BLOCK_H   = showPassBlock ? 136 : 0;

    const PH = 108                      // header + desc + reward
             + challengeRows * 74       // challenge rows
             + TIER_BLOCK_H             // pass block
             + 62;                      // action + bottom pad

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
    this._panel.roundRect(px, py, PW, 52, 18).fill({ color: theme, alpha: 0.12 });
    this._panel.rect(px, py + 36, PW, 16).fill({ color: theme, alpha: 0.12 });

    this._content.removeChildren();

    // ── Header ────────────────────────────────────────────────────────────────
    const icon = new Text({ text: ev?.icon ?? '⚡', style: { fontSize: 24 } });
    icon.anchor.set(0, 0.5); icon.x = px + 16; icon.y = py + 26;
    this._content.addChild(icon);

    const nameText = new Text({
      text: ev?.name ?? 'Limited Time Event',
      style: { fontSize: 16, fill: theme, fontFamily: FONT, fontWeight: 'bold' },
    });
    nameText.anchor.set(0, 0.5); nameText.x = px + 50; nameText.y = py + 26;
    this._content.addChild(nameText);

    const days = ev ? eventDaysRemaining(ev.endDate) : 0;
    const daysLabel = new Text({
      text: status === 'claimed' ? 'Complete!' : `${days}d left`,
      style: { fontSize: 11, fontFamily: FONT, fontWeight: '600',
               fill: status === 'claimed' ? 0x81c784 : (days <= 1 ? 0xff7043 : 0xaaccdd) },
    });
    daysLabel.anchor.set(1, 0.5); daysLabel.x = px + PW - 14; daysLabel.y = py + 26;
    this._content.addChild(daysLabel);

    // ── Description ───────────────────────────────────────────────────────────
    const desc = new Text({
      text: ev?.description ?? '',
      style: { fontSize: 12, fill: COLORS.text_secondary, fontFamily: FONT,
               wordWrap: true, wordWrapWidth: PW - 40, align: 'center' },
    });
    desc.anchor.set(0.5, 0); desc.x = cx; desc.y = py + 60;
    this._content.addChild(desc);

    // ── Reward row ────────────────────────────────────────────────────────────
    let cursor = py + 108;
    if (ev?.reward) {
      const parts = [];
      if (ev.reward.be)     parts.push(`${ev.reward.be} 🫧`);
      if (ev.reward.pearls) parts.push(`${ev.reward.pearls} 💎`);

      const rewardBg = new Graphics();
      rewardBg.roundRect(px + 20, cursor, PW - 40, 30, 8)
              .fill({ color: theme, alpha: status === 'complete' ? 0.18 : 0.08 });
      this._content.addChild(rewardBg);

      const rewardLabel = new Text({
        text: 'Reward: ' + parts.join('  +  '),
        style: { fontSize: 13, fontFamily: FONT, fontWeight: 'bold',
                 fill: status === 'complete' ? 0xffd700 : theme },
      });
      rewardLabel.anchor.set(0.5, 0.5); rewardLabel.x = cx; rewardLabel.y = cursor + 15;
      this._content.addChild(rewardLabel);
      cursor += 38;
    }

    // ── Challenge rows ────────────────────────────────────────────────────────
    const rw = PW - 40, rx = px + 20;
    (ev?.challenges ?? []).forEach(c => {
      this._buildChallengeRow(c, rx, cursor, rw, status, theme);
      cursor += 74;
    });

    // ── Pass block ────────────────────────────────────────────────────────────
    if (showPassBlock) {
      cursor += 8;
      this._buildPassTierTrack(ev, px, cursor, PW, cx, theme);
      cursor += 128;
    }

    // ── Action button ─────────────────────────────────────────────────────────
    const btnY = cursor + 8;
    if (status === 'available') {
      this._buildActionBtn(cx, btnY, 'Join Event', 0x1a4a1a, 0x0e2e0e, theme, theme, () => {
        acceptEvent(); this._onAccept?.(); this._render();
      });
    } else if (status === 'complete') {
      this._buildActionBtn(cx, btnY, '✦  Claim Reward!', 0x6a4a00, 0x402e00, 0xfff0a0, 0x8a6a00, () => {
        claimEvent(); this._onClaim?.(); this._render();
      });
    } else if (status === 'claimed') {
      this._buildActionBtn(cx, btnY, 'Close', 0x1a2438, 0x0e1628, COLORS.text_secondary, COLORS.panel_border, () => this.hide());
    } else {
      this._buildActionBtn(cx, btnY, 'Keep going!', 0x1a2438, 0x0e1628, COLORS.text_secondary, COLORS.panel_border, () => this.hide());
    }

    if (status !== 'available') {
      const hint = new Text({ text: 'tap outside to close', style: { fontSize: 9, fill: COLORS.text_dim, fontFamily: FONT } });
      hint.anchor.set(0.5, 0); hint.x = cx; hint.y = py + PH - 18;
      this._content.addChild(hint);
    }
  }

  /** Tier track — shown once event is active/complete/claimed. */
  _buildPassTierTrack(ev, px, y, pw, cx, theme) {
    const tiers    = ev.pass.tiers;
    const tokens   = ev.eventTokens ?? 0;
    const unlocked = ev.tiersUnlocked ?? [];

    // Section background
    const bg = new Graphics();
    bg.roundRect(px + 12, y, pw - 24, 120, 10)
      .fill({ color: 0x081808, alpha: 0.75 });
    bg.roundRect(px + 12, y, pw - 24, 120, 10)
      .stroke({ color: 0x3a6a30, width: 1.5 });
    this._content.addChild(bg);

    // Header
    const headerTxt = new Text({
      text: `✦ EVENT PASS  —  ${tokens} token${tokens !== 1 ? 's' : ''}`,
      style: { fontSize: 10, fontFamily: FONT, fontWeight: '700', letterSpacing: 1, fill: 0x81c784 },
    });
    headerTxt.x = px + 20; headerTxt.y = y + 10;
    this._content.addChild(headerTxt);

    // ── Tier track ────────────────────────────────────────────────────────────
    const trackY  = y + 34;
    const trackX0 = px + 28;
    const trackX1 = px + pw - 28;
    const trackW  = trackX1 - trackX0;
    const n       = tiers.length;
    const spacing = n > 1 ? trackW / (n - 1) : 0;

    // Connector line
    const lineG = new Graphics();
    lineG.rect(trackX0, trackY - 1, trackW, 2).fill({ color: 0x2a2a3a, alpha: 1 });
    if (unlocked.length > 0 && n > 1) {
      const fillW = Math.max(...unlocked) * spacing;
      lineG.rect(trackX0, trackY - 1, fillW, 2).fill({ color: 0x4a8a40, alpha: 0.8 });
    }
    this._content.addChild(lineG);

    tiers.forEach((tier, i) => {
      const tx          = trackX0 + i * spacing;
      const isUnlocked  = unlocked.includes(i);
      const isExclusive = !!tier.reward.exclusive;
      const circleR     = isExclusive ? 9 : 7;

      const circleG = new Graphics();
      circleG.circle(tx, trackY, circleR)
             .fill(isUnlocked ? 0x4a8a40 : 0x1a1a2a);
      circleG.circle(tx, trackY, circleR)
             .stroke({ color: isUnlocked ? 0x7aca60 : 0x3a3a5a, width: 1.5 });
      if (isUnlocked) {
        const ck = new Text({ text: '✓', style: { fontSize: isExclusive ? 10 : 8, fill: 0xffffff, fontFamily: FONT, fontWeight: 'bold' } });
        ck.anchor.set(0.5, 0.5); ck.x = tx; ck.y = trackY;
        this._content.addChild(ck);
      }
      this._content.addChild(circleG);

      // Token threshold above circle
      const threshTxt = new Text({
        text: `${tier.threshold}`,
        style: { fontSize: 8, fill: COLORS.text_dim, fontFamily: FONT },
      });
      threshTxt.anchor.set(0.5, 1); threshTxt.x = tx; threshTxt.y = trackY - circleR - 3;
      this._content.addChild(threshTxt);

      // Reward label below circle
      const rewardTxt = new Text({
        text: tier.label,
        style: { fontSize: 9, fill: isUnlocked ? 0xa8e8a0 : COLORS.text_secondary,
                 fontFamily: FONT, fontWeight: isExclusive ? '700' : '400', align: 'center',
                 wordWrap: true, wordWrapWidth: spacing > 0 ? spacing + 10 : 80 },
      });
      rewardTxt.anchor.set(0.5, 0); rewardTxt.x = tx; rewardTxt.y = trackY + circleR + 4;
      this._content.addChild(rewardTxt);
    });

    // Progress hint
    const nextIdx = tiers.findIndex((_, i) => !unlocked.includes(i));
    const hintStr = nextIdx === -1
      ? '✦ All tiers unlocked!'
      : `${tiers[nextIdx].threshold - tokens} more token${tiers[nextIdx].threshold - tokens !== 1 ? 's' : ''} to next tier  —  complete quests to earn tokens`;
    const hint = new Text({
      text: hintStr,
      style: { fontSize: 9, fill: 0x81c784, fontFamily: FONT, fontStyle: 'italic',
               wordWrap: true, wordWrapWidth: pw - 40 },
    });
    hint.anchor.set(0.5, 0); hint.x = cx; hint.y = y + 98;
    this._content.addChild(hint);
  }

  _buildChallengeRow(c, rx, ry, rw, questStatus, theme) {
    const isDone  = c.done;
    const rowBg   = new Graphics();
    rowBg.roundRect(rx, ry, rw, 64, 8).fill({ color: isDone ? 0x061806 : 0x06121e, alpha: 0.55 });
    rowBg.roundRect(rx, ry, rw, 64, 8).stroke({ color: isDone ? 0x4a8a40 : COLORS.panel_border, width: 1 });
    this._content.addChild(rowBg);

    const bullet = new Text({ text: isDone ? '✓' : '○',
      style: { fontSize: 16, fill: isDone ? 0x7aca60 : COLORS.text_dim, fontFamily: FONT, fontWeight: 'bold' } });
    bullet.x = rx + 10; bullet.y = ry + 8;
    this._content.addChild(bullet);

    const label = new Text({ text: c.label,
      style: { fontSize: 13, fill: isDone ? 0xa8e8a0 : COLORS.text_primary, fontFamily: FONT, fontWeight: '600' } });
    label.x = rx + 32; label.y = ry + 8;
    this._content.addChild(label);

    const bx = rx + 32, by = ry + 34, bw = rw - 44, bh = 8;
    const pct = questStatus === 'available' ? 0 : Math.min(1, c.target > 0 ? c.progress / c.target : (isDone ? 1 : 0));
    const barBg = new Graphics();
    barBg.roundRect(bx, by, bw, bh, 4).fill(COLORS.harmony_empty);
    this._content.addChild(barBg);
    if (pct > 0) {
      const fill = new Graphics();
      fill.roundRect(bx, by, bw * pct, bh, 4).fill(isDone ? 0x5ab050 : theme);
      this._content.addChild(fill);
    }

    const prog = new Text({ text: questStatus === 'available' ? '' : isDone ? 'Done!' : `${c.progress} / ${c.target}`,
      style: { fontSize: 10, fill: isDone ? 0x7aca60 : COLORS.text_secondary, fontFamily: FONT } });
    prog.x = bx; prog.y = by + bh + 3;
    this._content.addChild(prog);
  }

  _buildActionBtn(cx, y, label, hoverFill, normalFill, textColor, borderColor, onPress) {
    const W = 190, H = 38, R = 10, bx = cx - W / 2;
    const bg = new Graphics();
    const draw = (hover) => {
      bg.clear();
      bg.roundRect(bx, y, W, H, R).fill({ color: hover ? hoverFill : normalFill, alpha: 1 });
      bg.roundRect(bx, y, W, H, R).stroke({ color: borderColor, width: 1.5 });
    };
    draw(false);
    this._content.addChild(bg);
    const txt = new Text({ text: label, style: { fontSize: 14, fill: textColor, fontFamily: FONT, fontWeight: '700' } });
    txt.anchor.set(0.5, 0.5); txt.x = cx; txt.y = y + H / 2;
    this._content.addChild(txt);
    const hit = new Graphics();
    hit.rect(bx - 4, y - 4, W + 8, H + 8).fill({ color: 0xffffff, alpha: 0 });
    hit.interactive = true; hit.cursor = 'pointer';
    hit.on('pointerover',  () => { draw(true);  txt.style.fill = 0xffffff; });
    hit.on('pointerout',   () => { draw(false); txt.style.fill = textColor; });
    hit.on('pointerdown',  () => onPress());
    this._content.addChild(hit);
  }
}
