import { Container, Graphics, Text } from 'pixi.js';
import { SCREEN_W, SCREEN_H, IS_PORTRAIT, COLORS, TIER_LABEL } from '../constants.js';
import {
  NEWSLETTER_ISSUES, resolveSpotlightSpecies, markNewsletterRead,
} from '../systems/NewsletterSystem.js';

const FONT = 'system-ui, -apple-system, sans-serif';

/**
 * NewsletterModal — weekly recap of content drops with a species spotlight.
 * Panel with prev/next navigation across issues; calls onChange when the
 * player flips to a new issue so the HUD's unread badge refreshes.
 */
export class NewsletterModal {
  constructor(onChange) {
    this._onChange = onChange;
    this._issueIdx = 0;

    this.container = new Container();
    this.container.visible = false;

    this._overlay = new Graphics();
    this._panel   = new Graphics();
    this._content = new Container();

    this.container.addChild(this._overlay);
    this.container.addChild(this._panel);
    this.container.addChild(this._content);

    this._overlay.interactive = true;
    this._overlay.on('pointerdown', () => this.hide());
  }

  show() {
    this._issueIdx = 0;
    this.container.visible = true;
    this._markCurrentRead();
    this._render();
  }

  hide() { this.container.visible = false; }

  // ── Private ────────────────────────────────────────────────────────────────

  _markCurrentRead() {
    const issue = NEWSLETTER_ISSUES[this._issueIdx];
    if (!issue) return;
    markNewsletterRead(issue.weekOf);
    this._onChange?.();
  }

  _setIssue(idx) {
    if (idx < 0 || idx >= NEWSLETTER_ISSUES.length) return;
    this._issueIdx = idx;
    this._markCurrentRead();
    this._render();
  }

  _render() {
    const issue = NEWSLETTER_ISSUES[this._issueIdx];
    if (!issue) return;

    const PW = IS_PORTRAIT ? SCREEN_W - 24 : 420;
    const PH = IS_PORTRAIT ? SCREEN_H - 80 : 540;
    const px = SCREEN_W / 2 - PW / 2;
    const py = SCREEN_H / 2 - PH / 2;
    const cx = px + PW / 2;

    this._overlay.clear();
    this._overlay.rect(0, 0, SCREEN_W, SCREEN_H).fill({ color: 0x000000, alpha: 0.62 });

    this._panel.clear();
    this._panel.roundRect(px, py, PW, PH, 16).fill({ color: 0x060c18, alpha: 0.98 });
    this._panel.roundRect(px, py, PW, PH, 16).stroke({ color: COLORS.panel_border, width: 2 });
    // Masthead band
    this._panel.roundRect(px, py, PW, 58, 16).fill({ color: 0x1a2e3e, alpha: 0.6 });
    this._panel.rect(px, py + 42, PW, 16).fill({ color: 0x1a2e3e, alpha: 0.6 });

    this._content.removeChildren();

    // ── Masthead ──────────────────────────────────────────────────────────────
    const masthead = new Text({
      text: '📰  REEFBLOOM WEEKLY',
      style: { fontSize: 12, fill: 0xaaccdd, fontFamily: FONT, fontWeight: '700', letterSpacing: 3 },
    });
    masthead.anchor.set(0.5, 0); masthead.x = cx; masthead.y = py + 10;
    this._content.addChild(masthead);

    const issueDate = new Text({
      text: `Week of ${_formatDate(issue.weekOf)}`,
      style: { fontSize: 10, fill: COLORS.text_secondary, fontFamily: FONT, letterSpacing: 1 },
    });
    issueDate.anchor.set(0.5, 0); issueDate.x = cx; issueDate.y = py + 30;
    this._content.addChild(issueDate);

    // ── Issue title ───────────────────────────────────────────────────────────
    const title = new Text({
      text: issue.title,
      style: { fontSize: 17, fill: COLORS.text_primary, fontFamily: FONT, fontWeight: 'bold',
               wordWrap: true, wordWrapWidth: PW - 40, align: 'center' },
    });
    title.anchor.set(0.5, 0); title.x = cx; title.y = py + 64;
    this._content.addChild(title);

    let cursor = py + 64 + title.height + 6;

    if (issue.intro) {
      const intro = new Text({
        text: issue.intro,
        style: { fontSize: 11, fill: COLORS.text_secondary, fontFamily: FONT, fontStyle: 'italic',
                 wordWrap: true, wordWrapWidth: PW - 40, align: 'center' },
      });
      intro.anchor.set(0.5, 0); intro.x = cx; intro.y = cursor;
      this._content.addChild(intro);
      cursor += intro.height + 10;
    }

    // ── Content drops ─────────────────────────────────────────────────────────
    const sectionLabel = new Text({
      text: 'THIS WEEK',
      style: { fontSize: 9, fill: COLORS.text_dim, fontFamily: FONT, letterSpacing: 3 },
    });
    sectionLabel.x = px + 20; sectionLabel.y = cursor;
    this._content.addChild(sectionLabel);
    cursor += 16;

    const rw = PW - 40, rx = px + 20;
    (issue.drops ?? []).forEach(d => {
      cursor = this._drawDrop(d, rx, cursor, rw);
    });

    cursor += 6;

    // ── Spotlight card ────────────────────────────────────────────────────────
    if (issue.spotlight) {
      this._drawSpotlight(issue.spotlight, rx, cursor, rw);
    }

    // ── Nav + close ───────────────────────────────────────────────────────────
    const navY  = py + PH - 44;
    const prevEnabled = this._issueIdx < NEWSLETTER_ISSUES.length - 1;
    const nextEnabled = this._issueIdx > 0;

    this._drawNavBtn('‹  Older', px + 16,  navY, 90, prevEnabled,
      () => this._setIssue(this._issueIdx + 1));
    this._drawNavBtn('Newer  ›', px + PW - 106, navY, 90, nextEnabled,
      () => this._setIssue(this._issueIdx - 1));

    const closeBtn = this._drawTextBtn('Close', cx - 40, navY, 80, 28,
      COLORS.panel_border, () => this.hide());
    this._content.addChild(closeBtn);

    // Pagination label
    const pageLbl = new Text({
      text: `${this._issueIdx + 1} / ${NEWSLETTER_ISSUES.length}`,
      style: { fontSize: 9, fill: COLORS.text_dim, fontFamily: FONT },
    });
    pageLbl.anchor.set(0.5, 0); pageLbl.x = cx; pageLbl.y = navY - 14;
    this._content.addChild(pageLbl);
  }

