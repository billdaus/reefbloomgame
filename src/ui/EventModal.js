import { Container, Graphics, Text } from 'pixi.js';
import { SCREEN_W, SCREEN_H, COLORS } from '../constants.js';
import { state } from '../state.js';
import { acceptEvent, claimEvent, eventDaysRemaining } from '../systems/EventSystem.js';

const FONT = 'system-ui, -apple-system, sans-serif';
const PW   = 340;
const PH   = 460;

/**
 * EventModal — displayed when the player taps the event button in the HUD.
 *
 * Status flow:
 *   'available' → shows challenges + Accept button
 *   'active'    → shows challenge progress bars + Keep Going button
 *   'complete'  → shows full progress + Claim Reward button
 *   'claimed'   → shows completion summary
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
    // Themed top-bar accent
    this._panel.roundRect(px, py, PW, 52, 18).fill({ color: theme, alpha: 0.12 });
    this._panel.rect(px, py + 36, PW, 16).fill({ color: theme, alpha: 0.12 }); // square off bottom

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

    // Days remaining — top-right
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
    const rewardY = py + 108;
    const parts = [];
    if (ev?.reward?.be)     parts.push(`${ev.reward.be} 🫧`);
    if (ev?.reward?.pearls) parts.push(`${ev.reward.pearls} 💎`);
    if (parts.length) {
      const rewardBg = new Graphics();
      rewardBg.roundRect(px + 20, rewardY, PW - 40, 30, 8)
              .fill({ color: theme, alpha: status === 'complete' ? 0.18 : 0.08 });
      this._content.addChild(rewardBg);

      const rewardLabel = new Text({
        text: 'Reward: ' + parts.join('  +  '),
        style: {
          fontSize: 14, fontFamily: FONT, fontWeight: 'bold',
          fill: status === 'complete' ? 0xffd700 : theme,
        },
      });
      rewardLabel.anchor.set(0.5, 0.5);
      rewardLabel.x = cx;
      rewardLabel.y = rewardY + 15;
      this._content.addChild(rewardLabel);
    }

    // ── Challenge rows ────────────────────────────────────────────────────────
    const challengeStartY = py + 152;
    const rowH  = 74;
    const rw    = PW - 40;
    const rx    = px + 20;

    (ev?.challenges ?? []).forEach((c, i) => {
      this._buildChallengeRow(c, rx, challengeStartY + i * rowH, rw, status, theme);
    });

    // ── Action button ─────────────────────────────────────────────────────────
    const btnY = py + PH - 62;

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
      // active
      this._buildActionBtn(cx, btnY, 'Keep going!', 0x1a2438, 0x0e1628, COLORS.text_secondary, COLORS.panel_border, () => {
        this.hide();
      });
    }

    // ── Dismiss hint ──────────────────────────────────────────────────────────
    if (status !== 'available') {
      const hint = new Text({
        text: 'tap outside to close',
        style: { fontSize: 9, fill: COLORS.text_dim, fontFamily: FONT },
      });
      hint.anchor.set(0.5, 0);
      hint.x = cx;
      hint.y = py + PH - 18;
      this._content.addChild(hint);
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

    // Progress bar
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
      : isDone
      ? 'Done!'
      : `${c.progress} / ${c.target}`;
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
