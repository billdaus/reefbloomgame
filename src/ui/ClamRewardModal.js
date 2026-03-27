import { Container, Graphics, Text } from 'pixi.js';
import { SCREEN_W, SCREEN_H, COLORS, FISH_SPECIES } from '../constants.js';

const FONT      = 'system-ui, -apple-system, sans-serif';
const WATCH_MS  = 15000;  // placeholder ad duration before rewards shown
const LINGER_MS = 4000;   // auto-dismiss after this long in rewards phase

/**
 * ClamRewardModal — two-phase overlay:
 *   'watching'  → progress bar fills over WATCH_MS (simulates ad)
 *   'rewards'   → shows BE / pearls / fish earned, auto-dismisses
 */
export class ClamRewardModal {
  constructor() {
    this.container = new Container();
    this.container.visible = false;

    this._phase    = 'hidden';
    this._timer    = 0;
    this._rewards  = null;
    this._onDone   = null;

    this._overlay  = new Graphics();
    this._panel    = new Graphics();
    this._bar      = new Graphics();
    this._texts    = new Container();

    this.container.addChild(this._overlay);
    this.container.addChild(this._panel);
    this.container.addChild(this._bar);
    this.container.addChild(this._texts);

    // Tap to dismiss during rewards phase
    this._overlay.interactive = true;
    this._overlay.on('pointerdown', () => { if (this._phase === 'rewards') this._dismiss(); });
    this._panel.interactive = true;
    this._panel.on('pointerdown', () => { if (this._phase === 'rewards') this._dismiss(); });
  }

  /** Start watching phase. rewards is the already-rolled package. onDone called on dismiss. */
  show(rewards, onDone) {
    this._rewards  = rewards;
    this._onDone   = onDone;
    this._phase    = 'watching';
    this._timer    = 0;
    this.container.visible = true;
    this._render();
  }

  update(deltaMS) {
    if (this._phase === 'hidden') return;
    this._timer += deltaMS;

    if (this._phase === 'watching') {
      this._drawBar();
      if (this._timer >= WATCH_MS) {
        this._phase = 'rewards';
        this._timer = 0;
        this._render();
      }
    } else if (this._phase === 'rewards') {
      if (this._timer >= LINGER_MS) this._dismiss();
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _dismiss() {
    this._phase = 'hidden';
    this.container.visible = false;
    this._onDone?.();
    this._onDone = null;
  }

  _render() {
    this._overlay.clear();
    this._overlay.rect(0, 0, SCREEN_W, SCREEN_H).fill({ color: 0x000000, alpha: 0.55 });

    const pw = 320, ph = 200;
    const px = SCREEN_W / 2 - pw / 2;
    const py = SCREEN_H / 2 - ph / 2;

    this._panel.clear();
    this._panel.roundRect(px, py, pw, ph, 14).fill({ color: 0x080e18, alpha: 0.97 });
    this._panel.roundRect(px, py, pw, ph, 14).stroke({ color: COLORS.panel_border, width: 2 });

    this._texts.removeChildren();
    this._bar.clear();

    if (this._phase === 'watching') this._buildWatchingUI(px, py, pw, ph);
    else                            this._buildRewardsUI(px, py, pw, ph);
  }

  _drawBar() {
    if (this._phase !== 'watching') return;
    const pw = 320, ph = 200;
    const px = SCREEN_W / 2 - pw / 2;
    const py = SCREEN_H / 2 - ph / 2;
    const bx = px + 30, by = py + ph - 50, bw = pw - 60;
    const pct = Math.min(1, this._timer / WATCH_MS);

    this._bar.clear();
    this._bar.roundRect(bx, by, bw, 8, 4).fill(COLORS.harmony_empty);
    if (pct > 0) this._bar.roundRect(bx, by, bw * pct, 8, 4).fill(COLORS.be_icon);
  }

  _buildWatchingUI(px, py, pw, ph) {
    const cx = px + pw / 2;

    const title = new Text({
      text: '▶  Ad Watching...',
      style: { fontSize: 16, fill: COLORS.text_primary, fontFamily: FONT, fontWeight: 'bold' },
    });
    title.anchor.set(0.5, 0);
    title.x = cx;
    title.y = py + 46;
    this._texts.addChild(title);

    const sub = new Text({
      text: 'Thanks for supporting Reef Bloom!',
      style: { fontSize: 11, fill: COLORS.text_secondary, fontFamily: FONT },
    });
    sub.anchor.set(0.5, 0);
    sub.x = cx;
    sub.y = py + 80;
    this._texts.addChild(sub);

    // Bar drawn separately each frame in _drawBar()
  }

  _buildRewardsUI(px, py, pw, ph) {
    const cx  = px + pw / 2;
    const r   = this._rewards;
    const fishName = FISH_SPECIES[r?.fishId]?.name ?? r?.fishId ?? '?';

    const title = new Text({
      text: '🎁  Reward!',
      style: { fontSize: 18, fill: COLORS.selected_hl, fontFamily: FONT, fontWeight: 'bold' },
    });
    title.anchor.set(0.5, 0);
    title.x = cx;
    title.y = py + 22;
    this._texts.addChild(title);

    [
      `+${r?.be ?? 0} 🫧  Bubble Energy`,
      `+${r?.pearls ?? 0} 💎  Pearls`,
      `🐠  Free ${fishName}!`,
    ].forEach((txt, i) => {
      const t = new Text({
        text: txt,
        style: { fontSize: 14, fill: COLORS.text_primary, fontFamily: FONT },
      });
      t.anchor.set(0.5, 0);
      t.x = cx;
      t.y = py + 68 + i * 34;
      this._texts.addChild(t);
    });

    const hint = new Text({
      text: 'tap to dismiss',
      style: { fontSize: 9, fill: COLORS.text_dim, fontFamily: FONT },
    });
    hint.anchor.set(0.5, 0);
    hint.x = cx;
    hint.y = py + ph - 24;
    this._texts.addChild(hint);
  }
}
