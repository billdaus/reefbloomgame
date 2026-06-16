import { Graphics } from 'pixi.js';
import { TILE_SIZE } from '../constants.js';

/**
 * Coral — draws a procedural flat/minimal sprite for each species.
 * The sprite is drawn in tile-local space [0,TILE_SIZE] (pivot at base-centre,
 * GridLayer positions accordingly). Upgrade levels do NOT scale the sprite past
 * its tile — instead each level redraws with extra branchlets and polyps, so a
 * grown coral reads as fuller and more intricate while staying in its tile.
 */
export class Coral {
  constructor(speciesData, col, row, uid, level = 1) {
    this.spec   = speciesData;
    this.col    = col;
    this.row    = row;
    this.uid    = uid;
    this.level  = level;

    this.container = new Graphics();
    this.container.pivot.set(TILE_SIZE / 2, TILE_SIZE);
    this._draw();
  }

  /** Redraw the coral with the intricacy of an upgrade level (1 = base). */
  setLevel(level) {
    this.level = level;
    this._draw();
  }

  _draw() {
    const g   = this.container;
    const s   = TILE_SIZE;
    const c   = this.spec.color;
    const id  = this.spec.id;

    g.clear();

    switch (id) {
      case 'starter':      this._drawStarter(g, s, c);     break;
      case 'firetip':      this._drawFiretip(g, s, c);     break;
      case 'ghost':        this._drawGhost(g, s, c);       break;
      case 'staghorn':     this._drawStaghorn(g, s, c);    break;
      case 'finger':       this._drawFinger(g, s, c);      break;
      case 'brain':        this._drawBrain(g, s, c);       break;
      case 'lettuce':      this._drawLettuce(g, s, c);     break;
      case 'star':         this._drawStar(g, s, c);        break;
      case 'bubble':       this._drawBubble(g, s, c);      break;
      case 'candycane':    this._drawCandyCane(g, s, c);   break;
      case 'toadstool':    this._drawToadstool(g, s, c);   break;
      case 'elkhorn':      this._drawElkhorn(g, s, c);     break;
      case 'pillar':       this._drawPillar(g, s, c);      break;
      case 'table':        this._drawTable(g, s, c);       break;
      case 'rainbowCoral': this._drawRainbowCoral(g, s, c); break;
      case 'sunfire':      this._drawSunfire(g, s, c);     break;
      case 'barnacles':    this._drawBarnacles(g, s, c);     break;
      case 'redSeagrass':  this._drawRedSeagrass(g, s, c);   break;
      case 'seaweed':      this._drawSeaweed(g, s, c);       break;
      case 'seagrass':     this._drawSeagrass(g, s, c);      break;
      case 'kelp':         this._drawKelp(g, s, c);          break;
      case 'twilightBrain': this._drawTwilightBrain(g, s, c); break;
      case 'phantomPolyp': this._drawPhantomPolyp(g, s, c); break;
      case 'midnightTable':   this._drawMidnightTable(g, s, c);   break;
      case 'abyssalFan':      this._drawAbyssalFan(g, s, c);      break;
      case 'lanternCoral':    this._drawLanternCoral(g, s, c);    break;
      case 'wispCoral':       this._drawWispCoral(g, s, c);       break;
      case 'essenceVault':    this._drawStorageCoral(g, s, c);    break;
      case 'grandReservoir':  this._drawStorageCoral(g, s, c);    break;
      // Event pass exclusives
      case 'pearlOrganPipe':  this._drawPearlOrganPipe(g, s, c);  break;
      default:                this._drawGeneric(g, s, c);          break;
    }

    if (this.level > 1) this._growth(g, s, c, id, this.level);
  }

  // ── Upgrade growth — species-specific, deterministic detail per level ───────
  // Each species' growth extends its OWN motif (branches branch more, domes
  // gain concentric polyp rings, clusters add members) rather than a generic
  // overlay, so an upgraded coral reads as a fuller version of itself. All
  // additions stay within the tile.

  _growth(g, s, c, id, level) {
    switch (id) {
      // firetip / staghorn / elkhorn grow identical fanned protrusions in
      // their base draw (see _fanBranches) — no overlay growth needed.
      case 'staghorn':
      case 'firetip':
      case 'elkhorn':      break;
      // finger / candycane / pillar grow identical, evenly-spaced stalks in
      // their base draw (see _stalkCluster) — no overlay growth needed.
      case 'finger':
      case 'candycane':
      case 'pillar':       break;
      case 'lanternCoral':
      case 'pearlOrganPipe':
      case 'phantomPolyp': this._growColumns(g, s, c, level); break;
      case 'abyssalFan':   this._growFan(g, s, c, level); break;
      case 'wispCoral':    this._growBlades(g, s, c, level); break;
      // Circular / dome corals grow concentric polyp rings (and the bubble
      // coral gains more spheres) so upgrades are still visible.
      case 'brain':
      case 'twilightBrain':
      case 'rainbowCoral': this._growDome(g, s, c, level, s / 2, s * 0.56, s * 0.38); break;
      case 'star':         this._growDome(g, s, c, level, s / 2, s * 0.58, s * 0.36); break;
      case 'starter':      this._growDome(g, s, c, level, s / 2, s * 0.65, s * 0.22); break;
      case 'bubble':       this._growSpheres(g, s, c, level); break;
      case 'ghost':
      case 'lettuce':      this._growFan(g, s, c, level); break;
      case 'seagrass':
      case 'redSeagrass':
      case 'seaweed':
      case 'kelp':         this._growBlades(g, s, c, level); break;
      case 'sunfire':      this._growRadial(g, s, c, level); break;
      case 'table':
      case 'midnightTable': this._growShelf(g, s, c, level); break;
      case 'toadstool':    this._growMushroom(g, s, c, level); break;
      case 'barnacles':    this._growCrust(g, s, c, level); break;
      default:             this._growGeneric(g, s, c, level); break;
    }
  }

