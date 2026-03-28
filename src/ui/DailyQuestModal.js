import { Container, Graphics, Text } from 'pixi.js';
import { SCREEN_W, SCREEN_H, COLORS } from '../constants.js';
import { state } from '../state.js';
import { acceptQuest, claimQuest } from '../systems/QuestSystem.js';

const FONT = 'system-ui, -apple-system, sans-serif';
const PW   = 340;
const PH   = 430;

/**
 * DailyQuestModal — opened by tapping the Quest Clam.
 *
 * Status 'available' → shows challenge list + Accept button
 * Status 'active'    → shows challenge progress bars
 * Status 'complete'  → shows all checks + Claim button
 */
export class DailyQuestModal {
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
      // Only allow closing if not 'available' (accepting is the only way forward)
      const s = state.quest?.status;
      if (s === 'active' || s === 'complete' || s === 'claimed') this.hide();
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
    this._overlay.clear();
    this._overlay.rect(0, 0, SCREEN_W, SCREEN_H).fill({ color: 0x000000, alpha: 0.65 });

    const px = SCREEN_W / 2 - PW / 2;
    const py = SCREEN_H / 2 - PH / 2;
    const cx = px + PW / 2;

    this._panel.clear();
    this._panel.roundRect(px, py, PW, PH, 18).fill({ color: 0x060c18, alpha: 0.98 });
    this._panel.roundRect(px, py, PW, PH, 18).stroke({ color: 0x7a5a20, width: 2 });

    this._content.removeChildren();

    const q      = state.quest;
    const status = q?.status ?? 'available';

    // ── Clam icon ─────────────────────────────────────────────────────────────
    const icon = new Text({
      text: '🐚',
      style: { fontSize: 32 },
    });
    icon.anchor.set(0.5, 0);
    icon.x = cx;
    icon.y = py + 16;
    this._content.addChild(icon);

    // ── Title ─────────────────────────────────────────────────────────────────
    const titleText = status === 'available' ? 'Daily Quest!'
                    : status === 'complete'  ? '✦ Quest Complete!'
                    : 'Daily Quest';
    const titleColor = status === 'complete' ? 0xffd700 : COLORS.selected_hl;
    const title = new Text({
      text: titleText,
      style: { fontSize: 20, fill: titleColor, fontFamily: FONT, fontWeight: 'bold' },
    });
    title.anchor.set(0.5, 0);
    title.x = cx;
    title.y = py + 58;
    this._content.addChild(title);

    // ── Date ──────────────────────────────────────────────────────────────────
    const dateTxt = new Text({
      text: q?.date ?? '',
      style: { fontSize: 10, fill: COLORS.text_secondary, fontFamily: FONT },
    });
    dateTxt.anchor.set(0.5, 0);
    dateTxt.x = cx;
    dateTxt.y = py + 84;
    this._content.addChild(dateTxt);

    // ── Subtitle ──────────────────────────────────────────────────────────────
    const subText = status === 'available'
      ? 'Complete all challenges to earn:'
      : status === 'complete'
      ? 'All challenges finished!'
      : 'Complete the challenges:';
    const sub = new Text({
      text: subText,
      style: { fontSize: 12, fill: COLORS.text_secondary, fontFamily: FONT },
    });
    sub.anchor.set(0.5, 0);
    sub.x = cx;
    sub.y = py + 100;
    this._content.addChild(sub);

    // ── Reward preview ────────────────────────────────────────────────────────
    if (q?.reward) {
      const parts = [];
      if (q.reward.be)     parts.push(`${q.reward.be} 🫧`);
      if (q.reward.pearls) parts.push(`${q.reward.pearls} 💎`);
      const rewardTxt = new Text({
        text: parts.join('  +  '),
        style: {
          fontSize: 16,
          fill: status === 'complete' ? 0xffd700 : COLORS.be_icon,
          fontFamily: FONT, fontWeight: 'bold',
        },
      });
      rewardTxt.anchor.set(0.5, 0);
      rewardTxt.x = cx;
      rewardTxt.y = py + 120;
      this._content.addChild(rewardTxt);
    }