  _drawDrop(drop, rx, ry, rw) {
    const padX = 10;
    const iconText = new Text({
      text: drop.icon ?? '•',
      style: { fontSize: 14, fontFamily: FONT },
    });
    iconText.x = rx + padX; iconText.y = ry + 4;

    const bodyMaxW = rw - padX - 26;
    const titleTxt = new Text({
      text: drop.title ?? '',
      style: { fontSize: 12, fill: COLORS.text_primary, fontFamily: FONT, fontWeight: '600',
               wordWrap: true, wordWrapWidth: bodyMaxW },
    });
    titleTxt.x = rx + padX + 22; titleTxt.y = ry + 2;

    const bodyTxt = new Text({
      text: drop.body ?? '',
      style: { fontSize: 10, fill: COLORS.text_secondary, fontFamily: FONT,
               wordWrap: true, wordWrapWidth: bodyMaxW },
    });
    bodyTxt.x = rx + padX + 22; bodyTxt.y = ry + 2 + titleTxt.height + 2;

    const cardH = Math.max(30, 6 + titleTxt.height + 2 + bodyTxt.height + 6);

    const bg = new Graphics();
    bg.roundRect(rx, ry, rw, cardH, 6).fill({ color: 0x0a1424, alpha: 0.8 });
    bg.roundRect(rx, ry, rw, cardH, 6).stroke({ color: COLORS.panel_border, width: 1, alpha: 0.7 });

    this._content.addChild(bg);
    this._content.addChild(iconText);
    this._content.addChild(titleTxt);
    this._content.addChild(bodyTxt);

    return ry + cardH + 6;
  }

