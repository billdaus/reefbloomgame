import { Container, Graphics } from 'pixi.js';
import { GRID_X, GRID_Y, GRID_W, GRID_H, TILE_SIZE } from '../constants.js';
import { tileCenter, getOccupiedTiles } from '../utils/grid.js';

const MARGIN    = 10;
const DAMPEN    = 0.96;
const STEER     = 0.12;
const REPULSE_R = TILE_SIZE * 1.2;   // radius to start avoiding coral

/** Fish — procedural sprite + simple wander AI. */
export class Fish {
  constructor(speciesData, col, row, uid) {
    this.spec      = speciesData;
    this.speciesId = speciesData.id;
    this.uid       = uid;
    this.layer     = speciesData.layer;  // 'A' | 'B'

    // Spawn near the given home tile
    const center   = tileCenter(col, row);
    this.x         = center.x + (Math.random() - 0.5) * TILE_SIZE;
    this.y         = center.y + (Math.random() - 0.5) * TILE_SIZE;
    this.vx        = (Math.random() - 0.5) * speciesData.speed;
    this.vy        = (Math.random() - 0.5) * speciesData.speed;
    this.targetX   = this.x;
    this.targetY   = this.y;
    this.targetAge = 0;
    this.pickTargetCooldown = 0;
    this._angle    = Math.atan2(this.vy || 0, this.vx || 1); // facing angle

    this.container = new Container();
    this._body     = new Graphics();
    this.container.addChild(this._body);
    this._drawBody();

    this.container.x = this.x;
    this.container.y = this.y;
  }

  // ── Drawing ───────────────────────────────────────────────────────────────

  _drawBody() {
    const g   = this._body;
    const sz  = this.spec.size;
    const c   = this.spec.color;
    const ac  = this.spec.accentColor;
    const id  = this.spec.id;

    g.clear();

    switch (id) {
      // Common
      case 'blueChromis':       this._drawOvalFish(g, sz, c, ac, false);  break;
      case 'chromis':           this._drawOvalFish(g, sz, c, ac, false);  break;
      // Uncommon
      case 'zebraGoby':         this._drawZebraGoby(g, sz, c, ac);        break;
      case 'cardinalfish':      this._drawOvalFish(g, sz, c, ac, false);  break;
      // Rare
      case 'clownfish':         this._drawOvalFish(g, sz, c, ac, true);   break;
      case 'yellowTang':        this._drawDiscFish(g, sz, c, ac);         break;
      case 'blueTang':          this._drawDiscFish(g, sz, c, ac);         break;
      case 'octopus':           this._drawOctopus(g, sz, c, ac);          break;
      case 'horseshoeCrab':   this._drawHorseshoeCrab(g, sz, c, ac);   break;
      case 'pipefish':        this._drawPipefish(g, sz, c, ac);        break;
      case 'sandDollar':      this._drawSandDollar(g, sz, c, ac);      break;
      case 'conch':           this._drawConch(g, sz, c, ac);           break;
      case 'pufferfish':      this._drawPufferfish(g, sz, c, ac);      break;
      case 'spottedEagleRay': this._drawSpottedEagleRay(g, sz, c, ac); break;
      case 'dugong':          this._drawDugong(g, sz, c, ac);          break;
      case 'tropicBlenny':    this._drawTropicBlenny(g, sz, c, ac);    break;
      case 'seaUrchin':       this._drawSeaUrchin(g, sz, c, ac);       break;
      case 'parrotfish':      this._drawParrotfish(g, sz, c, ac);      break;
      case 'rabbitfish':      this._drawRabbitfish(g, sz, c, ac);      break;
      case 'cleanerShrimp':   this._drawCleanerShrimp(g, sz, c, ac);   break;
      case 'mantaRay':        this._drawMantaRay(g, sz, c, ac);        break;
      case 'manatee':         this._drawManatee(g, sz, c, ac);         break;
      case 'seaTurtle':       this._drawSeaTurtle(g, sz, c, ac);       break;
      // Super Rare
      case 'moorishIdol':       this._drawIdol(g, sz, c, ac);              break;
      case 'dolphin':           this._drawDolphin(g, sz, c, ac);           break;
      case 'shark':             this._drawReefShark(g, sz, c, ac);         break;
      case 'butterflyfish':     this._drawDiscFish(g, sz, c, 0xffcc02);   break;
      case 'zebrafish':         this._drawZebrafish(g, sz, c, ac);        break;
      case 'seahorse':          this._drawSeahorse(g, sz, c, ac);         break;
      // Epic
      case 'cuttlefish':        this._drawCuttlefish(g, sz, c, ac);       break;
      case 'morayEel':          this._drawEel(g, sz, c, ac);              break;
      // Pearl
      case 'rainbowGoby':       this._drawOvalFish(g, sz, c, ac, false);  break;
      case 'glowfinAngelfish':  this._drawGlowfinAngel(g, sz, c, ac);     break;
      case 'neonSeahorse':      this._drawSeahorse(g, sz, c, ac);         break;
      case 'sunburstWrasse':    this._drawOvalFish(g, sz, c, ac, false);  break;
      case 'phantomLionfish':   this._drawLionfish(g, sz, c, ac);           break;
      // v0.3 Coral Reef Expansion
      case 'neonGoby':          this._drawNeonGoby(g, sz, c, ac);          break;
      case 'firefish':          this._drawFirefish(g, sz, c, ac);          break;
      case 'damselfish':        this._drawDamselfish(g, sz, c, ac);        break;
      case 'royalGramma':       this._drawRoyalGramma(g, sz, c, ac);       break;
      case 'pajamaCardinalfish': this._drawPajamaCardinalfish(g, sz, c, ac); break;
      case 'shrimpGoby':        this._drawShrimpGoby(g, sz, c, ac);        break;
      case 'banggaiCardinalfish': this._drawBanggaiCardinalfish(g, sz, c, ac); break;
      case 'cleanerWrasse':     this._drawCleanerWrasse(g, sz, c, ac);     break;
      case 'flameAngelfish':    this._drawFlameAngelfish(g, sz, c, ac);    break;
      case 'mandarinfish':      this._drawMandarinfish(g, sz, c, ac);      break;
      case 'harlequinTuskfish': this._drawHarlequinTuskfish(g, sz, c, ac); break;
      case 'blueRibbonEel':     this._drawBlueRibbonEel(g, sz, c, ac);    break;
      case 'napoleonWrasse':    this._drawNapoleonWrasse(g, sz, c, ac);    break;
      case 'giantMoray':        this._drawGiantMoray(g, sz, c, ac);        break;
      // Deep Twilight
      case 'lanternfish':       this._drawLanternfish(g, sz, c, ac);       break;
      case 'ghostGoby':         this._drawGhostGoby(g, sz, c, ac);         break;
      case 'hatchetfish':       this._drawHatchetfish(g, sz, c, ac);       break;
      case 'deepBlenny':        this._drawDeepBlenny(g, sz, c, ac);        break;
      case 'dragonfish':        this._drawDragonfish(g, sz, c, ac);        break;
      case 'flashlightFish':    this._drawFlashlightFish(g, sz, c, ac);    break;
      case 'viperfish':         this._drawViperfish(g, sz, c, ac);         break;
      case 'barreleye':         this._drawBarreleye(g, sz, c, ac);         break;
      case 'ribbonfish':        this._drawRibbonfish(g, sz, c, ac);        break;
      case 'twilightSeahorse':  this._drawSeahorse(g, sz, c, ac);          break;
      case 'moonSeahorse':      this._drawMoonSeahorse(g, sz, c, ac);      break;
      case 'glowEel':           this._drawGlowEel(g, sz, c, ac);           break;
      case 'anglerfish':        this._drawAnglerfish(g, sz, c, ac);        break;
      case 'gulperEel':         this._drawGulperEel(g, sz, c, ac);         break;
      case 'fangtooth':         this._drawFangtooth(g, sz, c, ac);         break;
      case 'frilledShark':      this._drawFrilledShark(g, sz, c, ac);      break;
      case 'giantSquid':        this._drawGiantSquid(g, sz, c, ac);        break;
      case 'nautilus':          this._drawNautilus(g, sz, c, ac);          break;
      case 'abyssalRay':        this._drawAbyssalRay(g, sz, c, ac);        break;
      case 'oarfish':           this._drawOarfish(g, sz, c, ac);           break;
      case 'twilightWhaleShark': this._drawTwilightWhaleShark(g, sz, c, ac); break;
      // Event pass exclusives
      case 'sakuraAnthias':     this._drawSakuraAnthias(g, sz, c, ac);     break;
      case 'opah':              this._drawOpah(g, sz, c, ac);              break;
      default:                  this._drawOvalFish(g, sz, c, ac, false);   break;
    }
  }