    // ── Challenge rows ────────────────────────────────────────────────────────
    const challengeStartY = py + 156;
    const rowH = 70;
    const rw   = PW - 40;
    const rx   = px + 20;

    (q?.challenges ?? []).forEach((c, i) => {
      this._buildChallengeRow(c, rx, challengeStartY + i * rowH, rw, status);
    });

    // ── Action button ─────────────────────────────────────────────────────────
    const btnY = py + PH - 60;

    if (status === 'available') {
      this._buildActionBtn(cx, btnY, 'Accept Quest', 0x3a6a20, 0x2a5010, 0xc8f0a0, () => {
        acceptQuest();
        this._onAccept?.();
        this._render();
      });
    } else if (status === 'complete') {
      this._buildActionBtn(cx, btnY, '✦  Claim Reward!', 0x8a6a00, 0x5a4400, 0xfff0a0, () => {
        claimQuest();
        this._onClaim?.();
        this.hide();
      });
    } else if (status === 'active') {
      // Close button
      this._buildActionBtn(cx, btnY, 'Keep going!', 0x1a2438, 0x0e1628, COLORS.text_secondary, () => {
        this.hide();
      });
    } else {
      this._buildActionBtn(cx, btnY, 'Close', 0x1a2438, 0x0e1628, COLORS.text_secondary, () => {
        this.hide();
      });
    }
  }

  _buildChallengeRow(c, rx, ry, rw, questStatus) {
    const isDone   = c.done;
    const bgColor  = isDone ? 0x0a1a0a : 0x0a1428;
    const bgAlpha  = isDone ? 0.6 : 0.4;
    const borderC  = isDone ? 0x4a8a40 : COLORS.panel_border;

    const rowBg = new Graphics();
    rowBg.roundRect(rx, ry, rw, 62, 8).fill({ color: bgColor, alpha: bgAlpha });
    rowBg.roundRect(rx, ry, rw, 62, 8).stroke({ color: borderC, width: 1 });
    this._content.addChild(rowBg);

    // Checkmark or number
    const bullet = new Text({
      text: isDone ? '✓' : '○',
      style: { fontSize: 16, fill: isDone ? 0x7aca60 : COLORS.text_dim, fontFamily: FONT, fontWeight: 'bold' },
    });
    bullet.x = rx + 10;
    bullet.y = ry + 8;
    this._content.addChild(bullet);

    // Challenge label
    const label = new Text({
      text: c.label,
      style: { fontSize: 13, fill: isDone ? 0xa8e8a0 : COLORS.text_primary, fontFamily: FONT, fontWeight: '600' },
    });
    label.x = rx + 32;
    label.y = ry + 8;
    this._content.addChild(label);

    // Progress bar
    const bx  = rx + 32, by = ry + 32, bw = rw - 44, bh = 8;
    const pct = questStatus === 'available' ? 0 : (c.target > 0 ? Math.min(1, c.progress / c.target) : (isDone ? 1 : 0));

    const barBg = new Graphics();
    barBg.roundRect(bx, by, bw, bh, 4).fill(COLORS.harmony_empty);
    this._content.addChild(barBg);

    if (pct > 0) {
      const fill = new Graphics();
      fill.roundRect(bx, by, bw * pct, bh, 4).fill(isDone ? 0x5ab050 : COLORS.harmony_fill);
      this._content.addChild(fill);
    }

    // Progress text
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

  _buildActionBtn(cx, y, label, hoverColor, normalColor, textColor, onPress) {
    const W = 180, H = 38, R = 10;
    const bx = cx - W / 2;

    const bg = new Graphics();
    const draw = (hover) => {
      bg.clear();
      bg.roundRect(bx, y, W, H, R).fill({ color: hover ? hoverColor : normalColor, alpha: 1 });
      bg.roundRect(bx, y, W, H, R).stroke({ color: 0x8a6a30, width: 1.5 });
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