  _drawSpotlight(spotlight, rx, ry, rw) {
    const spec = resolveSpotlightSpecies(spotlight);
    const cardH = 112;

    const bg = new Graphics();
    bg.roundRect(rx, ry, rw, cardH, 8).fill({ color: 0x081428, alpha: 0.9 });
    bg.roundRect(rx, ry, rw, cardH, 8).stroke({ color: 0x5ab0ff, width: 1.5, alpha: 0.9 });
    this._content.addChild(bg);

    const header = new Text({
      text: '✦  SPECIES SPOTLIGHT',
      style: { fontSize: 9, fill: 0x9ad0ff, fontFamily: FONT, fontWeight: '700', letterSpacing: 3 },
    });
    header.x = rx + 12; header.y = ry + 10;
    this._content.addChild(header);

    const iconSz = 44;
    const iconG = new Graphics();
    const iconX = rx + 12, iconY = ry + 30;
    if (spec) {
      iconG.roundRect(iconX, iconY, iconSz, iconSz, 8).fill({ color: spec.color, alpha: 0.95 });
      const accent = spec.accentColor ?? 0xffffff;
      iconG.circle(iconX + iconSz - 8, iconY + 8, 5).fill({ color: accent, alpha: 0.9 });
      const tierColor = COLORS[`tier_${spec.tier}`] ?? 0xffffff;
      iconG.rect(iconX, iconY + iconSz - 4, iconSz, 4).fill({ color: tierColor, alpha: 0.85 });
    } else {
      iconG.roundRect(iconX, iconY, iconSz, iconSz, 8).fill({ color: 0x1a2e3e, alpha: 0.9 });
    }
    this._content.addChild(iconG);

    const nameTxt = new Text({
      text: spec?.name ?? spotlight.speciesId ?? 'Unknown',
      style: { fontSize: 14, fill: COLORS.text_primary, fontFamily: FONT, fontWeight: 'bold' },
    });
    nameTxt.x = iconX + iconSz + 12; nameTxt.y = ry + 32;
    this._content.addChild(nameTxt);

    if (spec?.scientific) {
      const sciTxt = new Text({
        text: spec.scientific,
        style: { fontSize: 9, fill: COLORS.text_dim, fontFamily: FONT, fontStyle: 'italic' },
      });
      sciTxt.x = iconX + iconSz + 12; sciTxt.y = ry + 32 + nameTxt.height + 1;
      this._content.addChild(sciTxt);
    }

    if (spec?.tier) {
      const tierColor = COLORS[`tier_${spec.tier}`] ?? 0xffffff;
      const tierTxt = new Text({
        text: TIER_LABEL[spec.tier] ?? spec.tier.toUpperCase(),
        style: { fontSize: 9, fill: tierColor, fontFamily: FONT, fontWeight: '700', letterSpacing: 2 },
      });
      tierTxt.x = iconX + iconSz + 12; tierTxt.y = ry + 32 + nameTxt.height + 14;
      this._content.addChild(tierTxt);
    }

    const blurb = new Text({
      text: spotlight.blurb ?? '',
      style: { fontSize: 10, fill: COLORS.text_secondary, fontFamily: FONT,
               wordWrap: true, wordWrapWidth: rw - 24 },
    });
    blurb.x = rx + 12; blurb.y = iconY + iconSz + 6;
    this._content.addChild(blurb);
  }

  _drawNavBtn(label, bx, by, bw, enabled, onPress) {
    const bh = 28;
    const bg = new Graphics();
    const alpha = enabled ? 0.6 : 0.2;
    bg.roundRect(bx, by, bw, bh, 6).fill({ color: COLORS.panel_border, alpha });
    bg.roundRect(bx, by, bw, bh, 6).stroke({ color: COLORS.panel_border, width: 1, alpha: 0.7 });
    this._content.addChild(bg);

    const txt = new Text({
      text: label,
      style: { fontSize: 11, fill: enabled ? COLORS.text_primary : COLORS.text_dim,
               fontFamily: FONT, fontWeight: '600' },
    });
    txt.anchor.set(0.5, 0.5); txt.x = bx + bw / 2; txt.y = by + bh / 2;
    this._content.addChild(txt);

    if (enabled) {
      const hit = new Graphics();
      hit.rect(bx, by, bw, bh).fill({ color: 0xffffff, alpha: 0 });
      hit.interactive = true;
      hit.cursor = 'pointer';
      hit.on('pointerdown', onPress);
      this._content.addChild(hit);
    }
  }

  _drawTextBtn(label, bx, by, bw, bh, color, onClick) {
    const btn = new Container();
    const bg  = new Graphics();
    bg.roundRect(0, 0, bw, bh, 6).fill({ color, alpha: 0.35 });
    bg.roundRect(0, 0, bw, bh, 6).stroke({ color, width: 1, alpha: 0.7 });
    btn.addChild(bg);

    const txt = new Text({
      text: label,
      style: { fontSize: 11, fill: COLORS.text_secondary, fontFamily: FONT },
    });
    txt.anchor.set(0.5, 0.5); txt.x = bw / 2; txt.y = bh / 2;
    btn.addChild(txt);

    btn.x = bx; btn.y = by;
    btn.interactive = true;
    btn.cursor = 'pointer';
    btn.on('pointerdown', onClick);
    return btn;
  }
}

function _formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