  /** Branching corals — add symmetric branch pairs fanning wider each level. */
  _growBranch(g, s, c, level, anchorY) {
    const gl   = Math.min(4, level - 1);
    const mid  = s / 2;
    const tip  = this._lighten(c, 0.6);
    const dark = this._darken(c, 0.22);
    for (let i = 1; i <= gl; i++) {
      const spread = 0.14 + i * 0.06 + (this._jit(i) - 0.5) * 0.06;   // jittered spread
      const topY   = Math.max(s * 0.06, anchorY - s * (0.16 + i * 0.03 + this._jit(i + 9) * 0.04));
      const w      = Math.max(2.5, 5 - i);
      const baseY  = anchorY - (this._jit(i + 3) * s * 0.08);
      for (const side of [-1, 1]) {
        const ex = mid + side * s * spread;
        // tapered branch (dark core + lighter overlay) with a small offshoot
        g.moveTo(mid, baseY).lineTo(ex, topY).stroke({ color: dark, width: w + 1, cap: 'round' });
        g.moveTo(mid, baseY).lineTo(ex, topY).stroke({ color: c, width: w, cap: 'round' });
        const ox = ex - side * s * 0.06, oy = topY + s * 0.06;
        g.moveTo(ex, topY).lineTo(ox + side * s * 0.1, oy - s * 0.12)
         .stroke({ color: c, width: Math.max(1.5, w - 1.5), cap: 'round' });
        g.circle(ex, topY, 3).fill(tip);
      }
    }
  }

  /** Column corals — interleave extra columns into the cluster. */
  _growColumns(g, s, c, level) {
    const gl    = Math.min(4, level - 1);
    const light = this._lighten(c, 0.5);
    const dark  = this._darken(c, 0.28);
    // Two stalks per upgrade level for a fuller, more complete cluster
    const offs    = [0.30, 0.70, 0.20, 0.80, 0.42, 0.58, 0.12, 0.88];
    const heights = [0.28, 0.24, 0.34, 0.20, 0.16, 0.30, 0.38, 0.26];
    const n = Math.min(offs.length, gl * 2);
    for (let i = 0; i < n; i++) {
      const cx  = s * offs[i];
      const top = s * heights[i];
      const cw  = 7 + (i % 2) * 2;
      const bot = s - 4;
      g.roundRect(cx - cw / 2, top, cw, bot - top, 4).fill(c);
      // Shaded side for roundness + faint ring segments
      g.rect(cx + cw / 2 - 2, top + 2, 2, bot - top - 4).fill({ color: dark, alpha: 0.4 });
      for (let y = top + 8; y < bot - 3; y += 9) {
        g.moveTo(cx - cw / 2 + 1, y).lineTo(cx + cw / 2 - 1, y).stroke({ color: dark, width: 1, alpha: 0.35 });
      }
      g.circle(cx, top, cw / 2 + 1).fill(light);       // lighter tip
      g.circle(cx, top, cw / 2 - 1).fill({ color: 0xffffff, alpha: 0.4 });
    }
  }