  /**
   * Reliable polygon ellipse — PixiJS v8 `g.ellipse()` can be unreliable.
   * Use this instead. Does NOT call fill/stroke — caller does that.
   */
  _ellipse(g, cx, cy, hw, hh, steps = 20) {
    const pts = [];
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      pts.push(cx + Math.cos(a) * hw, cy + Math.sin(a) * hh);
    }
    g.poly(pts);
  }

  /** Generic oval fish (body + tail + dorsal + eye). Drawn facing right. */
  _drawOvalFish(g, sz, bodyColor, accentColor, hasStripes) {
    const hw = sz;
    const hh = sz * 0.55;

    // Tail (V shape behind body)
    g.moveTo(-hw * 0.7, 0)
     .lineTo(-hw * 1.35, -hh * 0.95)
     .lineTo(-hw * 1.35,  hh * 0.95)
     .closePath().fill(bodyColor);

    // Body oval
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);

    if (hasStripes) {
      // White stripes (clownfish) — drawn as narrow rects clipped visually by the oval
      g.rect(-hw * 0.15, -hh + 2, hw * 0.17, hh * 2 - 4).fill(accentColor);
      g.rect( hw * 0.35, -hh + 2, hw * 0.17, hh * 2 - 4).fill(accentColor);
      // Re-fill body at low alpha to visually soften stripe edges (no real clip)
      this._ellipse(g, 0, 0, hw, hh);
      g.fill({ color: bodyColor, alpha: 0.25 });
    }

    // Dorsal fin
    g.moveTo(-hw * 0.1, -hh)
     .lineTo( hw * 0.12, -hh - sz * 0.38)
     .lineTo( hw * 0.52, -hh)
     .closePath().fill(bodyColor);

    // Eye
    g.circle(hw * 0.5,  -hh * 0.1,  sz * 0.13).fill(0xffffff);
    g.circle(hw * 0.52, -hh * 0.09, sz * 0.08).fill(0x111111);
  }

  /** Wide disc fish (tang, butterflyfish). */
  _drawDiscFish(g, sz, bodyColor, accentColor) {
    const hw = sz;
    const hh = sz * 0.78;

    // Tail
    g.moveTo(-hw * 0.62, 0)
     .lineTo(-hw * 1.22, -hh * 0.82)
     .lineTo(-hw * 1.22,  hh * 0.82)
     .closePath().fill(bodyColor);

    // Body
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);

    // Accent stripe
    g.rect(-hw * 0.05, -hh + 2, hw * 0.17, hh * 2 - 4).fill(accentColor);

    // Dorsal fin
    g.moveTo(-hw * 0.18, -hh)
     .lineTo( hw * 0.16, -hh - sz * 0.42)
     .lineTo( hw * 0.62, -hh)
     .closePath().fill(bodyColor);

    g.circle(hw * 0.56, -hh * 0.15, sz * 0.12).fill(0xffffff);
    g.circle(hw * 0.58, -hh * 0.13, sz * 0.07).fill(0x111111);
  }

  /**
   * Moorish Idol — distinctive tall disc fish.
   * Black base → white front section → black middle band → yellow snout.
   * Long white dorsal filament.
   */
  _drawIdol(g, sz, bodyColor, accentColor) {
    const bw = sz * 1.15;  // half-width of disc
    const bh = sz * 1.8;   // total height

    // Forked tail
    g.moveTo(-bw, 0)
     .lineTo(-bw - sz * 0.62, -sz * 0.7)
     .lineTo(-bw - sz * 0.16, -sz * 0.08)
     .closePath().fill(0x111111);
    g.moveTo(-bw, 0)
     .lineTo(-bw - sz * 0.62,  sz * 0.7)
     .lineTo(-bw - sz * 0.16,  sz * 0.08)
     .closePath().fill(0x111111);

    // Full disc body (black base)
    this._ellipse(g, 0, 0, bw, bh / 2);
    g.fill(0x111111);

    // White front section
    this._ellipse(g, bw * 0.22, 0, bw * 0.78, bh * 0.44);
    g.fill(bodyColor);

    // Black middle band
    g.rect(-bw * 0.1, -bh * 0.46, bw * 0.22, bh * 0.92).fill(0x111111);

    // Yellow snout
    this._ellipse(g, bw * 0.72, 0, bw * 0.3, bh * 0.35);
    g.fill(accentColor);

    // Dorsal fin base (black)
    g.moveTo(-bw * 0.18, -bh * 0.5)
     .lineTo( bw * 0.08, -bh * 0.5)
     .lineTo( bw * 0.02, -bh * 0.5 - sz * 0.38)
     .closePath().fill(0x111111);

    // Long trailing dorsal filament
    g.moveTo(bw * 0.02, -bh * 0.5 - sz * 0.32)
     .lineTo(bw * 0.16, -bh * 0.5 - sz * 2.1)
     .stroke({ color: 0xdedede, width: 1.5, cap: 'round' });

    // Pelvic fin (black, hangs below)
    g.moveTo(-bw * 0.06, bh * 0.44)
     .lineTo( bw * 0.1,  bh * 0.5)
     .lineTo( bw * 0.08, bh * 0.5 + sz * 0.38)
     .closePath().fill(0x111111);

    // Eye (in white section)
    g.circle(bw * 0.42, -bh * 0.06, sz * 0.12).fill(0xffffff);
    g.circle(bw * 0.44, -bh * 0.05, sz * 0.07).fill(0x111111);
  }

  /** Seahorse — segmented trunk, spiral tail, coronet, snout. */
  _drawSeahorse(g, sz, bodyColor, accentColor) {
    const dark = this._darken(bodyColor, 0.22);
    const bw = sz * 0.55;
    const bh = sz * 1.05;

    // ── Trunk — convex on snout (right) side, flat on dorsal (left) side ──
    g.moveTo(-bw * 0.38, -bh * 0.50)
     .lineTo( bw * 0.40, -bh * 0.50)
     .lineTo( bw * 0.52, -bh * 0.28)  // chest bulge
     .lineTo( bw * 0.50,  bh * 0.05)  // belly right
     .lineTo( bw * 0.30,  bh * 0.30)  // lower trunk right
     .lineTo( bw * 0.12,  bh * 0.50)  // tail junction right
     .lineTo(-bw * 0.10,  bh * 0.50)  // tail junction left
     .lineTo(-bw * 0.32,  bh * 0.28)  // lower trunk left
     .lineTo(-bw * 0.40,  bh * 0.00)  // belly left
     .lineTo(-bw * 0.42, -bh * 0.28)  // chest left
     .closePath().fill(bodyColor);

    // Bony rings — 7 stripes, narrowing toward tail, each with a dorsal spine
    const ringYs = [-0.30, -0.13, 0.03, 0.17, 0.30, 0.39, 0.46].map(t => t * bh);
    ringYs.forEach((ry, i) => {
      const taper = 1 - i / ringYs.length * 0.36;
      const xR =  bw * 0.50 * taper;
      const xL = -bw * 0.40 * taper;
      g.moveTo(xL, ry).lineTo(xR, ry)
       .stroke({ color: dark, width: 1.3, cap: 'round' });
      g.moveTo(xL, ry)
       .lineTo(xL - sz * 0.09, ry - sz * 0.06)
       .stroke({ color: accentColor, width: 1.1, cap: 'round' });
    });

    // ── Spiral tail ─────────────────────────────────────────────────────
    const scx = bw * 0.28, scy = bh * 0.50 + sz * 0.34;
    const r0 = sz * 0.27, steps = 48;
    const totalAngle = Math.PI * 3.0, startAngle = -Math.PI * 1.25;

    g.moveTo(0, bh * 0.50);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      g.lineTo(scx + Math.cos(startAngle + t * totalAngle) * r0 * (1 - t * 0.70),
               scy + Math.sin(startAngle + t * totalAngle) * r0 * (1 - t * 0.70));
    }
    g.stroke({ color: bodyColor, width: sz * 0.22, cap: 'round', join: 'round' });

    // Tail ring outlines
    g.moveTo(0, bh * 0.50);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      g.lineTo(scx + Math.cos(startAngle + t * totalAngle) * r0 * (1 - t * 0.70),
               scy + Math.sin(startAngle + t * totalAngle) * r0 * (1 - t * 0.70));
    }
    g.stroke({ color: dark, width: 1.0, cap: 'round', join: 'round' });

    // ── Dorsal fin — fan shape with radiating rays ───────────────────────
    const dfx = -bw * 0.44, dfy = -bh * 0.18;
    g.moveTo(dfx, dfy + sz * 0.10)
     .lineTo(dfx - sz * 0.28, dfy - sz * 0.08)
     .lineTo(dfx - sz * 0.16, dfy - sz * 0.36)
     .lineTo(dfx + sz * 0.04, dfy - sz * 0.28)
     .lineTo(dfx + sz * 0.10, dfy - sz * 0.04)
     .closePath().fill({ color: accentColor, alpha: 0.72 });
    [[sz * 0.22, sz * 0.28], [sz * 0.28, sz * 0.38], [sz * 0.20, sz * 0.14]].forEach(([rx, ry]) => {
      g.moveTo(dfx, dfy + sz * 0.06)
       .lineTo(dfx - rx, dfy - ry)
       .stroke({ color: accentColor, width: 0.8, alpha: 0.55 });
    });

    // ── Pectoral fin — small fan behind gills ────────────────────────────
    g.moveTo(bw * 0.48, -bh * 0.30)
     .lineTo(bw * 0.48 + sz * 0.20, -bh * 0.40)
     .lineTo(bw * 0.48 + sz * 0.26, -bh * 0.24)
     .lineTo(bw * 0.48 + sz * 0.14, -bh * 0.17)
     .closePath().fill({ color: accentColor, alpha: 0.60 });

    // ── Head ────────────────────────────────────────────────────────────
    this._ellipse(g, bw * 0.05, -bh * 0.56, bw * 0.46, bw * 0.30);
    g.fill(bodyColor);

    // ── Coronet — 4 tapered spines with knob tips ────────────────────────
    const crx = bw * 0.00, cry = -bh * 0.50;
    [
      [-sz * 0.10, -sz * 0.22],
      [-sz * 0.02, -sz * 0.27],
      [ sz * 0.08, -sz * 0.23],
      [ sz * 0.16, -sz * 0.14],
    ].forEach(([dx, dy]) => {
      g.moveTo(crx, cry)
       .lineTo(crx + dx, cry + dy)
       .stroke({ color: accentColor, width: 2.2, cap: 'round' });
      g.circle(crx + dx, cry + dy, sz * 0.055).fill(accentColor);
    });

    // ── Snout — parallel-sided tube ──────────────────────────────────────
    const snx = bw * 0.44, sny = -bh * 0.31;
    g.moveTo(snx, sny - sz * 0.055)
     .lineTo(snx + sz * 0.55, sny - sz * 0.028)
     .lineTo(snx + sz * 0.55, sny + sz * 0.028)
     .lineTo(snx, sny + sz * 0.055)
     .closePath().fill(dark);

    // ── Eye — iris ring + pupil + specular highlight ──────────────────────
    g.circle(bw * 0.26, -bh * 0.42, sz * 0.13).fill(accentColor);
    g.circle(bw * 0.26, -bh * 0.42, sz * 0.09).fill(0xffffff);
    g.circle(bw * 0.27, -bh * 0.415, sz * 0.065).fill(0x111111);
    g.circle(bw * 0.30, -bh * 0.428, sz * 0.025).fill(0xffffff);
  }

  /** Cuttlefish — elongated mantle with undulating lateral fins, arms, and W-pupil eye. */
  _drawCuttlefish(g, sz, bodyColor, accentColor) {
    const mw = sz * 1.5;   // mantle half-length
    const mh = sz * 0.52;  // mantle half-height

    // Undulating lateral fins (top and bottom)
    g.moveTo(-mw * 0.68, -mh * 0.5)
     .lineTo(-mw * 0.35, -mh * 0.95)
     .lineTo( mw * 0.0,  -mh * 0.78)
     .lineTo( mw * 0.35, -mh * 0.92)
     .lineTo( mw * 0.65, -mh * 0.5)
     .closePath().fill({ color: accentColor, alpha: 0.5 });
    g.moveTo(-mw * 0.68,  mh * 0.5)
     .lineTo(-mw * 0.35,  mh * 0.95)
     .lineTo( mw * 0.0,   mh * 0.78)
     .lineTo( mw * 0.35,  mh * 0.92)
     .lineTo( mw * 0.65,  mh * 0.5)
     .closePath().fill({ color: accentColor, alpha: 0.5 });

    // Mantle body
    this._ellipse(g, 0, 0, mw, mh);
    g.fill(bodyColor);

    // Chromatophore patches
    [
      [-mw * 0.45, -mh * 0.22], [-mw * 0.15, -mh * 0.3],
      [ mw * 0.18, -mh * 0.18], [ mw * 0.42, -mh * 0.24],
      [-mw * 0.28,  mh * 0.18], [ mw * 0.1,   mh * 0.25],
      [ mw * 0.38,  mh * 0.18],
    ].forEach(([cx, cy]) => {
      g.circle(cx, cy, sz * 0.09).fill({ color: accentColor, alpha: 0.5 });
    });

    // Arms (8 short)
    [-mh * 0.3, -mh * 0.1, mh * 0.1, mh * 0.3].forEach(ay => {
      g.moveTo(mw * 0.68, ay)
       .lineTo(mw * 0.92, ay * 1.5)
       .stroke({ color: this._darken(bodyColor, 0.15), width: 2, cap: 'round' });
    });
    // 2 longer feeding tentacles
    g.moveTo(mw * 0.7, -mh * 0.08).lineTo(mw * 1.12, -mh * 0.06)
     .stroke({ color: bodyColor, width: 2.5, cap: 'round' });
    g.moveTo(mw * 0.7,  mh * 0.08).lineTo(mw * 1.12,  mh * 0.06)
     .stroke({ color: bodyColor, width: 2.5, cap: 'round' });

    // Large eye with W-shaped pupil
    g.circle(mw * 0.55, -mh * 0.15, sz * 0.15).fill(0xe8dfc0);
    g.moveTo(mw * 0.48, -mh * 0.12)
     .lineTo(mw * 0.52, -mh * 0.22)
     .lineTo(mw * 0.56, -mh * 0.1)
     .lineTo(mw * 0.6,  -mh * 0.22)
     .lineTo(mw * 0.64, -mh * 0.12)
     .closePath().fill(0x1a1a0a);
  }

  /** Moray eel — long sinuous shape. */
  _drawEel(g, sz, bodyColor, accentColor) {
    const len = sz * 2.2;
    const th  = sz * 0.32;
    g.roundRect(-len / 2, -th / 2, len, th, th / 2).fill(bodyColor);
    // accent stripe
    g.rect(-len / 2 + 4, -th * 0.15, len - 8, th * 0.3).fill(accentColor);
    // jaw open
    g.moveTo(len / 2 - 4, -th / 2)
     .lineTo(len / 2 + sz * 0.3, -th * 0.6)
     .lineTo(len / 2 - 4,  th / 2)
     .closePath()
     .fill(this._darken(bodyColor, 0.3));
    g.circle(len / 2 - sz * 0.15, -th * 0.2, sz * 0.09).fill(0xffffff);
    g.circle(len / 2 - sz * 0.13, -th * 0.18, sz * 0.05).fill(0x111111);
  }

  /** Zebra goby — oval body with 3 vertical dark stripes. */
  _drawZebraGoby(g, sz, bodyColor, accentColor) {
    const hw = sz;
    const hh = sz * 0.5;

    g.moveTo(-hw * 0.6, 0)
     .lineTo(-hw * 1.2, -hh * 0.8)
     .lineTo(-hw * 1.2,  hh * 0.8)
     .closePath().fill(bodyColor);

    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);

    // vertical dark stripes
    [-hw * 0.3, 0, hw * 0.3].forEach(sx => {
      g.rect(sx - hw * 0.07, -hh + 2, hw * 0.14, hh * 2 - 4).fill(accentColor);
    });
    this._ellipse(g, 0, 0, hw, hh);
    g.fill({ color: bodyColor, alpha: 0.2 });

    g.circle(hw * 0.5, -hh * 0.1, sz * 0.12).fill(0xffffff);
    g.circle(hw * 0.52, -hh * 0.09, sz * 0.07).fill(0x111111);
  }

  /** Zebrafish — elongated body with horizontal dark stripes. */
  _drawZebrafish(g, sz, bodyColor, accentColor) {
    const hw = sz * 1.1;
    const hh = sz * 0.4;

    g.moveTo(-hw * 0.75, 0)
     .lineTo(-hw * 1.35, -hh * 0.9)
     .lineTo(-hw * 1.35,  hh * 0.9)
     .closePath().fill(accentColor);

    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);

    // horizontal stripes
    [-hh * 0.5, -hh * 0.1, hh * 0.3].forEach(sy => {
      g.rect(-hw * 0.7, sy - hh * 0.12, hw * 1.4, hh * 0.24).fill(accentColor);
    });
    this._ellipse(g, 0, 0, hw, hh);
    g.fill({ color: bodyColor, alpha: 0.15 });

    g.circle(hw * 0.56, -hh * 0.1, sz * 0.1).fill(0xffffff);
    g.circle(hw * 0.58, -hh * 0.08, sz * 0.06).fill(0x111111);
  }

  /** Glowfin angelfish — disc body with elongated trailing fins. */
  _drawGlowfinAngel(g, sz, bodyColor, accentColor) {
    const hw = sz;
    const hh = sz * 0.8;

    // Trailing fin (elongated)
    g.moveTo(-hw * 0.5, 0)
     .lineTo(-hw * 1.8, -hh * 0.5)
     .lineTo(-hw * 1.8,  hh * 0.5)
     .closePath().fill({ color: accentColor, alpha: 0.7 });

    // Body disc
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);

    // Glowing dorsal fin
    g.moveTo(-hw * 0.2, -hh)
     .lineTo( hw * 0.1, -hh - sz * 0.6)
     .lineTo( hw * 0.6, -hh)
     .closePath().fill({ color: accentColor, alpha: 0.85 });

    // Ventral fin
    g.moveTo(-hw * 0.1, hh)
     .lineTo( hw * 0.1, hh + sz * 0.4)
     .lineTo( hw * 0.5, hh)
     .closePath().fill({ color: accentColor, alpha: 0.7 });

    g.circle(hw * 0.56, -hh * 0.15, sz * 0.12).fill(0xffffff);
    g.circle(hw * 0.58, -hh * 0.13, sz * 0.07).fill(0x111111);
  }

  /** Phantom lionfish — stocky body with spiky dorsal fan. */
  _drawLionfish(g, sz, bodyColor, accentColor) {
    const hw = sz * 0.85;
    const hh = sz * 0.65;

    // Tail
    g.moveTo(-hw * 0.65, 0)
     .lineTo(-hw * 1.25, -hh * 0.8)
     .lineTo(-hw * 1.25,  hh * 0.8)
     .closePath().fill(bodyColor);

    // Body
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);

    // Spiky dorsal fan (5 spines)
    for (let i = 0; i < 5; i++) {
      const sx = -hw * 0.3 + i * hw * 0.15;
      const tipY = -hh - sz * (0.55 + (i % 2) * 0.25);
      g.moveTo(sx, -hh)
       .lineTo(sx + sz * 0.04, tipY)
       .stroke({ color: accentColor, width: 2.5, cap: 'round' });
    }

    // Pectoral fin spread
    g.moveTo(hw * 0.2, 0)
     .lineTo(hw * 0.85, -hh * 0.9)
     .lineTo(hw * 0.95, 0)
     .lineTo(hw * 0.85,  hh * 0.9)
     .closePath().fill({ color: accentColor, alpha: 0.55 });

    // Stripe bands
    [-hw * 0.2, hw * 0.15].forEach(bx => {
      g.rect(bx - hw * 0.07, -hh + 4, hw * 0.14, hh * 2 - 8).fill({ color: accentColor, alpha: 0.35 });
    });

    g.circle(hw * 0.44, -hh * 0.22, sz * 0.13).fill(0xffffff);
    g.circle(hw * 0.46, -hh * 0.20, sz * 0.08).fill(0x111111);
  }

  /** Octopus — rounded mantle + 8 curling tentacles. */
  _drawOctopus(g, sz, bodyColor, accentColor) {
    const mw = sz * 0.9;  // mantle half-width
    const mh = sz * 1.1;  // mantle half-height

    // 8 tentacles radiating downward from mantle base
    for (let i = 0; i < 8; i++) {
      const spread = Math.PI * 0.9;
      const angle  = (Math.PI / 2) + (-spread / 2) + i * (spread / 7);
      const tx = Math.cos(angle) * sz * 1.6;
      const ty = Math.sin(angle) * sz * 1.4;
      // control point curls the tentacle
      const cx1 = Math.cos(angle) * sz * 0.8 + Math.cos(angle + Math.PI / 2) * sz * 0.3;
      const cy1 = Math.sin(angle) * sz * 0.8 + Math.sin(angle + Math.PI / 2) * sz * 0.3;
      g.moveTo(Math.cos(angle) * mw * 0.6, mh * 0.55)
       .bezierCurveTo(cx1, cy1, tx * 0.85, ty * 0.85, tx, ty)
       .stroke({ color: bodyColor, width: sz * 0.14, cap: 'round' });
      // sucker dots
      for (let s = 1; s <= 3; s++) {
        const t = s / 4;
        const sx = Math.cos(angle) * mw * 0.6 + (tx - Math.cos(angle) * mw * 0.6) * t;
        const sy = mh * 0.55 + (ty - mh * 0.55) * t;
        g.circle(sx, sy, sz * 0.045).fill(accentColor);
      }
    }

    // Mantle (rounded teardrop)
    this._ellipse(g, 0, 0, mw, mh);
    g.fill(bodyColor);

    // Subtle pattern spots
    g.circle(-mw * 0.3, -mh * 0.2, sz * 0.1).fill({ color: accentColor, alpha: 0.5 });
    g.circle( mw * 0.2, -mh * 0.3, sz * 0.08).fill({ color: accentColor, alpha: 0.5 });
    g.circle( mw * 0.1,  mh * 0.1, sz * 0.07).fill({ color: accentColor, alpha: 0.4 });

    // Eyes (forward-facing on mantle)
    g.circle(-mw * 0.35, -mh * 0.05, sz * 0.14).fill(0xffffff);
    g.circle(-mw * 0.34, -mh * 0.04, sz * 0.09).fill(0x111111);
    g.circle( mw * 0.35, -mh * 0.05, sz * 0.14).fill(0xffffff);
    g.circle( mw * 0.34, -mh * 0.04, sz * 0.09).fill(0x111111);
  }

  /** Pipefish — very thin segmented body, small dorsal fin, tubular snout. */
  _drawPipefish(g, sz, bodyColor, accentColor) {
    const len = sz * 2.2, th = sz * 0.18;
    g.roundRect(-len / 2, -th / 2, len, th, th / 2).fill(bodyColor);
    // Segment rings
    for (let i = 0; i < 8; i++) {
      const rx = -len * 0.38 + i * len * 0.1;
      g.moveTo(rx, -th * 0.5).lineTo(rx, th * 0.5)
       .stroke({ color: accentColor, width: 1, cap: 'round' });
    }
    // Small dorsal fin
    g.moveTo(len * 0.08, -th * 0.5).lineTo(len * 0.18, -th * 1.4).lineTo(len * 0.34, -th * 0.5)
     .closePath().fill({ color: accentColor, alpha: 0.65 });
    // Tubular snout
    g.moveTo(len * 0.5, -th * 0.28).lineTo(len * 0.5 + sz * 0.38, 0).lineTo(len * 0.5, th * 0.28)
     .closePath().fill(bodyColor);
    g.circle(len * 0.42, -th * 0.1, sz * 0.09).fill(0xffffff);
    g.circle(len * 0.43, -th * 0.08, sz * 0.055).fill(0x111111);
  }

  /** Sand Dollar — flat disc with 5-petal poriferous pattern. */
  _drawSandDollar(g, sz, bodyColor, accentColor) {
    const r = sz * 0.85;
    this._ellipse(g, 0, 0, r, r * 0.85);
    g.fill(bodyColor);
    // 5-petal petaloid ambulacra
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(angle) * r * 0.38, py = Math.sin(angle) * r * 0.34;
      this._ellipse(g, px, py, r * 0.22, r * 0.1);
      g.fill({ color: accentColor, alpha: 0.6 });
    }
    g.circle(0, 0, sz * 0.08).fill({ color: accentColor, alpha: 0.5 });
    this._ellipse(g, 0, 0, r * 0.96, r * 0.82);
    g.fill({ color: accentColor, alpha: 0.12 });
  }

  /** Queen Conch — coiled shell with flaring lip and spire. */
  _drawConch(g, sz, bodyColor, accentColor) {
    const hw = sz * 1.0, hh = sz * 0.72;
    // Shell body
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);
    // Spiral whorls
    this._ellipse(g, hw * 0.15, 0, hw * 0.6, hh * 0.68);
    g.fill(accentColor);
    this._ellipse(g, hw * 0.22, 0, hw * 0.36, hh * 0.46);
    g.fill(bodyColor);
    this._ellipse(g, hw * 0.26, 0, hw * 0.18, hh * 0.26);
    g.fill({ color: accentColor, alpha: 0.7 });
    // Flaring outer lip
    g.moveTo(hw * 0.55,  hh * 0.48).lineTo(hw * 1.02,  hh * 0.82).lineTo(hw * 0.88, hh * 0.32)
     .closePath().fill(accentColor);
    // Spire tip
    g.moveTo(-hw * 0.68, -hh * 0.48).lineTo(-hw * 0.92, -hh * 0.76).lineTo(-hw * 0.48, -hh * 0.32)
     .closePath().fill(this._darken(bodyColor, 0.18));
  }

  /** Pufferfish — round spotted body, short spines, small tail. */
  _drawPufferfish(g, sz, bodyColor, accentColor) {
    const r = sz * 0.88;
    // Tail fin
    g.moveTo(-r * 0.82, -r * 0.26).lineTo(-r * 1.18, 0).lineTo(-r * 0.82, r * 0.26)
     .closePath().fill(bodyColor);
    // Round body
    this._ellipse(g, 0, 0, r, r * 0.92);
    g.fill(bodyColor);
    // Spots
    [[-r * 0.28, -r * 0.34], [r * 0.12, -r * 0.44], [r * 0.42, -r * 0.18],
     [-r * 0.44,  r * 0.12], [r * 0.2,   r * 0.32], [-r * 0.12, r * 0.42]].forEach(([cx, cy]) => {
      g.circle(cx, cy, sz * 0.1).fill(accentColor);
    });
    // Spines
    [[-r*0.5,-r*0.5],[0,-r*0.9],[r*0.55,-r*0.38],[r*0.88,0],[r*0.55,r*0.38],[0,r*0.9],[-r*0.5,r*0.5]].forEach(([sx, sy]) => {
      const m = 1 / Math.hypot(sx, sy);
      g.moveTo(sx, sy).lineTo(sx + sx * m * sz * 0.18, sy + sy * m * sz * 0.18)
       .stroke({ color: this._darken(bodyColor, 0.22), width: 1.5, cap: 'round' });
    });
    // Snout & pectoral fin
    g.moveTo(r * 0.85, -r * 0.12).lineTo(r * 1.1, 0).lineTo(r * 0.85, r * 0.12).closePath().fill(bodyColor);
    g.moveTo(r * 0.2, r * 0.52).lineTo(r * 0.46, r * 0.9).lineTo(r * 0.62, r * 0.45).closePath().fill({ color: bodyColor, alpha: 0.7 });
    g.circle(r * 0.55, -r * 0.3, sz * 0.13).fill(0xffffff);
    g.circle(r * 0.57, -r * 0.28, sz * 0.08).fill(0x111111);
  }

  /** Spotted Eagle Ray — kite-shaped disc, white spots, long whip tail, duck-bill snout. */
  _drawSpottedEagleRay(g, sz, bodyColor, accentColor) {
    const len = sz * 1.6, span = sz * 1.38;
    // Kite body
    g.moveTo(-len * 0.5, 0)
     .lineTo(0, -span)
     .lineTo( len * 0.52, -span * 0.14)
     .lineTo( len * 0.72, 0)
     .lineTo( len * 0.52,  span * 0.14)
     .lineTo(0,  span)
     .closePath().fill(bodyColor);
    // White spots
    [[-sz*0.1,-sz*0.55],[sz*0.32,-sz*0.4],[sz*0.52,-sz*0.1],
     [-sz*0.3, sz*0.45],[sz*0.18, sz*0.5],[sz*0.48, sz*0.14]].forEach(([dx, dy]) => {
      g.circle(dx, dy, sz * 0.1).fill(accentColor);
    });
    // Long whip tail
    g.moveTo(-len * 0.5, 0).lineTo(-len * 1.85, sz * 0.12)
     .stroke({ color: bodyColor, width: sz * 0.12, cap: 'round' });
    // Duck-bill snout
    g.moveTo(len * 0.72, -sz * 0.14).lineTo(len * 0.98, 0).lineTo(len * 0.72, sz * 0.14)
     .closePath().fill(bodyColor);
    g.circle(len * 0.52, -sz * 0.1, sz * 0.1).fill(0xffffff);
    g.circle(len * 0.54, -sz * 0.08, sz * 0.06).fill(0x111111);
  }

  /** Dugong — torpedo body, forked tail flukes, downward-angled snout, nostrils. */
  _drawDugong(g, sz, bodyColor, accentColor) {
    const len = sz * 2.1, th = sz * 0.5;
    // Forked tail flukes (notched V, unlike manatee paddle)
    g.moveTo(-len * 0.48, 0).lineTo(-len * 0.62, -sz * 0.54).lineTo(-len * 0.52, -sz * 0.05).closePath().fill(bodyColor);
    g.moveTo(-len * 0.48, 0).lineTo(-len * 0.62,  sz * 0.54).lineTo(-len * 0.52,  sz * 0.05).closePath().fill(bodyColor);
    // Body
    this._ellipse(g, 0, 0, len * 0.5, th);
    g.fill(bodyColor);
    // Belly shading
    this._ellipse(g, len * 0.06, th * 0.26, len * 0.32, th * 0.4);
    g.fill({ color: accentColor, alpha: 0.6 });
    // Downward-angled barrel snout
    g.moveTo(len * 0.46, -th * 0.32).lineTo(len * 0.75, -th * 0.04).lineTo(len * 0.75, th * 0.38)
     .lineTo(len * 0.46,  th * 0.42).closePath().fill(bodyColor);
    // Flipper
    g.moveTo(len * 0.18,  th * 0.3).lineTo(len * 0.32,  th * 0.82).lineTo(len * 0.42,  th * 0.34)
     .closePath().fill(this._darken(bodyColor, 0.1));
    // Nostrils
    g.circle(len * 0.72, -sz * 0.04, sz * 0.07).fill(0x111111);
    g.circle(len * 0.72,  sz * 0.04, sz * 0.07).fill(0x111111);
    g.circle(len * 0.42, -th * 0.14, sz * 0.1).fill(0xffffff);
    g.circle(len * 0.435, -th * 0.12, sz * 0.06).fill(0x111111);
  }

  /** Horseshoe Crab — domed prosoma, segmented opisthosoma, long telson spike, paired legs. */
  _drawHorseshoeCrab(g, sz, bodyColor, accentColor) {
    const hw = sz * 1.1;
    const hh = sz * 0.82;

    // Telson (tail spike)
    g.moveTo(-hw * 0.78, -sz * 0.08)
     .lineTo(-hw * 1.65,  0)
     .lineTo(-hw * 0.78,  sz * 0.08)
     .closePath().fill(bodyColor);

    // Opisthosoma (rear segment)
    g.moveTo(-hw * 0.76, -hh * 0.44)
     .lineTo(-hw * 0.06, -hh * 0.6)
     .lineTo(-hw * 0.06,  hh * 0.6)
     .lineTo(-hw * 0.76,  hh * 0.44)
     .closePath().fill(bodyColor);
    // Ridge highlight
    g.moveTo(-hw * 0.72, -hh * 0.38)
     .lineTo(-hw * 0.1,  -hh * 0.52)
     .lineTo(-hw * 0.1,   hh * 0.52)
     .lineTo(-hw * 0.72,  hh * 0.38)
     .closePath().fill({ color: accentColor, alpha: 0.35 });

    // Prosoma (large horseshoe-shaped carapace)
    this._ellipse(g, hw * 0.22, 0, hw * 0.88, hh);
    g.fill(bodyColor);

    // Concentric shell ridges
    this._ellipse(g, hw * 0.18, 0, hw * 0.62, hh * 0.7);
    g.fill({ color: accentColor, alpha: 0.28 });
    this._ellipse(g, hw * 0.14, 0, hw * 0.34, hh * 0.42);
    g.fill({ color: accentColor, alpha: 0.22 });

    // Legs (5 pairs along lower/upper carapace edge)
    for (let i = 0; i < 5; i++) {
      const lx = hw * 0.58 - i * hw * 0.2;
      g.moveTo(lx,  hh * 0.78).lineTo(lx - sz * 0.06,  hh * 1.18)
       .stroke({ color: bodyColor, width: 2, cap: 'round' });
      g.moveTo(lx, -hh * 0.78).lineTo(lx - sz * 0.06, -hh * 1.18)
       .stroke({ color: bodyColor, width: 2, cap: 'round' });
    }

    // Compound eye spots
    g.circle(hw * 0.7, -hh * 0.3, sz * 0.08).fill(0x111111);
    g.circle(hw * 0.7,  hh * 0.3, sz * 0.08).fill(0x111111);
  }

  /** Tropic Blenny — small elongated blenny with crest and spots. */
  _drawTropicBlenny(g, sz, bodyColor, accentColor) {
    const hw = sz * 1.05;
    const hh = sz * 0.4;

    // Forked tail
    g.moveTo(-hw * 0.72, 0)
     .lineTo(-hw * 1.3, -hh * 1.0)
     .lineTo(-hw * 1.1, 0)
     .lineTo(-hw * 1.3,  hh * 1.0)
     .closePath().fill(bodyColor);

    // Body
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);

    // Long dorsal fin
    g.moveTo(hw * 0.4, -hh)
     .lineTo(-hw * 0.55, -hh - sz * 0.42)
     .lineTo(-hw * 0.7,  -hh)
     .closePath().fill({ color: accentColor, alpha: 0.8 });

    // Head crest
    g.moveTo(hw * 0.48, -hh)
     .lineTo(hw * 0.60, -hh - sz * 0.28)
     .lineTo(hw * 0.72, -hh)
     .closePath().fill(accentColor);

    // Spots
    for (let i = 0; i < 4; i++) {
      g.circle(-hw * 0.28 + i * hw * 0.2, sz * 0.08, sz * 0.07)
       .fill({ color: accentColor, alpha: 0.65 });
    }

    // Eye
    g.circle(hw * 0.6,  -hh * 0.2, sz * 0.12).fill(0xffffff);
    g.circle(hw * 0.62, -hh * 0.18, sz * 0.07).fill(0x111111);
  }

  /** Sea Urchin — spiny sphere. */
  _drawSeaUrchin(g, sz, bodyColor, accentColor) {
    const r = sz * 0.72;

    // Spines
    for (let i = 0; i < 12; i++) {
      const a  = (i / 12) * Math.PI * 2;
      const x0 = Math.cos(a) * r * 0.88;
      const y0 = Math.sin(a) * r * 0.88;
      const x1 = Math.cos(a) * r * 1.75;
      const y1 = Math.sin(a) * r * 1.75;
      g.moveTo(x0, y0).lineTo(x1, y1)
       .stroke({ color: accentColor, width: 1.5, cap: 'round' });
    }

    // Body
    g.circle(0, 0, r).fill(bodyColor);

    // Suture lines
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.moveTo(0, 0)
       .lineTo(Math.cos(a) * r * 0.88, Math.sin(a) * r * 0.88)
       .stroke({ color: accentColor, width: 1, alpha: 0.35 });
    }

    // Highlight
    g.circle(-r * 0.28, -r * 0.28, r * 0.32).fill({ color: 0xffffff, alpha: 0.1 });
  }

  /** Parrotfish — wide body with beak and bright colors. */
  _drawParrotfish(g, sz, bodyColor, accentColor) {
    const hw = sz;
    const hh = sz * 0.72;

    // Tail
    g.moveTo(-hw * 0.60, 0)
     .lineTo(-hw * 1.28, -hh * 0.88)
     .lineTo(-hw * 1.28,  hh * 0.88)
     .closePath().fill(bodyColor);

    // Body
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);

    // Accent overlay (pink scales)
    this._ellipse(g, hw * 0.05, 0, hw * 0.62, hh * 0.72);
    g.fill({ color: accentColor, alpha: 0.35 });

    // Beak (distinctive parrotfish feature)
    g.roundRect(hw * 0.66, -hh * 0.24, hw * 0.44, hh * 0.48, hw * 0.18)
     .fill(0x80cbc4);

    // Dorsal fin
    g.moveTo(-hw * 0.36, -hh)
     .lineTo( hw * 0.12, -hh - sz * 0.42)
     .lineTo( hw * 0.52, -hh)
     .closePath().fill({ color: accentColor, alpha: 0.7 });

    // Eye
    g.circle(hw * 0.62, -hh * 0.2,  sz * 0.13).fill(0xffffff);
    g.circle(hw * 0.64, -hh * 0.18, sz * 0.08).fill(0x111111);
  }

  /** Rabbitfish — oval body with venomous spiny dorsal, round snout. */
  _drawRabbitfish(g, sz, bodyColor, accentColor) {
    const hw = sz;
    const hh = sz * 0.74;

    // Tail
    g.moveTo(-hw * 0.60, 0)
     .lineTo(-hw * 1.22, -hh * 0.82)
     .lineTo(-hw * 1.22,  hh * 0.82)
     .closePath().fill(bodyColor);

    // Body
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);

    // Creamy belly
    this._ellipse(g, hw * 0.12, hh * 0.22, hw * 0.58, hh * 0.48);
    g.fill({ color: accentColor, alpha: 0.55 });

    // Spiny dorsal (4 spines)
    for (let i = 0; i < 4; i++) {
      const sx  = -hw * 0.18 + i * hw * 0.16;
      const tip = -hh - sz * (0.32 + (i % 2) * 0.14);
      g.moveTo(sx, -hh).lineTo(sx, tip)
       .stroke({ color: bodyColor, width: 2.5, cap: 'round' });
    }

    // Round rabbit-like snout
    g.circle(hw * 0.78, 0, hh * 0.34).fill(bodyColor);

    // Eye
    g.circle(hw * 0.56, -hh * 0.2,  sz * 0.13).fill(0xffffff);
    g.circle(hw * 0.58, -hh * 0.18, sz * 0.08).fill(0x111111);
  }

  /** Cleaner Shrimp — small banded body with long antennae. */
  _drawCleanerShrimp(g, sz, bodyColor, accentColor) {
    const len = sz * 1.55;
    const th  = sz * 0.38;

    // Antennae
    g.moveTo(len * 0.38, -th * 0.35).lineTo(len * 0.82, -th * 2.1)
     .stroke({ color: accentColor, width: 1, cap: 'round' });
    g.moveTo(len * 0.38, -th * 0.05).lineTo(len * 0.88, -th * 1.8)
     .stroke({ color: accentColor, width: 1, cap: 'round' });

    // Body
    g.roundRect(-len * 0.5, -th * 0.5, len, th, th * 0.42).fill(bodyColor);

    // White bands
    [-len * 0.14, len * 0.06, len * 0.26].forEach(bx => {
      g.rect(bx - sz * 0.09, -th * 0.5, sz * 0.18, th)
       .fill({ color: accentColor, alpha: 0.88 });
    });
    g.roundRect(-len * 0.5, -th * 0.5, len, th, th * 0.42)
     .fill({ color: bodyColor, alpha: 0.18 });

    // Tail fan
    g.moveTo(-len * 0.5, -th * 0.5)
     .lineTo(-len * 0.72, -th)
     .lineTo(-len * 0.5,  th * 0.5)
     .closePath().fill({ color: accentColor, alpha: 0.7 });

    // Eye
    g.circle(len * 0.4,  -th * 0.3, sz * 0.12).fill(accentColor);
    g.circle(len * 0.41, -th * 0.28, sz * 0.07).fill(0x111111);
  }

  /** Manta Ray — wide kite silhouette with cephalic fins and thin tail. */
  _drawMantaRay(g, sz, bodyColor, accentColor) {
    const hw = sz * 1.55;   // half-wingspan
    const hh = sz * 0.55;   // body depth

    // Wing body (kite shape)
    g.moveTo(0, -hh * 0.9)
     .lineTo(-hw, hh * 0.3)
     .lineTo(0,   hh)
     .lineTo( hw, hh * 0.3)
     .closePath().fill(bodyColor);

    // White belly patch
    this._ellipse(g, sz * 0.22, hh * 0.2, sz * 0.75, hh * 0.5);
    g.fill({ color: accentColor, alpha: 0.12 });

    // Cephalic fins (forward "horns")
    g.moveTo(-sz * 0.28, -hh * 0.5)
     .lineTo(-sz * 0.72, -hh * 1.15)
     .lineTo(-sz * 0.18, -hh * 0.85)
     .closePath().fill(bodyColor);
    g.moveTo( sz * 0.28, -hh * 0.5)
     .lineTo( sz * 0.72, -hh * 1.15)
     .lineTo( sz * 0.18, -hh * 0.85)
     .closePath().fill(bodyColor);

    // Tail
    g.moveTo(sz * 0.04, hh)
     .lineTo(sz * 0.08, sz * 2.1)
     .stroke({ color: bodyColor, width: 2.5, cap: 'round' });

    // Eye
    g.circle(sz * 0.14, -hh * 0.12, sz * 0.09).fill(accentColor);
    g.circle(sz * 0.15, -hh * 0.10, sz * 0.05).fill(0x111111);
  }

  _drawManatee(g, sz, bodyColor, accentColor) {
    const hw = sz * 1.1;
    const hh = sz * 0.52;
    const dark = this._darken(bodyColor, 0.18);

    // Main body — large rounded barrel
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);

    // Belly highlight
    this._ellipse(g, sz * 0.1, hh * 0.15, hw * 0.55, hh * 0.45);
    g.fill({ color: accentColor, alpha: 0.18 });

    // Paddle tail (rounded fan)
    g.moveTo(-hw * 0.85, -hh * 0.25)
     .lineTo(-hw * 1.42, -hh * 0.55)
     .lineTo(-hw * 1.5,  0)
     .lineTo(-hw * 1.42,  hh * 0.55)
     .lineTo(-hw * 0.85,  hh * 0.25)
     .closePath().fill(dark);

    // Front flippers
    g.moveTo(hw * 0.35, hh * 0.55)
     .lineTo(hw * 0.55, hh * 1.1)
     .lineTo(hw * 0.15, hh * 0.85)
     .closePath().fill(dark);
    g.moveTo(hw * 0.35, -hh * 0.55)
     .lineTo(hw * 0.55, -hh * 1.1)
     .lineTo(hw * 0.15, -hh * 0.85)
     .closePath().fill(dark);

    // Rounded snout
    g.circle(hw * 0.98, 0, hh * 0.35).fill(bodyColor);

    // Nostrils
    g.circle(hw * 1.1, -hh * 0.14, sz * 0.065).fill(dark);
    g.circle(hw * 1.1,  hh * 0.14, sz * 0.065).fill(dark);

    // Eye
    g.circle(hw * 0.72, -hh * 0.32, sz * 0.1).fill(dark);
    g.circle(hw * 0.73, -hh * 0.31, sz * 0.055).fill(0xffffff);
    g.circle(hw * 0.74, -hh * 0.30, sz * 0.03).fill(0x111111);

    // Wrinkle lines on body
    for (let i = 0; i < 3; i++) {
      const lx = hw * (-0.1 + i * 0.22);
      g.moveTo(lx, -hh * 0.55).lineTo(lx - sz * 0.06, hh * 0.55)
       .stroke({ color: dark, width: 1, alpha: 0.4 });
    }
  }

  _drawSeaTurtle(g, sz, bodyColor, accentColor) {
    // bodyColor = green (body, flippers, head, scute fills)
    // accentColor = brown (shell carapace)
    const hw        = sz * 0.9;
    const hh        = sz * 0.68;
    const bodyDark  = this._darken(bodyColor,  0.30);
    const shellDark = this._darken(accentColor, 0.28);

    // Shell (domed oval) — brown
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(accentColor);

    // Shell scute pattern — green fills on brown shell
    const scutes = [
      [0, -hh * 0.45, hw * 0.22, hh * 0.28],
      [0,  0,          hw * 0.24, hh * 0.30],
      [0,  hh * 0.45,  hw * 0.22, hh * 0.28],
    ];
    scutes.forEach(([cx, cy, rx, ry]) => {
      this._ellipse(g, cx, cy, rx, ry);
      g.stroke({ color: shellDark, width: 1.2, alpha: 0.8 });
      this._ellipse(g, cx, cy, rx * 0.72, ry * 0.72);
      g.fill({ color: bodyColor, alpha: 0.7 });
    });
    // Side scutes — green tinted
    [-hw * 0.5, hw * 0.5].forEach(sx => {
      [-hh * 0.22, hh * 0.22].forEach(sy => {
        this._ellipse(g, sx, sy, hw * 0.18, hh * 0.22);
        g.fill({ color: bodyColor, alpha: 0.45 });
        g.stroke({ color: shellDark, width: 1, alpha: 0.6 });
      });
    });

    // Head — green
    g.circle(hw * 1.0, 0, sz * 0.28).fill(bodyColor);
    // Eye
    g.circle(hw * 1.16, -sz * 0.12, sz * 0.08).fill(bodyDark);
    g.circle(hw * 1.17, -sz * 0.11, sz * 0.045).fill(0xffffff);
    g.circle(hw * 1.18, -sz * 0.10, sz * 0.025).fill(0x111111);

    // Four flippers — dark green
    const flippers = [
      [ hw * 0.35,  hh * 0.82,  hw * 0.75,  hh * 1.35],
      [ hw * 0.35, -hh * 0.82,  hw * 0.75, -hh * 1.35],
      [-hw * 0.45,  hh * 0.72, -hw * 0.85,  hh * 1.15],
      [-hw * 0.45, -hh * 0.72, -hw * 0.85, -hh * 1.15],
    ];
    flippers.forEach(([x1, y1, x2, y2]) => {
      g.moveTo(x1, y1 * 0.5).lineTo(x2, y2).lineTo(x1, y1).closePath().fill(bodyDark);
    });

    // Tail nub — dark green
    g.moveTo(-hw * 0.9, -sz * 0.1)
     .lineTo(-hw * 1.18, 0)
     .lineTo(-hw * 0.9,  sz * 0.1)
     .closePath().fill(bodyDark);
  }

  // ── Deep Twilight fish ─────────────────────────────────────────────────────

  /** Lanternfish — small torpedo with a row of photophores. */
  _drawLanternfish(g, sz, bodyColor, accentColor) {
    const hw = sz * 0.9;
    const hh = sz * 0.38;
    g.moveTo(-hw * 0.7, 0).lineTo(-hw * 1.3, -hh).lineTo(-hw * 1.3, hh).closePath().fill(bodyColor);
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);
    // Photophore row along belly
    for (let i = 0; i < 5; i++) {
      g.circle(-hw * 0.4 + i * hw * 0.2, hh * 0.55, sz * 0.07).fill(accentColor);
    }
    g.circle(hw * 0.5, -hh * 0.1, sz * 0.11).fill(0xffffff);
    g.circle(hw * 0.52, -hh * 0.09, sz * 0.065).fill(0x111111);
  }

  /** Ghost Goby — translucent pale body, nearly invisible. */
  _drawGhostGoby(g, sz, bodyColor, accentColor) {
    const hw = sz;
    const hh = sz * 0.44;
    g.moveTo(-hw * 0.65, 0).lineTo(-hw * 1.28, -hh * 0.82).lineTo(-hw * 1.28, hh * 0.82).closePath()
     .fill({ color: bodyColor, alpha: 0.45 });
    this._ellipse(g, 0, 0, hw, hh);
    g.fill({ color: bodyColor, alpha: 0.55 });
    // Faint spine stripe
    g.moveTo(-hw * 0.5, 0).lineTo(hw * 0.7, 0).stroke({ color: accentColor, width: 1, alpha: 0.4 });
    g.circle(hw * 0.52, -hh * 0.1, sz * 0.12).fill({ color: accentColor, alpha: 0.8 });
    g.circle(hw * 0.54, -hh * 0.09, sz * 0.07).fill(0x111111);
  }

  /** Hatchetfish — laterally compressed with silver scales and bioluminescent underside. */
  _drawHatchetfish(g, sz, bodyColor, accentColor) {
    const hw = sz * 0.7;
    const hh = sz * 0.9;
    // Hatchet body shape (flattened disc, deep belly)
    g.moveTo(-hw * 0.5, -hh * 0.5)
     .lineTo( hw * 0.8,  -hh * 0.3)
     .lineTo( hw * 0.8,   hh * 0.1)
     .lineTo(-hw * 0.5,   hh * 0.5)
     .closePath().fill(bodyColor);
    // Photophore row along belly curve
    for (let i = 0; i < 4; i++) {
      const t = -0.3 + i * 0.2;
      g.circle(-hw * 0.3 + i * hw * 0.28, hh * (0.3 + Math.abs(t) * 0.3), sz * 0.07)
       .fill(accentColor);
    }
    // Tiny tail
    g.moveTo(-hw * 0.5, 0).lineTo(-hw * 1.1, -hh * 0.35).lineTo(-hw * 1.1, hh * 0.1).closePath()
     .fill(bodyColor);
    g.circle(hw * 0.55, -hh * 0.22, sz * 0.1).fill(0xffffff);
    g.circle(hw * 0.57, -hh * 0.20, sz * 0.06).fill(0x111111);
  }

  /** Deep Blenny — dark elongated body with bioluminescent stripe and frilly dorsal. */
  _drawDeepBlenny(g, sz, bodyColor, accentColor) {
    const hw = sz * 1.2;
    const hh = sz * 0.4;
    g.moveTo(-hw * 0.72, 0).lineTo(-hw * 1.32, -hh * 0.85).lineTo(-hw * 1.32, hh * 0.85).closePath()
     .fill(bodyColor);
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);
    // Glow stripe along lateral line
    g.moveTo(-hw * 0.5, 0).lineTo(hw * 0.7, 0)
     .stroke({ color: accentColor, width: 1.5, alpha: 0.85 });
    // Frilly dorsal — wavy
    for (let i = 0; i < 5; i++) {
      const bx = -hw * 0.3 + i * hw * 0.22;
      g.moveTo(bx, -hh).lineTo(bx + sz * 0.04, -hh - sz * 0.2 - (i % 2) * sz * 0.1)
       .stroke({ color: accentColor, width: 1.5, alpha: 0.7, cap: 'round' });
    }
    g.circle(hw * 0.55, -hh * 0.1, sz * 0.11).fill(0xffffff);
    g.circle(hw * 0.57, -hh * 0.08, sz * 0.065).fill(0x111111);
  }

  /** Dragonfish — elongated predator with chin barbel and fangs. */
  _drawDragonfish(g, sz, bodyColor, accentColor) {
    const hw = sz * 1.4;
    const hh = sz * 0.38;
    g.moveTo(-hw * 0.75, 0).lineTo(-hw * 1.3, -hh * 0.8).lineTo(-hw * 1.3, hh * 0.8).closePath()
     .fill(bodyColor);
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);
    // Photophore row
    for (let i = 0; i < 6; i++) {
      g.circle(-hw * 0.4 + i * hw * 0.14, hh * 0.6, sz * 0.065).fill(accentColor);
    }
    // Chin barbel with bioluminescent tip
    g.moveTo(hw * 0.6, hh * 0.5).lineTo(hw * 0.6, hh * 2.2)
     .stroke({ color: accentColor, width: 1.2, alpha: 0.8, cap: 'round' });
    g.circle(hw * 0.6, hh * 2.3, sz * 0.1).fill(accentColor);
    // Fang
    g.moveTo(hw * 0.72, hh * 0.4).lineTo(hw * 0.84, hh * 0.85)
     .stroke({ color: 0xffffff, width: 1.5, cap: 'round' });
    g.circle(hw * 0.6, -hh * 0.08, sz * 0.12).fill(0xffffff);
    g.circle(hw * 0.62, -hh * 0.06, sz * 0.07).fill(0x111111);
  }

  /** Flashlight Fish — black body with glowing eye-organ patch. */
  _drawFlashlightFish(g, sz, bodyColor, accentColor) {
    const hw = sz;
    const hh = sz * 0.58;
    g.moveTo(-hw * 0.68, 0).lineTo(-hw * 1.28, -hh * 0.88).lineTo(-hw * 1.28, hh * 0.88).closePath()
     .fill(bodyColor);
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);
    // Dorsal fin
    g.moveTo(-hw * 0.1, -hh).lineTo(hw * 0.1, -hh - sz * 0.36).lineTo(hw * 0.48, -hh).closePath()
     .fill(bodyColor);
    // Bioluminescent organ below eye (kidney-shaped glow patch)
    g.roundRect(hw * 0.3, -hh * 0.15, sz * 0.36, sz * 0.22, sz * 0.1)
     .fill({ color: accentColor, alpha: 0.9 });
    // Eye above organ
    g.circle(hw * 0.5, -hh * 0.28, sz * 0.13).fill(0xffffff);
    g.circle(hw * 0.52, -hh * 0.26, sz * 0.08).fill(0x111111);
  }

  /** Viperfish — elongated with enormous curved fangs. */
  _drawViperfish(g, sz, bodyColor, accentColor) {
    const len = sz * 2.4;
    const th  = sz * 0.3;
    g.roundRect(-len / 2, -th / 2, len, th, th * 0.45).fill(bodyColor);
    // Photophores
    for (let i = 0; i < 7; i++) {
      g.circle(-len * 0.36 + i * len * 0.1, th * 0.55, sz * 0.07).fill(accentColor);
    }
    // Huge curved fang
    g.moveTo(len * 0.42, -th * 0.4)
     .lineTo(len * 0.68,  th * 1.1)
     .stroke({ color: 0xe8e8e8, width: 2, cap: 'round' });
    g.moveTo(len * 0.38,  th * 0.4)
     .lineTo(len * 0.6,  -th * 1.1)
     .stroke({ color: 0xe8e8e8, width: 2, cap: 'round' });
    g.circle(len * 0.38, -th * 0.18, sz * 0.1).fill(0xffffff);
    g.circle(len * 0.4,  -th * 0.16, sz * 0.06).fill(0x111111);
  }

  /** Barreleye — transparent dome head with green tubular eyes. */
  _drawBarreleye(g, sz, bodyColor, accentColor) {
    const hw = sz;
    const hh = sz * 0.52;
    // Tail
    g.moveTo(-hw * 0.65, 0).lineTo(-hw * 1.22, -hh * 0.82).lineTo(-hw * 1.22, hh * 0.82).closePath()
     .fill(bodyColor);
    // Body
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);
    // Transparent dome over forward part of head
    this._ellipse(g, hw * 0.42, -hh * 0.1, hw * 0.45, hh * 0.82);
    g.fill({ color: 0xffffff, alpha: 0.15 });
    g.stroke({ color: 0xffffff, width: 1, alpha: 0.3 });
    // Two distinctive upward-pointing tubular eyes
    g.roundRect(hw * 0.2, -hh * 0.7, sz * 0.18, sz * 0.42, sz * 0.08)
     .fill({ color: accentColor, alpha: 0.9 });
    g.roundRect(hw * 0.5, -hh * 0.78, sz * 0.18, sz * 0.42, sz * 0.08)
     .fill({ color: accentColor, alpha: 0.9 });
    // Pupils
    g.circle(hw * 0.29, -hh * 0.62, sz * 0.065).fill(0x111111);
    g.circle(hw * 0.59, -hh * 0.7,  sz * 0.065).fill(0x111111);
  }

  /** Ribbonfish — long narrow silver ribbon with red dorsal crest. */
  _drawRibbonfish(g, sz, bodyColor, accentColor) {
    const len = sz * 3.2;
    const th  = sz * 0.2;
    // Main ribbon body
    g.roundRect(-len / 2, -th / 2, len, th, th * 0.4).fill(bodyColor);
    // Red dorsal crest running full length
    g.moveTo(-len / 2 + 4, -th / 2).lineTo(len / 2 - 4, -th / 2)
     .stroke({ color: accentColor, width: 3, alpha: 0.9 });
    // Pelvic threadfins (hanging filaments)
    [len * 0.1, len * 0.2].forEach(fx => {
      g.moveTo(fx, th * 0.4).lineTo(fx + sz * 0.1, th * 1.6)
       .stroke({ color: bodyColor, width: 1.5, alpha: 0.7, cap: 'round' });
    });
    g.circle(len * 0.46, -th * 0.12, sz * 0.1).fill(0x111111);
  }

  /** Gulper Eel — tiny body with enormous pelican-like expanding jaw. */
  _drawGulperEel(g, sz, bodyColor, accentColor) {
    const len = sz * 2.0;
    const th  = sz * 0.25;
    // Long whip tail
    g.roundRect(-len * 0.55, -th * 0.35, len * 0.55, th * 0.7, th * 0.3).fill(bodyColor);
    // Bioluminescent tail tip
    g.circle(-len * 0.55, 0, sz * 0.12).fill(accentColor);
    // Gaping jaw
    g.moveTo(0, -sz * 0.4)
     .lineTo(len * 0.52,  -sz * 0.05)
     .lineTo(len * 0.52,   sz * 0.05)
     .lineTo(0,             sz * 0.4)
     .closePath().fill(bodyColor);
    // Dark inner maw
    g.moveTo(len * 0.06, -sz * 0.28)
     .lineTo(len * 0.46, -sz * 0.04)
     .lineTo(len * 0.46,  sz * 0.04)
     .lineTo(len * 0.06,  sz * 0.28)
     .closePath().fill(0x0a0a1a);
    g.circle(len * 0.08, -sz * 0.18, sz * 0.1).fill(0xffffff);
    g.circle(len * 0.1,  -sz * 0.16, sz * 0.06).fill(0x111111);
  }

  /** Fangtooth — compact body, disproportionately huge teeth. */
  _drawFangtooth(g, sz, bodyColor, accentColor) {
    const hw = sz * 0.95;
    const hh = sz * 0.72;
    g.moveTo(-hw * 0.68, 0).lineTo(-hw * 1.3, -hh * 0.8).lineTo(-hw * 1.3, hh * 0.8).closePath()
     .fill(bodyColor);
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);
    // Oversized lower jaw
    g.moveTo(-hw * 0.4, hh * 0.7).lineTo(hw * 0.9, hh * 0.55).lineTo(hw * 0.9, hh * 1.0)
     .lineTo(-hw * 0.4, hh * 1.1).closePath().fill(this._darken(bodyColor, 0.2));
    // Fangs
    [0.1, 0.4, 0.7].forEach(t => {
      g.moveTo(hw * t, hh * 0.6).lineTo(hw * (t + 0.05), hh * 1.2)
       .stroke({ color: 0xe8e8e8, width: 2.5, cap: 'round' });
    });
    g.circle(hw * 0.55, -hh * 0.2, sz * 0.14).fill(accentColor);
    g.circle(hw * 0.57, -hh * 0.18, sz * 0.08).fill(0x111111);
  }

  /** Frilled Shark — ancient eel-like shark with 6-gill frills. */
  _drawFrilledShark(g, sz, bodyColor, accentColor) {
    const len = sz * 2.6;
    const th  = sz * 0.38;
    g.roundRect(-len / 2, -th / 2, len, th, th * 0.42).fill(bodyColor);
    // 6 gill frills (ruffled)
    for (let i = 0; i < 6; i++) {
      const fx = len * 0.26 + i * sz * 0.14;
      g.moveTo(fx, -th * 0.5).lineTo(fx + sz * 0.04, -th * 1.1).lineTo(fx + sz * 0.08, -th * 0.5)
       .closePath().fill({ color: accentColor, alpha: 0.7 });
      g.moveTo(fx, th * 0.5).lineTo(fx + sz * 0.04, th * 1.1).lineTo(fx + sz * 0.08, th * 0.5)
       .closePath().fill({ color: accentColor, alpha: 0.7 });
    }
    // Rounded terminal mouth
    g.roundRect(len * 0.44, -th * 0.55, sz * 0.22, th * 1.1, sz * 0.06).fill(0x1a2a2a);
    g.circle(len * 0.36, -th * 0.22, sz * 0.1).fill(0xffffff);
    g.circle(len * 0.38, -th * 0.20, sz * 0.06).fill(0x111111);
    // Asymmetric caudal fin
    g.moveTo(-len * 0.5, -th * 0.5)
     .lineTo(-len * 0.62, -th * 1.4)
     .lineTo(-len * 0.52,  th * 0.5)
     .closePath().fill(bodyColor);
  }

  /** Giant Squid — mantle body with tentacles and huge eye. */
  _drawGiantSquid(g, sz, bodyColor, accentColor) {
    const hw = sz * 0.8;
    const hh = sz * 1.1;
    // Mantle (torpedo-shaped)
    this._ellipse(g, 0, -hh * 0.1, hw, hh);
    g.fill(bodyColor);
    // Chromatophore spots
    for (let i = 0; i < 6; i++) {
      g.circle(
        (Math.random() > 0.5 ? 1 : -1) * hw * (0.1 + (i % 3) * 0.2),
        -hh * 0.4 + i * hh * 0.14,
        sz * 0.06
      ).fill({ color: accentColor, alpha: 0.6 });
    }
    // Two long tentacles
    [-hw * 0.28, hw * 0.28].forEach(tx => {
      g.moveTo(tx, hh * 0.85)
       .lineTo(tx * 1.3, hh * 1.6)
       .stroke({ color: bodyColor, width: 3, cap: 'round' });
    });
    // Eight arms
    for (let i = 0; i < 8; i++) {
      const angle = Math.PI * 0.6 + (i / 7) * Math.PI * 0.8;
      g.moveTo(0, hh * 0.88)
       .lineTo(Math.cos(angle) * hw * 1.3, hh * 0.88 + Math.sin(Math.abs(angle - Math.PI)) * sz * 0.5)
       .stroke({ color: this._darken(bodyColor, 0.1), width: 2, cap: 'round' });
    }
    // Fin lobes
    g.moveTo(-hw * 0.8, -hh * 0.68).lineTo(-hw * 1.35, -hh * 0.45).lineTo(-hw * 0.55, -hh * 0.38).closePath().fill(bodyColor);
    g.moveTo( hw * 0.8, -hh * 0.68).lineTo( hw * 1.35, -hh * 0.45).lineTo( hw * 0.55, -hh * 0.38).closePath().fill(bodyColor);
    // Eye
    g.circle(hw * 0.52, -hh * 0.25, sz * 0.22).fill(0xffffff);
    g.circle(hw * 0.56, -hh * 0.22, sz * 0.14).fill(0x111111);
  }

  /** Abyssal Ray — wide dark ray with bioluminescent trailing edge. */
  _drawAbyssalRay(g, sz, bodyColor, accentColor) {
    const hw = sz * 1.4;
    const hh = sz * 0.52;
    // Wing body
    g.moveTo(0, -hh * 0.9).lineTo(-hw, hh * 0.35).lineTo(0, hh).lineTo(hw, hh * 0.35).closePath()
     .fill(bodyColor);
    // Bioluminescent edge glow
    g.moveTo(-hw, hh * 0.35).lineTo(0, hh).lineTo(hw, hh * 0.35)
     .stroke({ color: accentColor, width: 2, alpha: 0.75 });
    // Bioluminescent spots along trailing edge
    for (let i = 0; i < 5; i++) {
      const t = -1 + i * 0.5;
      g.circle(t * hw, hh * (0.8 + Math.abs(t) * 0.18), sz * 0.07).fill(accentColor);
    }
    // Cephalic horn nubs
    g.moveTo(hw * 0.72, hh * 0.1).lineTo(hw * 0.92, -hh * 0.5).stroke({ color: bodyColor, width: 4, cap: 'round' });
    g.moveTo(-hw * 0.72, hh * 0.1).lineTo(-hw * 0.92, -hh * 0.5).stroke({ color: bodyColor, width: 4, cap: 'round' });
    // Whip tail
    g.moveTo(0, hh).lineTo(-sz * 0.1, hh + sz * 1.2).stroke({ color: bodyColor, width: 2.5, cap: 'round' });
    g.circle(0, 0, sz * 0.12).fill(0xffffff);
    g.circle(sz * 0.02, sz * 0.02, sz * 0.07).fill(0x111111);
  }

  /** Oarfish — enormous flat ribbon, red dorsal crest, red oar-like pelvic fins. */
  _drawOarfish(g, sz, bodyColor, accentColor) {
    const len = sz * 3.8;
    const th  = sz * 0.22;
    // Ribbon body (tapers toward tail)
    g.moveTo(-len / 2, -th * 0.3)
     .lineTo(len * 0.45, -th * 0.55)
     .lineTo(len * 0.45,  th * 0.55)
     .lineTo(-len / 2,  th * 0.3)
     .closePath().fill(bodyColor);
    // Red dorsal crest
    g.moveTo(-len / 2, -th * 0.3).lineTo(len * 0.38, -th * 0.55)
     .stroke({ color: accentColor, width: 4, alpha: 0.95 });
    // Decorative crest filaments
    for (let i = 0; i < 6; i++) {
      const bx = -len * 0.38 + i * len * 0.13;
      g.moveTo(bx, -th * 0.3).lineTo(bx, -th * 1.4 - (i === 0 ? sz * 0.4 : 0))
       .stroke({ color: accentColor, width: 2, alpha: 0.8, cap: 'round' });
    }
    // Oar-like pelvic fins (long red paddle)
    g.moveTo(len * 0.14, th * 0.4).lineTo(len * 0.16, th * 1.8)
     .stroke({ color: accentColor, width: 4, cap: 'round' });
    g.circle(len * 0.16, th * 1.9, sz * 0.12).fill(accentColor);
    // Eye
    g.circle(len * 0.42, -th * 0.18, sz * 0.12).fill(0xffffff);
    g.circle(len * 0.44, -th * 0.16, sz * 0.07).fill(0x111111);
  }

  /** Twilight Whale Shark — massive spotted body with wide mouth. */
  _drawTwilightWhaleShark(g, sz, bodyColor, accentColor) {
    const len = sz * 2.8;
    const th  = sz * 0.72;
    // Broad flat tail fin
    g.moveTo(-len * 0.5, 0)
     .lineTo(-len * 0.62, -th * 0.95)
     .lineTo(-len * 0.5,  th * 0.6)
     .closePath().fill(bodyColor);
    // Body
    g.roundRect(-len * 0.5, -th / 2, len, th, th * 0.34).fill(bodyColor);
    // Wide flat mouth (terminal)
    g.roundRect(len * 0.4, -th * 0.3, sz * 0.28, th * 0.6, sz * 0.08).fill(0x0a1030);
    // Bioluminescent spots
    for (let i = 0; i < 8; i++) {
      g.circle(
        -len * 0.28 + (i % 4) * len * 0.18,
        (Math.floor(i / 4) === 0 ? -1 : 1) * th * 0.28,
        sz * 0.07
      ).fill({ color: accentColor, alpha: 0.8 });
    }
    // Dorsal fin
    g.moveTo(-len * 0.05, -th / 2)
     .lineTo( len * 0.08, -th / 2 - sz * 0.55)
     .lineTo( len * 0.22, -th / 2)
     .closePath().fill(bodyColor);
    // Eye
    g.circle(len * 0.32, -th * 0.18, sz * 0.12).fill(0xffffff);
    g.circle(len * 0.34, -th * 0.16, sz * 0.07).fill(0x111111);
  }

  // ── v0.3 Coral Reef Expansion ─────────────────────────────────────────────────

  /** Neon Goby — small dark body with vivid cyan lateral stripe. */
  _drawNeonGoby(g, sz, bodyColor, accentColor) {
    const hw = sz * 0.95, hh = sz * 0.38;
    g.moveTo(-hw * 0.65, 0).lineTo(-hw * 1.2, -hh * 0.8).lineTo(-hw * 1.2, hh * 0.8).closePath().fill(bodyColor);
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);
    // Neon lateral stripe
    g.rect(-hw * 0.7, -hh * 0.18, hw * 1.4, hh * 0.36).fill(accentColor);
    this._ellipse(g, 0, 0, hw, hh);
    g.fill({ color: bodyColor, alpha: 0.2 });
    g.circle(hw * 0.52, -hh * 0.1, sz * 0.12).fill(0xffffff);
    g.circle(hw * 0.54, -hh * 0.08, sz * 0.07).fill(0x111111);
  }

  /** Firefish — cream/red body with tall flagpole dorsal fin. */
  _drawFirefish(g, sz, bodyColor, accentColor) {
    const hw = sz * 1.05, hh = sz * 0.36;
    g.moveTo(-hw * 0.68, 0).lineTo(-hw * 1.28, -hh * 0.7).lineTo(-hw * 1.28, hh * 0.7).closePath().fill(accentColor);
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);
    // Rear fades to accent color
    this._ellipse(g, -hw * 0.32, 0, hw * 0.7, hh * 0.9);
    g.fill({ color: accentColor, alpha: 0.65 });
    // Tall flagpole dorsal fin
    g.moveTo(-hw * 0.08, -hh)
     .lineTo( hw * 0.02, -hh - sz * 1.38)
     .lineTo( hw * 0.42, -hh * 0.88)
     .closePath().fill({ color: accentColor, alpha: 0.8 });
    g.circle(hw * 0.55, -hh * 0.15, sz * 0.12).fill(0xffffff);
    g.circle(hw * 0.57, -hh * 0.13, sz * 0.07).fill(0x111111);
  }

  /** Damselfish — small compact oval, bold dorsal fin. */
  _drawDamselfish(g, sz, bodyColor, accentColor) {
    const hw = sz * 0.88, hh = sz * 0.62;
    g.moveTo(-hw * 0.6, 0).lineTo(-hw * 1.18, -hh * 0.78).lineTo(-hw * 1.18, hh * 0.78).closePath().fill(bodyColor);
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);
    // Accent belly patch
    this._ellipse(g, hw * 0.1, hh * 0.3, hw * 0.55, hh * 0.42);
    g.fill({ color: accentColor, alpha: 0.5 });
    g.moveTo(-hw * 0.08, -hh).lineTo(hw * 0.1, -hh - sz * 0.38).lineTo(hw * 0.52, -hh).closePath().fill(bodyColor);
    g.circle(hw * 0.5, -hh * 0.14, sz * 0.12).fill(0xffffff);
    g.circle(hw * 0.52, -hh * 0.12, sz * 0.07).fill(0x111111);
  }

  /** Royal Gramma — front half yellow, rear half purple, split at mid-body. */
  _drawRoyalGramma(g, sz, bodyColor, accentColor) {
    const hw = sz, hh = sz * 0.5;
    // Tail
    g.moveTo(-hw * 0.65, 0).lineTo(-hw * 1.25, -hh * 0.85).lineTo(-hw * 1.25, hh * 0.85).closePath().fill(bodyColor);
    // Full body (purple base)
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);
    // Yellow front half
    this._ellipse(g, hw * 0.32, 0, hw * 0.7, hh * 0.94);
    g.fill(accentColor);
    // Soft blend at split
    this._ellipse(g, -hw * 0.04, 0, hw * 0.16, hh);
    g.fill({ color: 0xff9800, alpha: 0.55 });
    // Dorsal fin
    g.moveTo(-hw * 0.2, -hh).lineTo(hw * 0.08, -hh - sz * 0.4).lineTo(hw * 0.55, -hh).closePath().fill(bodyColor);
    g.circle(hw * 0.54, -hh * 0.14, sz * 0.12).fill(0xffffff);
    g.circle(hw * 0.56, -hh * 0.12, sz * 0.07).fill(0x111111);
  }

  /** Pajama Cardinalfish — white body, red head, black mid-band, spotted rear. */
  _drawPajamaCardinalfish(g, sz, bodyColor, accentColor) {
    const hw = sz * 0.92, hh = sz * 0.5;
    g.moveTo(-hw * 0.62, 0).lineTo(-hw * 1.18, -hh * 0.8).lineTo(-hw * 1.18, hh * 0.8).closePath().fill(bodyColor);
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);
    // Red-orange head
    this._ellipse(g, hw * 0.52, 0, hw * 0.5, hh * 0.92);
    g.fill(accentColor);
    // Black mid-band
    g.rect(-hw * 0.1, -hh + 2, hw * 0.18, hh * 2 - 4).fill(0x111111);
    // Polka dots on rear
    [[-hw * 0.38, -hh * 0.28], [-hw * 0.52, hh * 0.12], [-hw * 0.25, hh * 0.26], [-hw * 0.6, -hh * 0.08]].forEach(([dx, dy]) => {
      g.circle(dx, dy, sz * 0.09).fill(0x333333);
    });
    g.circle(hw * 0.56, -hh * 0.14, sz * 0.13).fill(0xffffff);
    g.circle(hw * 0.58, -hh * 0.12, sz * 0.08).fill(0x111111);
  }

  /** Shrimp Goby — pale banded body with tiny symbiotic shrimp companion. */
  _drawShrimpGoby(g, sz, bodyColor, accentColor) {
    const hw = sz * 1.02, hh = sz * 0.42;
    g.moveTo(-hw * 0.65, 0).lineTo(-hw * 1.2, -hh * 0.75).lineTo(-hw * 1.2, hh * 0.75).closePath().fill(bodyColor);
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);
    [-hw * 0.2, hw * 0.12, hw * 0.42].forEach(bx => {
      g.rect(bx - hw * 0.05, -hh + 2, hw * 0.1, hh * 2 - 4).fill({ color: accentColor, alpha: 0.55 });
    });
    // Tall first dorsal ray
    g.moveTo(hw * 0.14, -hh).lineTo(hw * 0.28, -hh - sz * 0.52).lineTo(hw * 0.5, -hh).closePath().fill({ color: accentColor, alpha: 0.7 });
    g.circle(hw * 0.55, -hh * 0.12, sz * 0.12).fill(0xffffff);
    g.circle(hw * 0.57, -hh * 0.1, sz * 0.07).fill(0x111111);
    // Tiny shrimp companion (below rear)
    g.roundRect(-hw * 0.55, hh * 0.75, hw * 0.38, hh * 0.38, hh * 0.18).fill(0xff8a65);
    g.circle(-hw * 0.2, hh * 0.88, sz * 0.06).fill(0xffffff);
  }

  /** Banggai Cardinalfish — silver disc with 3 bold black stripes and trailing fin lobes. */
  _drawBanggaiCardinalfish(g, sz, bodyColor, accentColor) {
    const hw = sz, hh = sz * 0.62;
    // Long trailing fin lobes
    g.moveTo(-hw * 0.52, -hh * 0.18).lineTo(-hw * 1.48, -hh * 0.72).lineTo(-hw * 0.62, -hh * 0.08).closePath().fill(bodyColor);
    g.moveTo(-hw * 0.52,  hh * 0.18).lineTo(-hw * 1.48,  hh * 0.72).lineTo(-hw * 0.62,  hh * 0.08).closePath().fill(bodyColor);
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);
    // 3 bold black stripes
    [-hw * 0.14, hw * 0.22, hw * 0.58].forEach(sx => {
      g.rect(sx - hw * 0.08, -hh + 2, hw * 0.15, hh * 2 - 4).fill(accentColor);
    });
    this._ellipse(g, 0, 0, hw, hh);
    g.fill({ color: bodyColor, alpha: 0.15 });
    // Tall dorsal and matching anal fin
    g.moveTo(-hw * 0.06, -hh).lineTo(hw * 0.16, -hh - sz * 0.52).lineTo(hw * 0.55, -hh).closePath().fill({ color: accentColor, alpha: 0.6 });
    g.moveTo(-hw * 0.06,  hh).lineTo(hw * 0.16,  hh + sz * 0.42).lineTo(hw * 0.55,  hh).closePath().fill({ color: accentColor, alpha: 0.4 });
    g.circle(hw * 0.52, -hh * 0.12, sz * 0.13).fill(0xffffff);
    g.circle(hw * 0.54, -hh * 0.1, sz * 0.08).fill(0x111111);
  }

  /** Cleaner Wrasse — blue body with bold black lateral stripe, yellow-white belly. */
  _drawCleanerWrasse(g, sz, bodyColor, accentColor) {
    const hw = sz * 1.08, hh = sz * 0.38;
    g.moveTo(-hw * 0.68, 0).lineTo(-hw * 1.28, -hh * 0.78).lineTo(-hw * 1.28, hh * 0.78).closePath().fill(bodyColor);
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);
    // Yellow-white belly
    this._ellipse(g, 0, hh * 0.24, hw * 0.92, hh * 0.52);
    g.fill({ color: accentColor, alpha: 0.7 });
    // Black lateral stripe
    g.rect(-hw * 0.72, -hh * 0.2, hw * 1.45, hh * 0.36).fill(0x111111);
    this._ellipse(g, 0, 0, hw, hh);
    g.fill({ color: bodyColor, alpha: 0.12 });
    g.circle(hw * 0.54, -hh * 0.1, sz * 0.12).fill(0xffffff);
    g.circle(hw * 0.56, -hh * 0.08, sz * 0.07).fill(0x111111);
  }

  /** Flame Angelfish — orange-red with 4 black stripes and purple-edged trailing fins. */
  _drawFlameAngelfish(g, sz, bodyColor, accentColor) {
    const hw = sz, hh = sz * 0.7;
    g.moveTo(-hw * 0.58, 0).lineTo(-hw * 1.22, -hh * 0.78).lineTo(-hw * 1.22, hh * 0.78).closePath().fill(bodyColor);
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);
    // 4 black vertical stripes
    [-hw * 0.3, -hw * 0.06, hw * 0.18, hw * 0.44].forEach(sx => {
      g.rect(sx - hw * 0.07, -hh + 2, hw * 0.13, hh * 2 - 4).fill(accentColor);
    });
    this._ellipse(g, 0, 0, hw, hh);
    g.fill({ color: bodyColor, alpha: 0.18 });
    // Dorsal fin with purple trailing edge
    g.moveTo(-hw * 0.18, -hh).lineTo(hw * 0.1, -hh - sz * 0.45).lineTo(hw * 0.65, -hh).closePath().fill(bodyColor);
    g.moveTo(hw * 0.38, -hh).lineTo(hw * 0.62, -hh - sz * 0.22).lineTo(hw * 0.65, -hh).closePath().fill(0x7c4dff);
    // Anal fin with purple edge
    g.moveTo(-hw * 0.08, hh).lineTo(hw * 0.52, hh + sz * 0.32).lineTo(hw * 0.65, hh).closePath().fill(0x7c4dff);
    g.circle(hw * 0.54, -hh * 0.18, sz * 0.12).fill(0xffffff);
    g.circle(hw * 0.56, -hh * 0.16, sz * 0.07).fill(0x111111);
  }

  /** Mandarinfish — psychedelic blue body with orange bands and green shimmer spots. */
  _drawMandarinfish(g, sz, bodyColor, accentColor) {
    const hw = sz * 0.98, hh = sz * 0.58;
    g.moveTo(-hw * 0.62, 0).lineTo(-hw * 1.22, -hh * 0.7).lineTo(-hw * 1.22, hh * 0.7).closePath().fill(bodyColor);
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);
    // Orange wavy bands
    [[-hw * 0.42, -hh * 0.42, hw * 0.2, hh * 0.84], [-hw * 0.08, -hh * 0.5, hw * 0.18, hh], [hw * 0.22, -hh * 0.42, hw * 0.18, hh * 0.84]].forEach(([x, y, w, h]) => {
      g.roundRect(x, y, w, h, w * 0.35).fill({ color: accentColor, alpha: 0.85 });
    });
    // Green shimmer dots
    [[0, -hh * 0.28], [hw * 0.3, hh * 0.12], [-hw * 0.28, hh * 0.22]].forEach(([dx, dy]) => {
      g.circle(dx, dy, sz * 0.1).fill({ color: 0x69f0ae, alpha: 0.65 });
    });
    // Tall ornate dorsal fin
    g.moveTo(-hw * 0.14, -hh)
     .lineTo(-hw * 0.04, -hh - sz * 0.68)
     .lineTo( hw * 0.18, -hh - sz * 0.52)
     .lineTo( hw * 0.5,  -hh)
     .closePath().fill({ color: accentColor, alpha: 0.72 });
    g.circle(hw * 0.54, -hh * 0.2, sz * 0.13).fill(0xffffff);
    g.circle(hw * 0.56, -hh * 0.18, sz * 0.08).fill(0x111111);
  }

  /** Harlequin Tuskfish — teal body with orange/white bands and protruding blue tusks. */
  _drawHarlequinTuskfish(g, sz, bodyColor, accentColor) {
    const hw = sz * 1.08, hh = sz * 0.6;
    g.moveTo(-hw * 0.65, 0).lineTo(-hw * 1.26, -hh * 0.76).lineTo(-hw * 1.26, hh * 0.76).closePath().fill(bodyColor);
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);
    // Orange/white vertical bands
    [-hw * 0.36, -hw * 0.08, hw * 0.2, hw * 0.48].forEach(sx => {
      g.rect(sx - hw * 0.08, -hh + 2, hw * 0.17, hh * 2 - 4).fill(accentColor);
      g.rect(sx - hw * 0.03, -hh + 4, hw * 0.06, hh * 2 - 8).fill(0xfafafa);
    });
    this._ellipse(g, 0, 0, hw, hh);
    g.fill({ color: bodyColor, alpha: 0.15 });
    // Blue protruding tusks
    g.moveTo(hw * 0.78,  sz * 0.06).lineTo(hw * 0.98,  sz * 0.04).stroke({ color: 0x1565c0, width: 2.5, cap: 'round' });
    g.moveTo(hw * 0.76,  sz * 0.16).lineTo(hw * 0.96,  sz * 0.17).stroke({ color: 0x1565c0, width: 2.5, cap: 'round' });
    g.circle(hw * 0.58, -hh * 0.14, sz * 0.13).fill(0xffffff);
    g.circle(hw * 0.6,  -hh * 0.12, sz * 0.08).fill(0x111111);
  }

  /** Blue Ribbon Eel — cobalt blue body, yellow head, wavy dorsal fin, nostril tubes. */
  _drawBlueRibbonEel(g, sz, bodyColor, accentColor) {
    const len = sz * 2.4, th = sz * 0.25;
    g.roundRect(-len / 2, -th / 2, len, th, th / 2).fill(bodyColor);
    // Wavy dorsal fin
    g.moveTo(-len * 0.44, -th * 0.5)
     .lineTo(-len * 0.2,  -th * 1.12)
     .lineTo( len * 0.08, -th * 0.78)
     .lineTo( len * 0.38, -th * 1.05)
     .lineTo( len * 0.5,  -th * 0.5)
     .closePath().fill({ color: bodyColor, alpha: 0.55 });
    // Yellow head
    this._ellipse(g, len * 0.44, 0, len * 0.1, th * 0.82);
    g.fill(accentColor);
    // Nostril tubes (signature feature)
    g.moveTo(len * 0.5, -th * 0.28).lineTo(len * 0.58, -th * 0.68).stroke({ color: accentColor, width: 2, cap: 'round' });
    g.moveTo(len * 0.5,  th * 0.28).lineTo(len * 0.58,  th * 0.68).stroke({ color: accentColor, width: 2, cap: 'round' });
    // Open mouth
    g.moveTo(len * 0.5, -th * 0.14).lineTo(len * 0.58, 0).lineTo(len * 0.5, th * 0.14)
     .stroke({ color: 0x1a1a1a, width: 1.5, cap: 'round' });
    g.circle(len * 0.4,  -th * 0.2,  sz * 0.1).fill(0xffffff);
    g.circle(len * 0.41, -th * 0.18, sz * 0.06).fill(0x111111);
  }

  /** Napoleon Wrasse — large hump-headed fish with scale pattern and thick lips. */
  _drawNapoleonWrasse(g, sz, bodyColor, accentColor) {
    const hw = sz * 1.08, hh = sz * 0.8;
    g.moveTo(-hw * 0.7, 0).lineTo(-hw * 1.32, -hh * 0.65).lineTo(-hw * 1.32, hh * 0.65).closePath().fill(bodyColor);
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);
    // Scale pattern
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        g.circle(-hw * 0.52 + col * hw * 0.34, -hh * 0.42 + row * hh * 0.4, sz * 0.08)
         .fill({ color: accentColor, alpha: 0.48 });
      }
    }
    // Nuchal hump (forehead bump)
    this._ellipse(g, hw * 0.58, -hh * 0.7, hw * 0.32, hh * 0.3);
    g.fill(bodyColor);
    this._ellipse(g, hw * 0.58, -hh * 0.7, hw * 0.22, hh * 0.2);
    g.fill({ color: accentColor, alpha: 0.28 });
    // Thick lips
    g.moveTo(hw * 0.76, -sz * 0.1).lineTo(hw * 0.76, sz * 0.1)
     .stroke({ color: this._darken(bodyColor, 0.22), width: sz * 0.18, cap: 'round' });
    // Dorsal fin
    g.moveTo(-hw * 0.22, -hh).lineTo(hw * 0.14, -hh - sz * 0.4).lineTo(hw * 0.65, -hh).closePath().fill(bodyColor);
    g.circle(hw * 0.56, -hh * 0.22, sz * 0.13).fill(0xffffff);
    g.circle(hw * 0.58, -hh * 0.2,  sz * 0.08).fill(0x111111);
  }

  /** Giant Moray — long spotted eel with wide gaping jaw. */
  _drawGiantMoray(g, sz, bodyColor, accentColor) {
    const len = sz * 2.6, th = sz * 0.4;
    g.roundRect(-len / 2, -th / 2, len, th, th / 2).fill(bodyColor);
    // Spot pattern
    for (let i = 0; i < 7; i++) {
      g.circle(-len * 0.36 + i * len * 0.11, (i % 2 === 0 ? -1 : 1) * th * 0.22, sz * 0.1)
       .fill({ color: accentColor, alpha: 0.6 });
    }
    // Dorsal ridge
    g.moveTo(-len * 0.4, -th * 0.5).lineTo(len * 0.42, -th * 0.52)
     .stroke({ color: this._darken(bodyColor, 0.18), width: th * 0.35, cap: 'round' });
    // Wide gaping jaw
    g.moveTo(len / 2 - 4, -th / 2)
     .lineTo(len / 2 + sz * 0.38, -th * 0.65)
     .lineTo(len / 2 - 4,  th / 2)
     .closePath().fill(this._darken(bodyColor, 0.3));
    g.circle(len / 2 - sz * 0.2,  -th * 0.22, sz * 0.12).fill(0xffffff);
    g.circle(len / 2 - sz * 0.18, -th * 0.2,  sz * 0.07).fill(0x111111);
  }

  /** Dolphin — streamlined body, falcate dorsal, horizontal flukes, belly countershading. */
  _drawDolphin(g, sz, bodyColor, accentColor) {
    const dark = this._darken(bodyColor, 0.18);
    const len = sz * 2.2;
    const th  = sz * 0.48;

    // ── Tail flukes — crescent lobes with concave trailing edges + notch ──
    // Upper fluke
    g.moveTo(-len * 0.48, -sz * 0.04)
     .lineTo(-len * 0.68, -sz * 0.60)
     .lineTo(-len * 0.58, -sz * 0.38)
     .lineTo(-len * 0.52, -sz * 0.08)
     .closePath().fill(bodyColor);
    g.moveTo(-len * 0.68, -sz * 0.60)  // concave trailing cut
     .lineTo(-len * 0.54, -sz * 0.30)
     .lineTo(-len * 0.58, -sz * 0.38)
     .closePath().fill(dark);
    // Lower fluke
    g.moveTo(-len * 0.48,  sz * 0.04)
     .lineTo(-len * 0.68,  sz * 0.60)
     .lineTo(-len * 0.58,  sz * 0.38)
     .lineTo(-len * 0.52,  sz * 0.08)
     .closePath().fill(bodyColor);
    g.moveTo(-len * 0.68,  sz * 0.60)  // concave trailing cut
     .lineTo(-len * 0.54,  sz * 0.30)
     .lineTo(-len * 0.58,  sz * 0.38)
     .closePath().fill(dark);
    // Center notch between flukes
    g.moveTo(-len * 0.50, 0)
     .lineTo(-len * 0.56, -sz * 0.06)
     .lineTo(-len * 0.57,  sz * 0.06)
     .closePath().fill(dark);

    // ── Streamlined body ─────────────────────────────────────────────────
    this._ellipse(g, 0, 0, len * 0.5, th);
    g.fill(bodyColor);

    // ── Belly countershading ─────────────────────────────────────────────
    this._ellipse(g, len * 0.08, th * 0.28, len * 0.32, th * 0.38);
    g.fill({ color: accentColor, alpha: 0.75 });

    // ── Melon — rounded forehead bulge ───────────────────────────────────
    g.moveTo(len * 0.36, -th * 0.65)
     .lineTo(len * 0.50, -th * 0.28)
     .lineTo(len * 0.47, -th * 0.22)
     .lineTo(len * 0.32, -th * 0.52)
     .closePath().fill(bodyColor);

    // ── Rostrum — slightly blunted beak ──────────────────────────────────
    g.moveTo(len * 0.48, -sz * 0.09)
     .lineTo(len * 0.80,  sz * 0.01)
     .lineTo(len * 0.48,  sz * 0.09)
     .closePath().fill(bodyColor);
    // Gape line — curves gently from corner of mouth
    g.moveTo(len * 0.50,  sz * 0.02)
     .lineTo(len * 0.63,  sz * 0.02)
     .lineTo(len * 0.78,  sz * 0.01)
     .stroke({ color: dark, width: 1.2, cap: 'round', join: 'round' });

    // ── Falcate dorsal fin — swept-back with curved trailing edge ─────────
    g.moveTo(len * 0.06, -th)
     .lineTo(len * 0.15, -th - sz * 0.58)
     .lineTo(len * 0.26, -th - sz * 0.20)
     .lineTo(len * 0.38, -th * 0.90)
     .closePath().fill(bodyColor);
    g.moveTo(len * 0.15, -th - sz * 0.58)  // trailing edge shadow
     .lineTo(len * 0.26, -th - sz * 0.20)
     .lineTo(len * 0.38, -th * 0.90)
     .stroke({ color: dark, width: 1.0, alpha: 0.40 });

    // ── Pectoral flipper — swept-back teardrop ────────────────────────────
    g.moveTo(len * 0.18,  th * 0.28)
     .lineTo(len * 0.26,  th * 0.90)
     .lineTo(len * 0.40,  th * 0.60)
     .lineTo(len * 0.42,  th * 0.30)
     .closePath().fill(dark);

    // ── Eye stripe — subtle darker mask marking ───────────────────────────
    g.moveTo(len * 0.40, -sz * 0.18)
     .lineTo(len * 0.44,  sz * 0.10)
     .lineTo(len * 0.46,  sz * 0.08)
     .lineTo(len * 0.42, -sz * 0.20)
     .closePath().fill({ color: dark, alpha: 0.30 });

    // ── Eye ──────────────────────────────────────────────────────────────
    g.circle(len * 0.42, -sz * 0.10, sz * 0.11).fill(0xffffff);
    g.circle(len * 0.433, -sz * 0.09, sz * 0.07).fill(0x111111);
    g.circle(len * 0.446, -sz * 0.105, sz * 0.026).fill(0xffffff);
  }

  /** Reef Shark — fusiform body, heterocercal tail, black-tipped fins, gill slits. */
  _drawReefShark(g, sz, bodyColor, accentColor) {
    const len = sz * 2.6;
    const th  = sz * 0.42;

    // Upper tail lobe (larger — heterocercal)
    g.moveTo(-len * 0.5, -th * 0.1)
     .lineTo(-len * 0.7, -th * 1.35)
     .lineTo(-len * 0.52, -th * 0.12)
     .closePath().fill(bodyColor);
    // Black upper tail tip
    g.moveTo(-len * 0.7,  -th * 1.35)
     .lineTo(-len * 0.64, -th * 1.0)
     .lineTo(-len * 0.58, -th * 1.25)
     .closePath().fill(0x111111);
    // Lower tail lobe
    g.moveTo(-len * 0.5, th * 0.1)
     .lineTo(-len * 0.62,  th * 0.72)
     .lineTo(-len * 0.52,  th * 0.12)
     .closePath().fill(bodyColor);

    // Body
    this._ellipse(g, 0, 0, len * 0.5, th);
    g.fill(bodyColor);

    // White belly countershading
    this._ellipse(g, len * 0.05, th * 0.28, len * 0.35, th * 0.42);
    g.fill({ color: accentColor, alpha: 0.8 });

    // Snout
    g.moveTo(len * 0.5, -sz * 0.1)
     .lineTo(len * 0.64, 0)
     .lineTo(len * 0.5,  sz * 0.1)
     .closePath().fill(bodyColor);

    // Dorsal fin
    g.moveTo(-len * 0.02, -th)
     .lineTo( len * 0.1,  -th - sz * 0.82)
     .lineTo( len * 0.28, -th)
     .closePath().fill(bodyColor);
    // Black dorsal tip
    g.moveTo( len * 0.1,  -th - sz * 0.82)
     .lineTo( len * 0.07, -th - sz * 0.52)
     .lineTo( len * 0.15, -th - sz * 0.55)
     .closePath().fill(0x111111);

    // Pectoral fin
    g.moveTo(len * 0.14,  th * 0.1)
     .lineTo(len * 0.2,   th * 1.05)
     .lineTo(len * 0.42,  th * 0.25)
     .closePath().fill(this._darken(bodyColor, 0.08));
    // Black pectoral tip
    g.moveTo(len * 0.2,  th * 1.05)
     .lineTo(len * 0.24, th * 0.78)
     .lineTo(len * 0.3,  th * 0.98)
     .closePath().fill(0x111111);

    // Second dorsal (small)
    g.moveTo(-len * 0.25, -th * 0.88)
     .lineTo(-len * 0.18, -th * 0.88 - sz * 0.2)
     .lineTo(-len * 0.1,  -th * 0.88)
     .closePath().fill(bodyColor);

    // Gill slits (3)
    [0.26, 0.31, 0.36].forEach(gx => {
      g.moveTo(len * gx, -th * 0.38)
       .lineTo(len * gx,  th * 0.3)
       .stroke({ color: this._darken(bodyColor, 0.25), width: 1.2, cap: 'round' });
    });

    // Mouth
    g.moveTo(len * 0.53, sz * 0.06)
     .lineTo(len * 0.61, sz * 0.08)
     .stroke({ color: 0x1a1a1a, width: 1.5, cap: 'round' });

    // Eye
    g.circle(len * 0.46,  -sz * 0.1,  sz * 0.1).fill(0xffffff);
    g.circle(len * 0.465, -sz * 0.09, sz * 0.07).fill(0x111111);
  }

  /** Anglerfish — bulbous body, gaping toothed jaw, bioluminescent lure on illicium stalk. */
  _drawAnglerfish(g, sz, bodyColor, accentColor) {
    const hw = sz;
    const hh = sz * 0.8;

    // Tail
    g.moveTo(-hw * 0.7, 0)
     .lineTo(-hw * 1.35, -hh * 0.65)
     .lineTo(-hw * 1.35,  hh * 0.65)
     .closePath().fill(bodyColor);

    // Bulbous body
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);

    // Upper jaw
    g.moveTo(hw * 0.5, -hh * 0.45)
     .lineTo(hw * 1.3, -hh * 0.1)
     .lineTo(hw * 0.5,  hh * 0.05)
     .closePath().fill(bodyColor);

    // Lower jaw
    g.moveTo(hw * 0.5,  hh * 0.25)
     .lineTo(hw * 1.3,  hh * 0.1)
     .lineTo(hw * 0.5,  hh * 0.65)
     .closePath().fill(this._darken(bodyColor, 0.25));

    // Teeth
    [0.6, 0.9, 1.15].forEach(t => {
      g.moveTo(hw * t, -hh * 0.08)
       .lineTo(hw * t + sz * 0.04, hh * 0.18)
       .stroke({ color: 0xe0e0e0, width: 2, cap: 'round' });
    });

    // Illicium stalk from forehead
    g.moveTo(hw * 0.25, -hh)
     .lineTo(hw * 0.5, -hh * 1.5)
     .stroke({ color: this._darken(bodyColor, 0.1), width: 2, cap: 'butt' });

    // Esca (glowing lure) — outer halo + inner glow
    g.circle(hw * 0.5, -hh * 1.5, sz * 0.22).fill({ color: accentColor, alpha: 0.2 });
    g.circle(hw * 0.5, -hh * 1.5, sz * 0.13).fill(accentColor);

    // Eye
    g.circle(hw * 0.5,  -hh * 0.22, sz * 0.11).fill(0xffffff);
    g.circle(hw * 0.52, -hh * 0.20, sz * 0.07).fill(0x111111);
  }

  /** Moon Seahorse — spiral tail, bioluminescent ring bands, glowing coronet and eye. */
  _drawMoonSeahorse(g, sz, bodyColor, accentColor) {
    const bw = sz * 0.55;
    const bh = sz * 1.05;

    // Outer glow halo
    this._ellipse(g, 0, 0, bw * 0.85, bh * 0.52);
    g.fill({ color: accentColor, alpha: 0.12 });

    // Trunk
    g.moveTo(-bw * 0.5, -bh * 0.5)
     .lineTo( bw * 0.5, -bh * 0.5)
     .lineTo( bw * 0.35, bh * 0.3)
     .lineTo( bw * 0.12, bh * 0.5)
     .lineTo(-bw * 0.12, bh * 0.5)
     .lineTo(-bw * 0.35, bh * 0.3)
     .closePath().fill(bodyColor);

    // Bioluminescent ring bands
    [-bh * 0.08, bh * 0.15, bh * 0.33].forEach(ry => {
      this._ellipse(g, 0, ry, bw * 0.42, bh * 0.07);
      g.fill({ color: accentColor, alpha: 0.65 });
    });

    // Spiral tail
    const scx = bw * 0.28, scy = bh * 0.5 + sz * 0.44;
    const r0 = sz * 0.52, steps = 48;
    const totalAngle = Math.PI * 3.0, startAngle = -Math.PI * 1.25;

    g.moveTo(0, bh * 0.5);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      g.lineTo(scx + Math.cos(startAngle + t * totalAngle) * r0 * (1 - t * 0.7),
               scy + Math.sin(startAngle + t * totalAngle) * r0 * (1 - t * 0.7));
    }
    g.stroke({ color: bodyColor, width: sz * 0.22, cap: 'round', join: 'round' });

    // Glowing accent stripe on tail
    g.moveTo(0, bh * 0.5);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      g.lineTo(scx + Math.cos(startAngle + t * totalAngle) * r0 * (1 - t * 0.7),
               scy + Math.sin(startAngle + t * totalAngle) * r0 * (1 - t * 0.7));
    }
    g.stroke({ color: accentColor, width: 1.8, cap: 'round', join: 'round' });

    // Head
    this._ellipse(g, bw * 0.05, -bh * 0.56, bw * 0.46, bw * 0.3);
    g.fill(bodyColor);

    // Glowing coronet bumps
    g.circle(-bw * 0.12, -bh * 0.5 - sz * 0.24, sz * 0.09).fill(accentColor);
    g.circle( bw * 0.12, -bh * 0.5 - sz * 0.24, sz * 0.09).fill(accentColor);

    // Snout
    g.moveTo(bw * 0.44, -bh * 0.38)
     .lineTo(bw * 0.44 + sz * 0.5, -bh * 0.31)
     .lineTo(bw * 0.44, -bh * 0.24)
     .closePath().fill(accentColor);

    // Dorsal fin
    g.moveTo(-bw * 0.5, -bh * 0.1)
     .lineTo(-bw * 0.5 - sz * 0.3, -bh * 0.16)
     .lineTo(-bw * 0.5, -bh * 0.3)
     .closePath().fill({ color: accentColor, alpha: 0.7 });

    // Glowing eye
    g.circle(bw * 0.26, -bh * 0.4, sz * 0.13).fill(accentColor);
    g.circle(bw * 0.28, -bh * 0.38, sz * 0.07).fill(0x080820);
  }

  /** Glow Eel — slender dark body with vivid bioluminescent crossbands. */
  _drawGlowEel(g, sz, bodyColor, accentColor) {
    const len = sz * 2.4;
    const th  = sz * 0.28;
    // Body
    g.roundRect(-len / 2, -th / 2, len, th, th / 2).fill(bodyColor);
    // Bioluminescent crossbands
    for (let i = 0; i < 5; i++) {
      const bx = -len * 0.38 + i * len * 0.17;
      g.rect(bx, -th * 0.48, len * 0.05, th * 0.96).fill({ color: accentColor, alpha: 0.85 });
    }
    // Glowing tail tip
    g.circle(-len / 2 + 4, 0, sz * 0.14).fill(accentColor);
    // Jaw
    g.moveTo(len / 2 - 4, -th / 2)
     .lineTo(len / 2 + sz * 0.22, -th * 0.38)
     .lineTo(len / 2 - 4,  th / 2)
     .closePath()
     .fill(this._darken(bodyColor, 0.3));
    // Glowing eye
    g.circle(len / 2 - sz * 0.18, -th * 0.18, sz * 0.1).fill(accentColor);
    g.circle(len / 2 - sz * 0.16, -th * 0.16, sz * 0.06).fill(0x080820);
  }

  _darken(hex, amount) {
    const r = Math.floor(((hex >> 16) & 0xff) * (1 - amount));
    const g = Math.floor(((hex >> 8)  & 0xff) * (1 - amount));
    const b = Math.floor((hex & 0xff) * (1 - amount));
    return (r << 16) | (g << 8) | b;
  }

  _lighten(hex, amount) {
    const r = Math.min(255, Math.floor(((hex >> 16) & 0xff) + (255 - ((hex >> 16) & 0xff)) * amount));
    const g = Math.min(255, Math.floor(((hex >> 8)  & 0xff) + (255 - ((hex >> 8)  & 0xff)) * amount));
    const b = Math.min(255, Math.floor((hex & 0xff)          + (255 - (hex & 0xff))          * amount));
    return (r << 16) | (g << 8) | b;
  }

  // ── AI / Movement ──────────────────────────────────────────────────────────

  /**
   * Update fish position for one tick.
   * @param {number} dt      PixiJS deltaTime (frames @ 60fps, so 1 = 16ms)
   * @param {Array}  grid    state.grid [row][col]
   * @param {Array}  coralSpecies - CORAL_SPECIES map for tall lookup
   */
  update(dt, grid, coralSpecies) {
    const speed = this.spec.speed;
    const ms    = dt * (60 / 1000) * 16;  // normalise to pixels/frame

    // ── Steer toward target (angle-limited — fish arc, never reverse) ────────
    this.pickTargetCooldown -= dt;
    const dx   = this.targetX - this.x;
    const dy   = this.targetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 8 || this.pickTargetCooldown <= 0) {
      this._pickNewTarget(grid);
    }

    // Rotate heading toward target, capped to prevent instant reversals
    // Floor ensures slow fish (sand dollar etc.) still turn in reasonable time
    let da = Math.atan2(dy, dx) - this._angle;
    if (da >  Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    this._angle += Math.sign(da) * Math.min(Math.abs(da), Math.max(0.06, 0.05 * speed) * dt);

    this.vx = Math.cos(this._angle) * speed * 2.0;
    this.vy = Math.sin(this._angle) * speed * 2.0;

    // ── Coral repulsion ───────────────────────────────────────────────────
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        const sid = grid[r][c];
        if (!sid) continue;
        const spec = coralSpecies[sid];
        if (!spec) continue;
        // Layer B: only avoids massive blocksB structures (elkhorn, pillar)
        if (this.layer === 'B' && !spec.blocksB) continue;
        // Layer A: avoids all tall coral
        if (this.layer === 'A' && !spec.tall) continue;

        const cx  = GRID_X + c * TILE_SIZE + TILE_SIZE / 2;
        const cy  = GRID_Y + r * TILE_SIZE + TILE_SIZE / 2;
        const rdx = this.x - cx;
        const rdy = this.y - cy;
        const rd  = Math.sqrt(rdx * rdx + rdy * rdy);
        if (rd < REPULSE_R && rd > 0) {
          const force = (REPULSE_R - rd) / REPULSE_R * speed * 0.4;
          this.vx += (rdx / rd) * force * dt;
          this.vy += (rdy / rd) * force * dt;
        }
      }
    }

    // ── Dampen & clamp ────────────────────────────────────────────────────
    this.vx *= DAMPEN;
    this.vy *= DAMPEN;

    const spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    const maxSpd = speed * 8;
    if (spd > maxSpd) {
      this.vx = (this.vx / spd) * maxSpd;
      this.vy = (this.vy / spd) * maxSpd;
    }

    // ── Integrate position ────────────────────────────────────────────────
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // ── Bounce off reef bounds ─────────────────────────────────────────────
    const left   = GRID_X + MARGIN;
    const right  = GRID_X + GRID_W - MARGIN;
    const top    = GRID_Y + MARGIN;
    const bottom = GRID_Y + GRID_H - MARGIN;

    if (this.x < left)   { this.x = left;   this.vx =  Math.abs(this.vx); if (Math.cos(this._angle) < 0) this._angle = Math.PI - this._angle; }
    if (this.x > right)  { this.x = right;  this.vx = -Math.abs(this.vx); if (Math.cos(this._angle) > 0) this._angle = Math.PI - this._angle; }
    if (this.y < top)    { this.y = top;     this.vy =  Math.abs(this.vy); if (Math.sin(this._angle) < 0) this._angle = -this._angle; }
    if (this.y > bottom) { this.y = bottom;  this.vy = -Math.abs(this.vy); if (Math.sin(this._angle) > 0) this._angle = -this._angle; }

    // ── Update sprite — driven by _angle, which is always authoritative ────
    this.container.x = this.x;
    this.container.y = this.y;

    const facingRight = Math.cos(this._angle) >= 0;
    this.container.scale.x  = facingRight ? 1 : -1;
    this.container.rotation = facingRight ? this._angle : Math.PI - this._angle;

    // Subtle vertical bob
    this.container.scale.y = 1 + Math.sin(Date.now() * 0.003 + this.uid) * 0.04;
  }

  _pickNewTarget(grid) {
    // Occasionally head toward a coral tile, otherwise wander
    const occupiedTiles = getOccupiedTiles(grid);
    const usesCoral = occupiedTiles.length > 0 && Math.random() < 0.4;

    if (usesCoral) {
      const pick = occupiedTiles[Math.floor(Math.random() * occupiedTiles.length)];
      const cx   = tileCenter(pick.col, pick.row);
      // Aim near the coral (not on top of it)
      const angle = Math.random() * Math.PI * 2;
      const dist  = TILE_SIZE * (1.2 + Math.random() * 1.5);
      this.targetX = cx.x + Math.cos(angle) * dist;
      this.targetY = cx.y + Math.sin(angle) * dist;
    } else {
      this.targetX = GRID_X + MARGIN + Math.random() * (GRID_W - MARGIN * 2);
      this.targetY = GRID_Y + MARGIN + Math.random() * (GRID_H - MARGIN * 2);
    }

    this.pickTargetCooldown = 30 + Math.random() * 60;
  }

  // ── Event pass exclusives ──────────────────────────────────────────────────

  /** Sakura Anthias — deep pink anthias with flowing dorsal spine and blossom markings. */
  _drawSakuraAnthias(g, sz, c, ac) {
    const hw = sz;
    const hh = sz * 0.52;

    // Flowing forked tail (lyretail characteristic of anthias)
    g.moveTo(-hw * 0.6, 0)
     .lineTo(-hw * 1.4, -hh * 1.1)
     .lineTo(-hw * 0.9,  0)
     .lineTo(-hw * 1.4,  hh * 1.1)
     .closePath().fill(c);

    // Body oval
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(c);

    // Pale belly
    this._ellipse(g, hw * 0.1, hh * 0.25, hw * 0.55, hh * 0.38);
    g.fill({ color: ac, alpha: 0.55 });

    // Extended 3rd dorsal spine (hallmark of anthias)
    g.moveTo(-hw * 0.1, -hh)
     .lineTo( hw * 0.05, -hh - sz * 0.9)   // tall single spine
     .lineTo( hw * 0.12, -hh - sz * 0.3)
     .lineTo( hw * 0.5,  -hh)
     .closePath().fill(c);
    // Spine highlight
    g.moveTo(hw * 0.05,  -hh - sz * 0.9)
     .lineTo(hw * 0.08,  -hh - sz * 0.9)
     .lineTo(hw * 0.14,  -hh - sz * 0.3)
     .lineTo(hw * 0.10,  -hh - sz * 0.3)
     .closePath().fill({ color: ac, alpha: 0.6 });

    // Soft anal fin
    g.moveTo(-hw * 0.05, hh)
     .lineTo( hw * 0.25, hh + sz * 0.32)
     .lineTo( hw * 0.45, hh)
     .closePath().fill(c);

    // Pectoral fin
    g.moveTo(hw * 0.25, -hh * 0.1)
     .lineTo(hw * 0.55,  hh * 0.7)
     .lineTo(hw * 0.4,   hh * 0.55)
     .closePath().fill({ color: ac, alpha: 0.5 });

    // Cheek blush — soft pink patch
    this._ellipse(g, hw * 0.52, hh * 0.05, sz * 0.2, sz * 0.12);
    g.fill({ color: 0xff4081, alpha: 0.35 });

    // Eye
    g.circle(hw * 0.52, -hh * 0.14, sz * 0.14).fill(0xffffff);
    g.circle(hw * 0.53, -hh * 0.13, sz * 0.09).fill(0x220011);
    g.circle(hw * 0.55, -hh * 0.16, sz * 0.03).fill(0xffffff);
  }

  /** Opah (Moonfish) — large iridescent disc body with crimson fins and orange spots. */
  _drawOpah(g, sz, c, ac) {
    const hw = sz * 0.85;
    const hh = sz * 0.90;   // nearly circular disc

    // Tail — small crescent behind body
    g.moveTo(-hw * 0.78, -hh * 0.12)
     .lineTo(-hw * 1.18, -hh * 0.58)
     .lineTo(-hw * 1.05, -hh * 0.05)
     .lineTo(-hw * 1.18,  hh * 0.58)
     .lineTo(-hw * 0.78,  hh * 0.12)
     .closePath().fill(ac);

    // Main disc body
    this._ellipse(g, 0, 0, hw, hh);
    g.fill(c);

    // Iridescent sheen — lighter patch on upper body
    this._ellipse(g, -hw * 0.1, -hh * 0.2, hw * 0.55, hh * 0.42);
    g.fill({ color: 0x7ba7bc, alpha: 0.35 });

    // White spot pattern across body (distinctive opah spots)
    for (const [ox, oy, r] of [
      [-0.3, -0.4, 0.08], [ 0.1, -0.55, 0.065], [ 0.4, -0.3, 0.07],
      [-0.2,  0.3, 0.07], [ 0.3,  0.45, 0.065], [-0.55, 0.1, 0.06],
      [ 0.1,  0.1, 0.08], [-0.5, -0.3, 0.055],
    ]) {
      g.circle(hw * ox, hh * oy, sz * r).fill({ color: 0xffffff, alpha: 0.65 });
    }

    // Large crimson-orange pectoral fin (distinctive opah feature)
    g.moveTo(hw * 0.1, -hh * 0.3)
     .lineTo(hw * 0.7, -hh * 1.1)
     .lineTo(hw * 0.85, -hh * 0.65)
     .lineTo(hw * 0.7, -hh * 0.1)
     .closePath().fill(ac);

    // Ventral fin
    g.moveTo(hw * 0.1, hh * 0.35)
     .lineTo(hw * 0.5, hh * 0.95)
     .lineTo(hw * 0.65, hh * 0.55)
     .closePath().fill(ac);

    // Short dorsal ridge
    g.moveTo(-hw * 0.3, -hh * 0.88)
     .lineTo( hw * 0.05, -hh * 1.05)
     .lineTo( hw * 0.5,  -hh * 0.88)
     .closePath().fill({ color: ac, alpha: 0.8 });

    // Golden eye ring (opah signature)
    g.circle(hw * 0.48, -hh * 0.18, sz * 0.20).fill(0xffd740);
    g.circle(hw * 0.48, -hh * 0.18, sz * 0.14).fill(0xffffff);
    g.circle(hw * 0.49, -hh * 0.17, sz * 0.09).fill(0x1a0808);
    g.circle(hw * 0.51, -hh * 0.20, sz * 0.03).fill(0xffffff);

    // Red mouth tip
    g.moveTo(hw * 0.82, -hh * 0.06)
     .lineTo(hw * 1.0,   0)
     .lineTo(hw * 0.82,  hh * 0.06)
     .closePath().fill(ac);
  }

  /** Nautilus — chambered spiral shell with a friendly hood and tentacles. Facing right. */
  _drawNautilus(g, sz, bodyColor, accentColor) {
    const r        = sz * 1.05;
    const cream    = bodyColor;
    const stripe   = accentColor;
    const stripeDk = this._darken(accentColor, 0.18);
    const dark     = this._darken(bodyColor, 0.32);
    const flesh    = this._darken(accentColor, 0.30);

    // ── Outer shell — pearlescent disc ─────────────────────────────────
    g.circle(0, 0, r).fill(cream);
    // Soft inner shadow on the lower-left for volume
    g.circle(-r * 0.10, r * 0.10, r * 0.94)
     .fill({ color: this._darken(cream, 0.08), alpha: 0.45 });
    // Pearl highlight on the upper-right
    g.circle(r * 0.18, -r * 0.18, r * 0.62)
     .fill({ color: 0xffffff, alpha: 0.10 });

    // ── Camouflage banding — curved stripes following shell growth ─────
    // Each stripe is a quadratic curve from inner radius to outer rim,
    // tangentially offset so it sweeps with the spiral instead of radiating.
    const STRIPES = 18;
    for (let i = 0; i < STRIPES; i++) {
      const t      = i / STRIPES;
      const a      = -Math.PI * 1.05 + t * Math.PI * 1.45;
      const offset = 0.18;                          // tangential sweep
      const r0     = r * 0.18;
      const r1     = r * 0.97;
      const w      = sz * (0.08 + 0.06 * Math.sin(t * Math.PI));

      const ax = Math.cos(a) * r0;
      const ay = Math.sin(a) * r0;
      const bx = Math.cos(a + offset) * r1;
      const by = Math.sin(a + offset) * r1;
      const mid = (r0 + r1) * 0.55;
      const cx = Math.cos(a + offset * 0.5) * mid;
      const cy = Math.sin(a + offset * 0.5) * mid;

      g.moveTo(ax, ay)
       .quadraticCurveTo(cx, cy, bx, by)
       .stroke({ color: stripeDk, width: w, cap: 'round', alpha: 0.78 });
    }

    // Outer shell rim
    g.circle(0, 0, r).stroke({ color: dark, width: 1.5 });

    // ── Chamber septa — logarithmic spiral chamber dividers ────────────
    const PTS    = 110;
    const startA = Math.PI * 0.20;
    const endA   = Math.PI * 5.0;
    const b_log  = 0.205;
    let started  = false;
    for (let i = 0; i <= PTS; i++) {
      const t  = i / PTS;
      const a  = startA + (endA - startA) * t;
      const rr = sz * 0.07 * Math.exp(b_log * (a - startA));
      if (rr > r * 0.92) break;
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      if (!started) { g.moveTo(x, y); started = true; }
      else g.lineTo(x, y);
    }
    g.stroke({ color: dark, width: 1.0, alpha: 0.6 });

    // ── Spiral hub — innermost protoconch ──────────────────────────────
    g.circle(0, 0, sz * 0.10).fill(this._darken(stripe, 0.40));
    g.circle(sz * 0.025, -sz * 0.02, sz * 0.05).fill({ color: cream, alpha: 0.6 });

    // ── Aperture — the shell opening on the right ─────────────────────
    g.moveTo(r * 0.08, r * 0.16)
     .bezierCurveTo(r * 0.55, r * 0.02,  r * 1.04, r * 0.22,  r * 1.06, r * 0.55)
     .bezierCurveTo(r * 0.92, r * 0.82,  r * 0.50, r * 0.88,  r * 0.10, r * 0.78)
     .closePath().fill(this._darken(cream, 0.18));

    // ── Tentacles — short, soft, fanned bunch (cute "beard") ───────────
    const TENTACLES = 13;
    for (let i = 0; i < TENTACLES; i++) {
      const t   = i / (TENTACLES - 1);
      const y0  = r * (0.30 + t * 0.50);
      const x0  = r * 0.88;
      // Middle tentacles longer, outer ones shorter — gives the bunch a fan shape
      const len  = sz * (0.32 + Math.sin(t * Math.PI) * 0.22);
      // Slight up/down offset so they don't all stack flat
      const sag  = Math.sin(t * Math.PI) * sz * 0.06;
      const x1   = x0 + len;
      const y1   = y0 + sag * (i % 2 === 0 ? 0.4 : -0.2);
      // Curl: control points pull the tip slightly downward for a soft droop
      g.moveTo(x0, y0)
       .bezierCurveTo(x0 + sz * 0.16, y0 - sz * 0.02,
                      x1 - sz * 0.06, y1 + sz * 0.08,
                      x1, y1)
       .stroke({ color: flesh, width: 1.8, cap: 'round' });
    }

    // ── Hood — plump, friendly fleshy cap above the aperture ──────────
    g.moveTo(r * 0.28, r * 0.14)
     .bezierCurveTo(r * 0.62, -r * 0.02,  r * 1.05, r * 0.10,  r * 1.10, r * 0.42)
     .lineTo(r * 0.96, r * 0.50)
     .bezierCurveTo(r * 0.96, r * 0.20,  r * 0.62, r * 0.16,  r * 0.32, r * 0.28)
     .closePath().fill(flesh);

    // Hood camouflage banding — a couple of soft rust-colored speckles
    g.circle(r * 0.55, r * 0.10, sz * 0.07).fill({ color: stripeDk, alpha: 0.55 });
    g.circle(r * 0.78, r * 0.06, sz * 0.06).fill({ color: stripeDk, alpha: 0.50 });
    g.circle(r * 0.95, r * 0.20, sz * 0.05).fill({ color: stripeDk, alpha: 0.50 });

    // Hood gloss highlight — gives a soft, cute sheen
    g.moveTo(r * 0.45, r * 0.05)
     .quadraticCurveTo(r * 0.78, -r * 0.02, r * 1.00, r * 0.18)
     .quadraticCurveTo(r * 0.78, r * 0.04,  r * 0.45, r * 0.10)
     .closePath().fill({ color: 0xffffff, alpha: 0.18 });

    // ── Big expressive eye ────────────────────────────────────────────
    const ex   = r * 0.74;
    const ey   = r * 0.36;
    const eyR  = sz * 0.18;
    // Sclera (off-white for warmth)
    g.circle(ex, ey, eyR).fill(0xfaf2e6);
    g.circle(ex, ey, eyR).stroke({ color: dark, width: 1.3 });
    // Iris — warm dark
    g.circle(ex + sz * 0.015, ey + sz * 0.012, eyR * 0.62).fill(0x2a1208);
    // Pupil
    g.circle(ex + sz * 0.015, ey + sz * 0.012, eyR * 0.36).fill(0x000000);
    // Catchlights — primary and secondary (cute factor)
    g.circle(ex - sz * 0.045, ey - sz * 0.045, eyR * 0.30).fill(0xffffff);
    g.circle(ex + sz * 0.05,  ey + sz * 0.06,  eyR * 0.14).fill({ color: 0xffffff, alpha: 0.85 });
  }
}