  /** Dome corals — add concentric, evenly-spaced polyp rings. */
  _growDome(g, s, c, level, cx, cy, r) {
    const gl    = Math.min(4, level - 1);
    const light = this._lighten(c, 0.55);
    const dark  = this._darken(c, 0.28);
    // grow the dome a touch so the rings sit on a fuller body
    g.circle(cx, cy, r * (1 + gl * 0.04)).fill(c);
    for (let ring = 1; ring <= gl; ring++) {
      const rr = r * (0.32 + ring * 0.17);
      const n  = 4 + ring * 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ring * 0.5;
        g.circle(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.92, 2)
         .fill(ring % 2 ? light : dark);
      }
    }
  }

  /** Bubble coral — stack additional spheres into a taller cluster. */
  _growSpheres(g, s, c, level) {
    const gl    = Math.min(4, level - 1);
    const dark  = this._darken(c, 0.30);
    const tiers = [[0.5, 0.28, 0.13], [0.38, 0.22, 0.11], [0.62, 0.22, 0.11], [0.5, 0.15, 0.1]];
    for (let i = 0; i < gl; i++) {
      const [fx, fy, fr] = tiers[i];
      const X = fx * s, Y = fy * s, R = fr * s;
      g.circle(X, Y + R * 0.18, R).fill(dark);                                  // shaded underside
      g.circle(X, Y, R).fill(c);                                                // body
      g.circle(X - R * 0.3, Y - R * 0.3, R * 0.32).fill({ color: 0xffffff, alpha: 0.85 }); // specular
    }
  }

  /** Fan corals — add symmetric fronds spreading from the base. */
  _growFan(g, s, c, level) {
    const gl    = Math.min(4, level - 1);
    const mid   = s / 2;
    const base  = s * 0.78;
    const dark  = this._darken(c, 0.2);
    const light = this._lighten(c, 0.5);
    for (let i = 1; i <= gl; i++) {
      const side = i % 2 ? -1 : 1;
      const off  = 0.1 * Math.ceil(i / 2);
      const cx   = mid + side * s * off;
      const ty   = Math.max(s * 0.08, base - s * (0.42 + 0.03 * i));
      // Main frond rib (tapered — thicker at the base)
      g.moveTo(mid, base).lineTo(cx, ty).stroke({ color: i % 2 ? c : dark, width: 2.5, cap: 'round' });
      // Two cross-veins for a netted sea-fan texture
      for (let v = 1; v <= 2; v++) {
        const t  = v / 3;
        const vx = mid + (cx - mid) * t;
        const vy = base + (ty - base) * t;
        const w  = s * 0.06 * (1 - t);
        g.moveTo(vx - w, vy).lineTo(vx + w, vy).stroke({ color: light, width: 1, alpha: 0.5 });
      }
      g.circle(cx, ty, 2).fill(light);   // glowing frond tip
    }
  }

  /** Bladed plants — add more blades to the clump. */
  _growBlades(g, s, c, level) {
    const gl    = Math.min(4, level - 1);
    const dark  = this._darken(c, 0.28);
    const light = this._lighten(c, 0.4);
    const base  = s - 2;
    const offs  = [0.28, 0.46, 0.64, 0.82];
    for (let i = 0; i < gl; i++) {
      const x    = s * offs[i % offs.length];
      const h    = s * (0.62 + 0.05 * i);
      const lean = (i % 2 ? 1 : -1) * 0.06;
      const tipX = x + lean * s;
      const tipY = base - h;
      g.moveTo(x - 3, base).lineTo(x + 3, base)
       .lineTo(tipX + 1.5, tipY).lineTo(tipX - 1.5, tipY).closePath()
       .fill(i % 2 ? c : dark);
      g.moveTo(x, base).lineTo(tipX, tipY).stroke({ color: light, width: 1, alpha: 0.5 }); // midrib
    }
  }

  /** Sunfire — add more radial spokes between the existing ones. */
  _growRadial(g, s, c, level) {
    const gl    = Math.min(4, level - 1);
    const mid   = s / 2;
    const coreY = s * 0.58;
    const n     = gl * 2;
    for (let i = 0; i < n; i++) {
      const a   = ((i + 0.5) / n) * Math.PI * 2 - Math.PI / 2;
      const len = s * (0.2 + (i % 2) * 0.08);
      g.moveTo(mid, coreY).lineTo(mid + Math.cos(a) * len, coreY + Math.sin(a) * len)
       .stroke({ color: c, width: 2.5, cap: 'round' });
    }
  }

  /** Shelf corals — denser polyps on the surface and more tendrils beneath. */
  _growShelf(g, s, c, level) {
    const gl    = Math.min(4, level - 1);
    const light = this._lighten(c, 0.4);
    const dark  = this._darken(c, 0.25);
    const n     = 4 + gl * 2;
    for (let i = 0; i < n; i++) {
      g.circle(s * 0.14 + i * (s * 0.72 / (n - 1)), s * 0.33, 2).fill(light);
    }
    for (let i = 0; i <= gl; i++) {
      const tx = s * 0.2 + i * (s * 0.6 / Math.max(1, gl));
      g.moveTo(tx, s * 0.42).lineTo(tx + (i % 2 ? 2 : -2), s * 0.42 + s * (0.06 + 0.02 * gl))
       .stroke({ color: dark, width: 1.5, alpha: 0.8, cap: 'round' });
    }
  }

  /** Toadstool — add more tentacle fringe under a fuller cap. */
  _growMushroom(g, s, c, level) {
    const gl   = Math.min(4, level - 1);
    const mid  = s / 2;
    const dark = this._darken(c, 0.2);
    const n    = gl * 2;
    for (let i = 0; i < n; i++) {
      const tx = (mid - s * 0.34) + i * (s * 0.68 / Math.max(1, n - 1));
      g.moveTo(tx, s * 0.5).lineTo(tx + (i % 2 ? 4 : -4), s * 0.63)
       .stroke({ color: dark, width: 2, cap: 'round' });
    }
  }

  /** Barnacles — encrust additional cones onto the substrate. */
  _growCrust(g, s, c, level) {
    const gl   = Math.min(4, level - 1);
    const dark = this._darken(c, 0.35);
    const yb   = s - 3;
    const xs   = [0.26, 0.42, 0.58, 0.74];
    for (let i = 0; i < gl; i++) {
      const x = s * xs[i % xs.length];
      const h = s * (0.16 + 0.03 * (i % 2));
      const bw = 9, tw = 5, yt = yb - h;
      g.moveTo(x - bw / 2, yb).lineTo(x + bw / 2, yb)
       .lineTo(x + tw / 2, yt).lineTo(x - tw / 2, yt).closePath().fill(c);
      g.rect(x - tw / 2, yt - 2, tw, 3).fill(dark);
    }
  }

  /** Fallback growth — concentric framing for species without a motif helper. */
  _growGeneric(g, s, c, level) {
    // Organic encrusting growth — a cluster of small polyp nubs creeping over
    // the coral, placed with stable per-coral jitter so it looks natural
    // rather than a geometric frame.
    const gl    = Math.min(4, level - 1);
    const light = this._lighten(c, 0.42);
    const dark  = this._darken(c, 0.25);
    const n = gl * 4;
    for (let i = 0; i < n; i++) {
      const a  = this._jit(i) * Math.PI * 2;
      const rr = s * (0.16 + this._jit(i + 50) * 0.22);
      const x  = s * 0.5 + Math.cos(a) * rr;
      const y  = s * 0.55 + Math.sin(a) * rr * 0.85;
      const r  = 2 + this._jit(i + 100) * 2.4;
      g.circle(x, y, r).fill(i % 3 === 0 ? dark : c);
      g.circle(x - r * 0.3, y - r * 0.3, r * 0.4).fill({ color: light, alpha: 0.8 });
    }
  }

  /** Stable per-coral pseudo-random in [0,1) — same every redraw, varies by coral. */
  _jit(i) {
    const x = Math.sin(this.uid * 99.71 + i * 37.13) * 43758.5453;
    return x - Math.floor(x);
  }

  // ── Staghorn — branching antler shape ──────────────────────────────────────
  _drawStaghorn(g, s, c) {
    // Two slender antler branches, each topped with an identical fan of
    // tip-nubbed prongs (one more prong per upgrade level).
    this._twoBranchFan(g, s, c, this._stalkCount(2),
      { forkFrac: 0.55, branchAng: 0.5, branchLenFrac: 0.20, fanLenFrac: 0.30,
        spread: 1.3, width: 4, trunkW: 5, tip: this._lighten(c, 0.4), tipR: 3.5 });
  }

  // ── Finger coral — rounded vertical columns ────────────────────────────────
  /**
   * Lay out `count` identical, evenly-spaced stalks across the tile and call
   * drawOne(cx, cw) for each. Stalk width shrinks as the count grows so the
   * stalks stay distinct and fit — every stalk in a cluster is identical.
   */
  _stalkCluster(s, count, baseCw, drawOne) {
    const m      = s * 0.15;
    const usable = s - 2 * m;
    // After the 3rd upgrade (level ≥ 4) split into a back + front row for depth
    const rows   = (this.level ?? 1) >= 4 ? 2 : 1;
    const counts = rows === 1 ? [count] : [Math.floor(count / 2), count - Math.floor(count / 2)];
    const maxIn  = Math.max(...counts);
    const cw     = maxIn > 1 ? Math.min(baseCw, (usable / maxIn) * 0.85) : baseCw;
    for (let row = 0; row < counts.length; row++) {
      const inRow  = counts[row];
      const isBack = rows === 2 && row === 0;     // drawn first → behind the front row
      const yShift = isBack ? -s * 0.14 : 0;
      const rcw    = isBack ? cw * 0.85 : cw;
      for (let i = 0; i < inRow; i++) {
        const cx = inRow === 1 ? s / 2 : m + rcw / 2 + (usable - rcw) * (i / (inRow - 1));
        drawOne(cx, rcw, yShift);
      }
    }
  }

  /** Stalk count for a cluster coral — grows by one per upgrade level. */
  _stalkCount(base) {
    return base + Math.min(4, (this.level ?? 1) - 1);
  }

  _drawFinger(g, s, c) {
    const light = this._lighten(c, 0.5);
    this._stalkCluster(s, this._stalkCount(3), 10, (cx, cw, yShift) => {
      const top = s * 0.16 + yShift;
      g.roundRect(cx - cw / 2, top, cw, (s - 4 + yShift) - top, cw / 2).fill(c);
      g.circle(cx, top, cw / 2 + 1).fill(light);   // lighter tip
    });
  }

  // ── Brain coral — dome with ruled lines ────────────────────────────────────
  _drawBrain(g, s, c) {
    const mid = s / 2;
    const r   = s * 0.38;
    g.circle(mid, s * 0.56, r).fill(c);
    // groove lines across dome (clip-like overlay via darker tone)
    const dark = this._darken(c, 0.3);
    for (let i = -2; i <= 2; i++) {
      const lx = mid + i * r * 0.32;
      g.moveTo(lx, s * 0.56 - Math.sqrt(Math.max(0, r*r - (i*r*0.32)*(i*r*0.32))) + 4)
       .lineTo(lx, s * 0.56 + Math.sqrt(Math.max(0, r*r - (i*r*0.32)*(i*r*0.32))) - 4)
       .stroke({ color: dark, width: 2 });
    }
  }

  // ── Lettuce coral — overlapping fans ──────────────────────────────────────
  _drawLettuce(g, s, c) {
    const mid  = s / 2;
    const base = s * 0.72;
    const dark = this._darken(c, 0.25);
    // three fan layers
    [[mid - s * 0.22, 0.55], [mid, 0.42], [mid + s * 0.22, 0.55]].forEach(([cx, topFrac]) => {
      g.moveTo(cx, base)
       .lineTo(cx - s * 0.2, s * topFrac)
       .lineTo(cx, s * (topFrac - 0.08))
       .lineTo(cx + s * 0.2, s * topFrac)
       .closePath()
       .fill(c);
      g.moveTo(cx, base)
       .lineTo(cx - s * 0.2, s * topFrac)
       .stroke({ color: dark, width: 1.5 });
      g.moveTo(cx, base)
       .lineTo(cx + s * 0.2, s * topFrac)
       .stroke({ color: dark, width: 1.5 });
    });
  }

  // ── Star coral — dome with raised dots ────────────────────────────────────
  _drawStar(g, s, c) {
    const mid = s / 2;
    g.circle(mid, s * 0.58, s * 0.36).fill(c);
    const dark = this._darken(c, 0.3);
    const dotPos = [
      [0, -0.18], [0.14, -0.06], [-0.14, -0.06],
      [0.09, 0.1], [-0.09, 0.1], [0, 0.2],
    ];
    dotPos.forEach(([dx, dy]) => {
      g.circle(mid + dx * s, s * 0.58 + dy * s, 4).fill(dark);
      g.circle(mid + dx * s, s * 0.58 + dy * s, 2.5).fill(c);
    });
  }

  // ── Bubble coral — cluster of spheres ─────────────────────────────────────
  _drawBubble(g, s, c) {
    const positions = [
      [0.3, 0.65, 0.16], [0.5, 0.58, 0.18], [0.7, 0.65, 0.16],
      [0.4, 0.45, 0.14], [0.6, 0.45, 0.14], [0.5, 0.35, 0.12],
    ];
    positions.forEach(([fx, fy, fr]) => {
      g.circle(fx * s, fy * s, fr * s).fill(c);
      g.circle(fx * s - fr * s * 0.3, fy * s - fr * s * 0.3, fr * s * 0.25)
       .fill(0xffffff);  // specular
    });
  }

  // ── Candy cane coral — striped columns ─────────────────────────────────────
  _drawCandyCane(g, s, c) {
    const accent = 0xffffff;
    this._stalkCluster(s, this._stalkCount(3), 10, (cx, cw, yShift) => {
      const top  = s * 0.14 + yShift;
      const base = s - 4 + yShift;
      g.roundRect(cx - cw / 2, top, cw, base - top, cw / 2).fill(c);
      for (let y = top + 6; y < base - 4; y += 12) {
        g.rect(cx - cw / 2, y, cw, 5).fill(accent);   // candy stripes
      }
    });
  }

  // ── Toadstool leather — wide mushroom cap ─────────────────────────────────
  _drawToadstool(g, s, c) {
    const mid  = s / 2;
    const dark = this._darken(c, 0.2);
    // stalk
    g.roundRect(mid - 6, s * 0.55, 12, s * 0.38, 4).fill(dark);
    // cap (polygon ellipse — g.ellipse is unreliable in PixiJS v8)
    g.poly(this._ellipsePts(mid, s * 0.5, s * 0.42, s * 0.18)).fill(c);
    // tentacle fringe
    for (let i = 0; i < 7; i++) {
      const tx = (mid - s * 0.38) + i * (s * 0.76 / 6);
      g.moveTo(tx, s * 0.5)
       .lineTo(tx + (i % 2 === 0 ? -4 : 4), s * 0.62)
       .stroke({ color: dark, width: 2, cap: 'round' });
    }
  }

  // ── Elkhorn — flat spreading antlers ──────────────────────────────────────
  _drawElkhorn(g, s, c) {
    // Two thick antler branches, each topped with an identical fan of
    // blunt-tipped prongs (one more prong per upgrade level).
    this._twoBranchFan(g, s, c, this._stalkCount(2),
      { forkFrac: 0.60, branchAng: 0.6, branchLenFrac: 0.16, fanLenFrac: 0.26,
        spread: 1.5, width: 8, trunkW: 8, tip: c, tipR: 4 });
  }

  // ── Pillar coral — tall ribbed column ─────────────────────────────────────
  _drawPillar(g, s, c) {
    const dark = this._darken(c, 0.25);
    this._stalkCluster(s, this._stalkCount(1), 20, (cx, cw, yShift) => {
      const top  = s * 0.06 + yShift;
      const base = s * 0.94 + yShift;
      g.roundRect(cx - cw / 2, top, cw, base - top, 6).fill(c);
      for (let y = s * 0.12 + yShift; y < base; y += 9) {   // ribs
        g.moveTo(cx - cw / 2, y).lineTo(cx + cw / 2, y).stroke({ color: dark, width: 1.5 });
      }
    });
  }

  // ── Starter coral — simple dome with polyp dots ───────────────────────────
  _drawStarter(g, s, c) {
    const mid = s / 2;
    g.circle(mid, s * 0.65, s * 0.22).fill(c);
    const light = this._lighten(c, 0.5);
    [[-0.12, -0.08], [0.12, -0.08], [0, -0.18], [0, 0.02]].forEach(([dx, dy]) => {
      g.circle(mid + dx * s, s * 0.65 + dy * s, 3.5).fill(light);
    });
  }

  // ── Firetip coral — branching with bright orange tips ─────────────────────
  /**
   * Trunk + `count` identical branches evenly fanned from the trunk top, each
   * ending in an identical tip protrusion. Shared by firetip/staghorn/elkhorn.
   */
  /**
   * Core fan: draw `count` identical branches evenly fanned around `axisAng`
   * radiating from (ox, oy), each ending in an identical tip protrusion.
   */
  _fanAt(g, ox, oy, axisAng, len, count, c, opts = {}) {
    const { spread = 1.3, width = 4, tip = null, tipR = 5, tipInner = null } = opts;
    for (let i = 0; i < count; i++) {
      const t   = count === 1 ? 0.5 : i / (count - 1);
      const ang = axisAng + (t - 0.5) * spread;
      const ex  = ox + Math.cos(ang) * len;
      const ey  = oy + Math.sin(ang) * len;
      g.moveTo(ox, oy).lineTo(ex, ey).stroke({ color: c, width, cap: 'round' });
      if (tip !== null) {
        g.circle(ex, ey, tipR).fill(tip);
        if (tipInner !== null) g.circle(ex, ey, tipR * 0.5).fill(tipInner);
      }
    }
  }

  /** Single trunk with one fan of identical branches at its top (firetip). */
  _fanBranches(g, s, c, count, opts = {}) {
    const { trunkTopFrac = 0.52, lenFrac = 0.42, trunkW = 5, ...fan } = opts;
    const mid = s / 2;
    const trunkTop = s * trunkTopFrac;
    g.moveTo(mid, s - 4).lineTo(mid, trunkTop).stroke({ color: c, width: trunkW, cap: 'round' });
    this._fanAt(g, mid, trunkTop, -Math.PI / 2, s * lenFrac, count, c, fan);
  }

  /**
   * Shared trunk that forks into two diverging branches, with an identical fan
   * of protrusions at the top of each branch (staghorn / elkhorn antlers).
   */
  _twoBranchFan(g, s, c, count, opts = {}) {
    const {
      forkFrac = 0.55, branchAng = 0.55, branchLenFrac = 0.18,
      fanLenFrac = 0.30, trunkW = 5, ...fan
    } = opts;
    const mid   = s / 2;
    const forkY = s * forkFrac;
    const bLen  = s * branchLenFrac;
    const fanLen = s * fanLenFrac;
    // shared trunk up to the fork
    g.moveTo(mid, s - 4).lineTo(mid, forkY).stroke({ color: c, width: trunkW, cap: 'round' });
    for (const dir of [-1, 1]) {
      const axis = -Math.PI / 2 + dir * branchAng;
      const bx = mid + Math.cos(axis) * bLen;
      const by = forkY + Math.sin(axis) * bLen;
      g.moveTo(mid, forkY).lineTo(bx, by).stroke({ color: c, width: trunkW, cap: 'round' });
      this._fanAt(g, bx, by, axis, fanLen, count, c, fan);
    }
  }

  _drawFiretip(g, s, c) {
    // Wide-fanning bright-tipped branches, one more per upgrade level
    this._fanBranches(g, s, c, this._stalkCount(3),
      { spread: 1.9, lenFrac: 0.42, width: 4, trunkW: 5, tip: 0xff5722, tipR: 5, tipInner: 0xffccbc });
  }

  // ── Ghost coral — pale translucent fan ────────────────────────────────────
  _drawGhost(g, s, c) {
    const mid = s / 2;
    const base = s * 0.75;
    const dark = this._darken(c, 0.15);
    for (let i = -3; i <= 3; i++) {
      const angle = Math.PI * 0.5 + i * 0.22;
      const len   = i === 0 ? s * 0.5 : s * (0.36 + Math.abs(i) * 0.02);
      g.moveTo(mid, base)
       .lineTo(mid + Math.cos(Math.PI - angle) * len, base - Math.sin(angle) * len)
       .stroke({ color: i % 2 === 0 ? c : dark, width: 2, cap: 'round' });
    }
    g.circle(mid, base, 5).fill(dark);
  }

  // ── Table coral — flat horizontal shelf on a stalk ────────────────────────
  _drawTable(g, s, c) {
    const mid  = s / 2;
    const dark = this._darken(c, 0.2);
    // Stalk
    g.roundRect(mid - 5, s * 0.42, 10, s * 0.5, 4).fill(dark);
    // Flat table top
    g.roundRect(s * 0.08, s * 0.26, s * 0.84, s * 0.16, 6).fill(c);
    // Rim highlight
    const light = this._lighten(c, 0.4);
    g.roundRect(s * 0.08, s * 0.26, s * 0.84, 3, 6).fill(light);
    // Polyp dots on surface
    for (let i = 0; i < 5; i++) {
      g.circle(s * 0.18 + i * s * 0.16, s * 0.34, 2.5).fill(dark);
    }
  }

  // ── Rainbow coral — colourful dome with banded polyps ─────────────────────
  _drawRainbowCoral(g, s, c) {
    const mid = s / 2;
    const r   = s * 0.38;
    g.circle(mid, s * 0.56, r).fill(c);
    const bands = [0xff5252, 0xff9800, 0xffeb3b, 0x66bb6a, 0x42a5f5, 0xab47bc];
    bands.forEach((bc, i) => {
      g.circle(mid + (i - 2.5) * r * 0.3, s * 0.56, r * 0.1).fill(bc);
    });
  }

  // ── Sunfire coral — radial spiky structure ────────────────────────────────
  _drawSunfire(g, s, c) {
    const mid    = s / 2;
    const coreY  = s * 0.58;
    const bright = 0xffeb3b;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const len   = i % 2 === 0 ? s * 0.34 : s * 0.22;
      g.moveTo(mid, coreY)
       .lineTo(mid + Math.cos(angle) * len, coreY + Math.sin(angle) * len)
       .stroke({ color: i % 2 === 0 ? bright : c, width: i % 2 === 0 ? 4 : 3, cap: 'round' });
    }
    g.circle(mid, coreY, s * 0.1).fill(bright);
    g.circle(mid, coreY, s * 0.05).fill(0xffffff);
  }

  // ── Barnacles — cluster of calcite cones on the substrate ────────────
  _drawBarnacles(g, s, c) {
    const dark  = this._darken(c, 0.35);
    const light = this._lighten(c, 0.28);
    const cones = [
      { x: s * 0.18, bw: 12, tw: 7,  h: s * 0.28 },
      { x: s * 0.34, bw: 10, tw: 6,  h: s * 0.22 },
      { x: s * 0.50, bw: 14, tw: 8,  h: s * 0.34 },
      { x: s * 0.66, bw:  9, tw: 5,  h: s * 0.20 },
      { x: s * 0.82, bw: 11, tw: 6,  h: s * 0.26 },
    ];
    cones.forEach(({ x, bw, tw, h }) => {
      const yb = s - 3;
      const yt = yb - h;
      // Cone body (trapezoid)
      g.moveTo(x - bw / 2, yb)
       .lineTo(x + bw / 2, yb)
       .lineTo(x + tw / 2, yt)
       .lineTo(x - tw / 2, yt)
       .closePath()
       .fill(c);
      // Operculum plate at top
      g.rect(x - tw / 2, yt - 2, tw, 3).fill(dark);
      // Highlight rib down the cone
      g.moveTo(x, yb - 2)
       .lineTo(x, yt + 2)
       .stroke({ color: light, width: 1, alpha: 0.55 });
    });
    // Substrate base
    g.rect(s * 0.06, s - 3, s * 0.88, 3).fill(dark);
  }

  // ── Red Seagrass — broad oval-tipped blades, reddish-crimson ─────────
  _drawRedSeagrass(g, s, c) {
    const dark  = this._darken(c, 0.3);
    const light = this._lighten(c, 0.22);
    const blades = [
      { x: s * 0.20, h: s * 0.68, lean: -0.09 },
      { x: s * 0.38, h: s * 0.80, lean:  0.10 },
      { x: s * 0.57, h: s * 0.86, lean: -0.06 },
      { x: s * 0.76, h: s * 0.72, lean:  0.08 },
    ];
    blades.forEach(({ x, h, lean }, i) => {
      const base = s - 2;
      const tipX = x + lean * s;
      const tipY = base - h;
      const col  = i % 2 === 0 ? c : dark;
      // Wider blade body
      g.moveTo(x - 5, base)
       .lineTo(x + 5, base)
       .lineTo(tipX + 2, tipY + h * 0.12)
       .lineTo(tipX - 2, tipY + h * 0.12)
       .closePath()
       .fill(col);
      // Rounded tip cap
      g.circle(tipX, tipY + h * 0.10, 3).fill(col);
      // Midrib
      g.moveTo(x, base)
       .lineTo(tipX, tipY)
       .stroke({ color: light, width: 1, alpha: 0.45 });
      // Two cross-veins
      for (let v = 1; v <= 2; v++) {
        const t  = v / 3;
        const vx = x + (tipX - x) * t;
        const vy = base + (tipY - base) * t;
        const vw = 4 * (1 - t) + 1;
        g.moveTo(vx - vw, vy).lineTo(vx + vw, vy)
         .stroke({ color: light, width: 1, alpha: 0.28 });
      }
    });
    g.rect(s * 0.06, s - 4, s * 0.88, 4).fill(dark);
  }

  // ── Seagrass — tall ribbon blades growing from substrate ─────────────────
  _drawSeagrass(g, s, c) {
    const dark  = this._darken(c, 0.28);
    const light = this._lighten(c, 0.3);
    // Five blades at irregular x offsets, swaying slightly
    const blades = [
      { x: s * 0.18, h: s * 0.78, lean: -0.10 },
      { x: s * 0.34, h: s * 0.88, lean:  0.06 },
      { x: s * 0.50, h: s * 0.95, lean: -0.04 },
      { x: s * 0.66, h: s * 0.84, lean:  0.12 },
      { x: s * 0.82, h: s * 0.72, lean: -0.08 },
    ];
    blades.forEach(({ x, h, lean }, i) => {
      const base  = s - 2;
      const tipX  = x + lean * s;
      const tipY  = base - h;
      const col   = i % 2 === 0 ? c : dark;
      // blade as a tapered quad
      g.moveTo(x - 4, base)
       .lineTo(x + 4, base)
       .lineTo(tipX + 1.5, tipY)
       .lineTo(tipX - 1.5, tipY)
       .closePath()
       .fill(col);
      // midrib highlight
      g.moveTo(x, base)
       .lineTo(tipX, tipY)
       .stroke({ color: light, width: 1, alpha: 0.55 });
    });
    // substrate base line
    g.rect(s * 0.06, s - 4, s * 0.88, 4).fill(dark);
  }

  // ── Seaweed — bushy wavy fronds growing from base ────────────────────────
  _drawSeaweed(g, s, c) {
    const dark  = this._darken(c, 0.3);
    const light = this._lighten(c, 0.25);
    // Four wavy frond stalks
    const fronds = [
      { x: s * 0.22, lean: -0.18, h: s * 0.62 },
      { x: s * 0.40, lean:  0.14, h: s * 0.74 },
      { x: s * 0.60, lean: -0.10, h: s * 0.68 },
      { x: s * 0.78, lean:  0.16, h: s * 0.58 },
    ];
    fronds.forEach(({ x, lean, h }, i) => {
      const base  = s - 2;
      const tipX  = x + lean * s;
      const tipY  = base - h;
      const midX  = x + lean * s * 0.5;
      const midY  = base - h * 0.5;
      const col   = i % 2 === 0 ? c : dark;
      // Wavy stalk using a quadratic bezier approximated by 3 segments
      g.moveTo(x, base)
       .lineTo(midX + (lean > 0 ? -6 : 6), midY)
       .lineTo(tipX, tipY)
       .stroke({ color: col, width: 3, cap: 'round' });
      // Small oval leaf at tip
      g.circle(tipX, tipY, 4).fill(light);
      // Two side leaflets along the stalk
      const lx1 = x + lean * s * 0.28; const ly1 = base - h * 0.28;
      const lx2 = x + lean * s * 0.60; const ly2 = base - h * 0.60;
      [{ lx: lx1, ly: ly1 }, { lx: lx2, ly: ly2 }].forEach(({ lx, ly }) => {
        g.moveTo(lx, ly).lineTo(lx + (i % 2 === 0 ? 8 : -8), ly - 5)
         .stroke({ color: light, width: 2, cap: 'round' });
      });
    });
    g.rect(s * 0.08, s - 4, s * 0.84, 4).fill(dark);
  }

  // ── Giant Kelp — tall ribbed stipe with broad paired fronds ──────────────
  _drawKelp(g, s, c) {
    const dark  = this._darken(c, 0.3);
    const light = this._lighten(c, 0.35);
    const mid   = s / 2;
    // Central stipe (slightly wavy)
    g.moveTo(mid + 2, s - 2)
     .lineTo(mid - 3, s * 0.65)
     .lineTo(mid + 3, s * 0.35)
     .lineTo(mid - 1, s * 0.05)
     .stroke({ color: dark, width: 4, cap: 'round', join: 'round' });
    // Paired blade fronds at three heights
    const bladeRows = [
      { y: s * 0.68, w: s * 0.30, h: s * 0.12, stipeOff:  2 },
      { y: s * 0.42, w: s * 0.26, h: s * 0.10, stipeOff: -2 },
      { y: s * 0.18, w: s * 0.20, h: s * 0.08, stipeOff:  2 },
    ];
    bladeRows.forEach(({ y, w, h, stipeOff }) => {
      const sx = mid + stipeOff;
      // Left blade
      g.moveTo(sx, y)
       .lineTo(sx - w, y - h * 0.4)
       .lineTo(sx - w * 0.6, y + h)
       .closePath().fill(c);
      // Right blade
      g.moveTo(sx, y)
       .lineTo(sx + w, y - h * 0.4)
       .lineTo(sx + w * 0.6, y + h)
       .closePath().fill(c);
      // Midrib on each blade
      g.moveTo(sx, y).lineTo(sx - w * 0.75, y - h * 0.2)
       .stroke({ color: light, width: 1, alpha: 0.6 });
      g.moveTo(sx, y).lineTo(sx + w * 0.75, y - h * 0.2)
       .stroke({ color: light, width: 1, alpha: 0.6 });
    });
    // Float bladders — small ovals at blade attachment points
    bladeRows.forEach(({ y, stipeOff }) => {
      g.circle(mid + stipeOff, y, 3.5).fill(light);
    });
  }

  // ── Twilight Brain Coral — glowing dome with labyrinthine grooves ─────────
  _drawTwilightBrain(g, s, c) {
    const mid   = s / 2;
    const r     = s * 0.38;
    const glow  = this._lighten(c, 0.6);
    const dark  = this._darken(c, 0.35);
    // Outer glow halo
    g.circle(mid, s * 0.56, r + 5).fill({ color: c, alpha: 0.18 });
    g.circle(mid, s * 0.56, r).fill(dark);
    // Bioluminescent grooves radiating from center
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const x1 = mid + Math.cos(angle) * r * 0.3;
      const y1 = s * 0.56 + Math.sin(angle) * r * 0.3;
      const x2 = mid + Math.cos(angle) * r * 0.88;
      const y2 = s * 0.56 + Math.sin(angle) * r * 0.88;
      g.moveTo(x1, y1).lineTo(x2, y2).stroke({ color: glow, width: 1.5, alpha: 0.9 });
    }
    g.circle(mid, s * 0.56, r * 0.18).fill(glow);
  }

  // ── Phantom Polyp — translucent tall column with glowing tips ─────────────
  _drawPhantomPolyp(g, s, c) {
    const mid   = s / 2;
    const glow  = this._lighten(c, 0.55);
    const dark  = this._darken(c, 0.2);
    const cols  = [s * 0.28, s * 0.5, s * 0.72];
    const tops  = [s * 0.18, s * 0.08, s * 0.14];
    cols.forEach((cx, i) => {
      const top = tops[i];
      const h   = s - top - 4;
      g.roundRect(cx - 5, top, 10, h, 5).fill({ color: dark, alpha: 0.7 });
      // Glow vein running up center
      g.moveTo(cx, top + h * 0.7).lineTo(cx, top + 4)
       .stroke({ color: glow, width: 1.5, alpha: 0.8 });
      // Glowing tip
      g.circle(cx, top, 5).fill({ color: glow, alpha: 0.9 });
      g.circle(cx, top, 3).fill(0xffffff);
    });
  }

  // ── Midnight Table Coral — dark shelf with bioluminescent edge trim ────────
  _drawMidnightTable(g, s, c) {
    const mid  = s / 2;
    const dark = this._darken(c, 0.4);
    const glow = this._lighten(c, 0.6);
    // Stalk
    g.roundRect(mid - 5, s * 0.42, 10, s * 0.5, 4).fill(dark);
    // Table surface — very dark
    g.roundRect(s * 0.08, s * 0.26, s * 0.84, s * 0.16, 6).fill(dark);
    // Glowing edge outline
    g.roundRect(s * 0.08, s * 0.26, s * 0.84, s * 0.16, 6)
     .stroke({ color: glow, width: 2, alpha: 0.85 });
    // Bioluminescent dots on the surface
    for (let i = 0; i < 5; i++) {
      g.circle(s * 0.18 + i * s * 0.16, s * 0.34, 2.5).fill(glow);
    }
    // Hanging tendrils under the shelf
    for (let i = 0; i < 4; i++) {
      const tx = s * 0.2 + i * s * 0.2;
      g.moveTo(tx, s * 0.42).lineTo(tx + (i % 2 ? 2 : -2), s * 0.52)
       .stroke({ color: glow, width: 1.5, alpha: 0.7, cap: 'round' });
    }
  }

  // ── Abyssal Fan — glowing sea fan of curved ribs ──────────────────────────
  _drawAbyssalFan(g, s, c) {
    const mid = s / 2;
    const base = s * 0.9;
    const glow = this._lighten(c, 0.55);
    g.circle(mid, base, s * 0.42).fill({ color: c, alpha: 0.12 });   // halo
    for (let i = -3; i <= 3; i++) {
      const ang = Math.PI * 0.5 + i * 0.24;
      const len = s * (0.5 - Math.abs(i) * 0.04);
      const tx  = mid + Math.cos(Math.PI - ang) * len;
      const ty  = base - Math.sin(ang) * len;
      g.moveTo(mid, base).lineTo(tx, ty)
       .stroke({ color: i % 2 === 0 ? c : glow, width: 2.5, cap: 'round' });
      g.circle(tx, ty, 2.4).fill(glow);   // glowing tip polyp
    }
    g.circle(mid, base, 5).fill(this._darken(c, 0.3));
  }

  // ── Lantern Coral — tall stalk hung with luminous bulbs ───────────────────
  _drawLanternCoral(g, s, c) {
    const mid  = s / 2;
    const dark = this._darken(c, 0.35);
    const glow = this._lighten(c, 0.6);
    g.roundRect(mid - 4, s * 0.1, 8, s * 0.82, 4).fill(dark);   // stalk
    const bulbs = [[mid - 9, 0.3], [mid + 9, 0.45], [mid - 8, 0.6], [mid + 7, 0.74]];
    bulbs.forEach(([bx, fy]) => {
      g.moveTo(mid, s * fy - 4).lineTo(bx, s * fy).stroke({ color: dark, width: 1.5 });
      g.circle(bx, s * fy + 4, 5).fill({ color: c, alpha: 0.9 });
      g.circle(bx, s * fy + 4, 2.4).fill(glow);
    });
    g.circle(mid, s * 0.1, 4).fill(glow);   // crown light
  }

  // ── Wisp Coral — low cluster of wispy luminous tendrils ───────────────────
  _drawWispCoral(g, s, c) {
    const dark = this._darken(c, 0.2);
    const glow = this._lighten(c, 0.6);
    const base = s * 0.92;
    const stalks = [0.28, 0.42, 0.56, 0.7];
    stalks.forEach((fx, i) => {
      const x   = s * fx;
      const h   = s * (0.4 + (i % 2) * 0.16);
      const sway = (i % 2 ? 1 : -1) * s * 0.08;
      g.moveTo(x, base)
       .lineTo(x + sway * 0.5, base - h * 0.5)
       .lineTo(x + sway, base - h)
       .stroke({ color: i % 2 ? c : dark, width: 2, cap: 'round' });
      g.circle(x + sway, base - h, 3).fill({ color: glow, alpha: 0.9 });
      g.circle(x + sway, base - h, 1.4).fill(0xffffff);
    });
    g.circle(s * 0.5, base, s * 0.14).fill({ color: c, alpha: 0.15 });
  }

  // ── Storage coral — a coral-encrusted vault/urn holding glowing essence ────
  _drawStorageCoral(g, s, c) {
    const mid  = s / 2;
    const dark = this._darken(c, 0.35);
    const light = this._lighten(c, 0.45);
    // Urn body
    g.moveTo(s * 0.3, s * 0.92)
     .lineTo(s * 0.24, s * 0.5)
     .quadraticCurveTo(mid, s * 0.34, s * 0.76, s * 0.5)
     .lineTo(s * 0.7, s * 0.92)
     .closePath().fill(c);
    g.moveTo(s * 0.24, s * 0.5).quadraticCurveTo(mid, s * 0.34, s * 0.76, s * 0.5)
     .stroke({ color: dark, width: 2 });
    // Rim
    g.roundRect(s * 0.22, s * 0.44, s * 0.56, 6, 3).fill(dark);
    // Glowing essence pooled inside
    g.circle(mid, s * 0.6, s * 0.16).fill({ color: 0x90e8ff, alpha: 0.3 });
    g.circle(mid, s * 0.6, s * 0.09).fill({ color: 0xc8f4ff, alpha: 0.85 });
    // Rising essence motes
    [[0.44, 0.5], [0.5, 0.42], [0.57, 0.5]].forEach(([fx, fy]) => {
      g.circle(s * fx, s * fy, 1.8).fill({ color: 0xe4fcff, alpha: 0.9 });
    });
    // Coral nubs along the rim
    [0.3, 0.5, 0.7].forEach(fx => g.circle(s * fx, s * 0.44, 3).fill(light));
  }

  // ── Generic fallback ──────────────────────────────────────────────────────
  _drawGeneric(g, s, c) {
    g.roundRect(s * 0.2, s * 0.2, s * 0.6, s * 0.6, 8).fill(c);
  }

  // ── Helper: darken a hex color ────────────────────────────────────────────
  _darken(hex, amount) {
    const r = Math.floor(((hex >> 16) & 0xff) * (1 - amount));
    const g = Math.floor(((hex >> 8)  & 0xff) * (1 - amount));
    const b = Math.floor((hex & 0xff) * (1 - amount));
    return (r << 16) | (g << 8) | b;
  }

  // ── Helper: lighten a hex color ────────────────────────────────────────────
  _lighten(hex, amount) {
    const r = Math.min(255, Math.floor(((hex >> 16) & 0xff) + (255 - ((hex >> 16) & 0xff)) * amount));
    const g = Math.min(255, Math.floor(((hex >> 8)  & 0xff) + (255 - ((hex >> 8)  & 0xff)) * amount));
    const b = Math.min(255, Math.floor((hex & 0xff)          + (255 - (hex & 0xff))          * amount));
    return (r << 16) | (g << 8) | b;
  }

  // ── Event pass exclusives ──────────────────────────────────────────────────

  /**
   * Pearl Organ Pipe — a cluster of tall ivory tubes with iridescent nacre tips
   * and small star-shaped polyps at each opening.
   */
  _drawPearlOrganPipe(g, s, c) {
    const w = s * 0.45;
    const h = s * 0.9;
    // Tube layout: 5 tubes of varying heights in a tight cluster
    const tubes = [
      { ox: -w * 0.58, h: h * 0.72, r: w * 0.22 },
      { ox: -w * 0.22, h: h * 0.92, r: w * 0.25 },
      { ox:  w * 0.15, h: h * 1.0,  r: w * 0.28 },
      { ox:  w * 0.50, h: h * 0.80, r: w * 0.22 },
      { ox:  w * 0.82, h: h * 0.62, r: w * 0.20 },
    ];

    // Draw tube bodies
    tubes.forEach(({ ox, h: th, r }) => {
      // Tube wall (rounded rect)
      g.roundRect(ox - r, -th, r * 2, th, r * 0.9)
       .fill({ color: c, alpha: 0.95 });
      // Inner shadow / hollow depth
      g.roundRect(ox - r * 0.55, -th + r * 0.5, r * 1.1, th - r * 0.6, r * 0.5)
       .fill({ color: 0x8a7060, alpha: 0.35 });
      // Tube ridge lines (longitudinal)
      for (let ridgeX = -r * 0.4; ridgeX <= r * 0.4; ridgeX += r * 0.4) {
        g.rect(ox + ridgeX, -th + 4, 1.5, th - 8)
         .fill({ color: 0xffffff, alpha: 0.18 });
      }
    });

    // Draw nacre / iridescent rim at each tube opening
    tubes.forEach(({ ox, h: th, r }) => {
      g.circle(ox, -th, r * 1.05)
       .fill({ color: 0xd4c5b0, alpha: 0.9 });
      g.circle(ox, -th, r * 0.78)
       .fill({ color: 0x8a7060, alpha: 0.8 });   // opening depth
      // Pearlescent highlight arc (top-left quadrant)
      g.poly([
        ox - r * 0.8, -th - r * 0.3,
        ox - r * 0.15, -th - r * 0.85,
        ox + r * 0.15, -th - r * 0.65,
        ox - r * 0.35, -th - r * 0.2,
      ]).fill({ color: 0xffffff, alpha: 0.45 });

      // 8-pointed polyp star
      const starPts = [];
      for (let i = 0; i < 8; i++) {
        const a    = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const rStar = i % 2 === 0 ? r * 0.55 : r * 0.28;
        starPts.push(ox + Math.cos(a) * rStar, -th + Math.sin(a) * rStar);
      }
      g.poly(starPts).fill({ color: 0xffe8d8, alpha: 0.85 });
    });

    // Encrusting base connecting the tubes
    g.roundRect(-w * 0.75, -s * 0.12, w * 1.68, s * 0.14, 4)
     .fill({ color: c, alpha: 0.75 });
    g.roundRect(-w * 0.75, -s * 0.12, w * 1.68, s * 0.14, 4)
     .stroke({ color: 0xd4c5b0, width: 1 });
  }

  // ── Helper: polygon ellipse (g.ellipse unreliable in PixiJS v8) ────────────
  _ellipsePts(cx, cy, rx, ry, steps = 18) {
    const pts = [];
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      pts.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
    }
    return pts;
  }
}
