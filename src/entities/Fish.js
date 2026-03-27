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
      case 'clownfish':     this._drawOvalFish(g, sz, c, ac, true);  break;
      case 'chromis':       this._drawOvalFish(g, sz, c, ac, false); break;
      case 'moorishIdol':   this._drawIdol(g, sz, c, ac);            break;
      case 'yellowTang':    this._drawDiscFish(g, sz, c, ac);        break;
      case 'butterflyfish': this._drawDiscFish(g, sz, c, 0xffcc02);  break;
      case 'seahorse':      this._drawSeahorse(g, sz, c, ac);        break;
      case 'cuttlefish':    this._drawCuttlefish(g, sz, c, ac);      break;
      case 'morayEel':      this._drawEel(g, sz, c, ac);             break;
      default:              this._drawOvalFish(g, sz, c, ac, false); break;
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
    // sz=20, bodyColor=white, accentColor=yellow
    const bw = sz * 1.3;   // total body width
    const bh = sz * 1.85;  // total body height (tall disc)
    const ox = -bw * 0.38; // left edge (tail side)
    const oy = -bh / 2;    // top edge

    // 1. Tail fan (behind body, black)
    g.moveTo(ox, 0)
     .lineTo(ox - sz * 0.7, -sz * 0.8)
     .lineTo(ox - sz * 0.7,  sz * 0.8)
     .closePath().fill(0x151515);

    // 2. Full body silhouette — black rounded rect
    g.roundRect(ox, oy, bw, bh, bw * 0.42).fill(0x151515);

    // 3. White front section (right ~62% of body)
    const wStart = ox + bw * 0.34;
    const wWidth = bw * 0.62;
    g.roundRect(wStart, oy + bh * 0.04, wWidth, bh * 0.92, bw * 0.38).fill(bodyColor);

    // 4. Black middle band (narrow vertical stripe dividing black/white)
    g.rect(ox + bw * 0.3, oy + bh * 0.06, bw * 0.13, bh * 0.88).fill(0x151515);

    // 5. Yellow snout (right face portion)
    const sx = ox + bw * 0.72;
    g.roundRect(sx, oy + bh * 0.2, bw * 0.34, bh * 0.6, bw * 0.22).fill(accentColor);

    // 6. Long dorsal filament (thin white thread rising from top)
    const filmX = ox + bw * 0.48;
    g.moveTo(filmX, oy)
     .lineTo(filmX + sz * 0.12, oy - sz * 1.9)
     .stroke({ color: 0xe8e8e8, width: 1.5, cap: 'round' });

    // 7. Eye
    const ex = ox + bw * 0.82;
    const ey = oy + bh * 0.25;
    g.circle(ex, ey, sz * 0.11).fill(0xffffff);
    g.circle(ex + 1, ey + 0.5, sz * 0.065).fill(0x111111);
  }

  /** Seahorse — upright S-curve body. */
  _drawSeahorse(g, sz, bodyColor, accentColor) {
    const w = sz * 0.6;
    const h = sz * 1.4;
    // body outline
    g.roundRect(-w / 2, -h / 2, w, h, w * 0.4).fill(bodyColor);
    // snout
    g.rect(w / 2 - 2, -h * 0.3, sz * 0.5, sz * 0.12).fill(accentColor);
    // dorsal fin
    g.moveTo(-w / 2, -h * 0.1)
     .lineTo(-w / 2 - sz * 0.3, -h * 0.15)
     .lineTo(-w / 2, -h * 0.3)
     .closePath()
     .fill(accentColor);
    // eye
    g.circle(w * 0.3, -h * 0.3, sz * 0.1).fill(0xffffff);
    g.circle(w * 0.32, -h * 0.28, sz * 0.06).fill(0x111111);
  }

  /** Cuttlefish — wide oval with skirt fringe. */
  _drawCuttlefish(g, sz, bodyColor, accentColor) {
    const hw = sz * 1.1;
    const hh = sz * 0.55;

    // fringe / fin
    for (let i = 0; i < 8; i++) {
      const angle = (-Math.PI * 0.8) + i * (Math.PI * 1.6 / 7);
      const fx = Math.cos(angle) * hw;
      const fy = Math.sin(angle) * hh;
      g.moveTo(fx * 0.85, fy * 0.85).lineTo(fx * 1.15, fy * 1.2)
       .stroke({ color: accentColor, width: 2, cap: 'round' });
    }

    this._ellipse(g, 0, 0, hw, hh);
    g.fill(bodyColor);
    // pattern dots
    for (let i = 0; i < 5; i++) {
      g.circle(-hw * 0.5 + i * hw * 0.25, 0, sz * 0.08).fill(accentColor);
    }
    g.circle(hw * 0.6, -hh * 0.2, sz * 0.13).fill(0xffffff);
    g.circle(hw * 0.62, -hh * 0.18, sz * 0.08).fill(0x111111);
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

  _darken(hex, amount) {
    const r = Math.floor(((hex >> 16) & 0xff) * (1 - amount));
    const g = Math.floor(((hex >> 8)  & 0xff) * (1 - amount));
    const b = Math.floor((hex & 0xff) * (1 - amount));
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

    // ── Steer toward target ────────────────────────────────────────────────
    this.pickTargetCooldown -= dt;
    const dx   = this.targetX - this.x;
    const dy   = this.targetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 8 || this.pickTargetCooldown <= 0) {
      this._pickNewTarget(grid);
    } else {
      this.vx += (dx / dist) * STEER * speed * dt;
      this.vy += (dy / dist) * STEER * speed * dt * 0.5;  // less vertical
    }

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
    const maxSpd = speed * 2;
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

    if (this.x < left)   { this.x = left;   this.vx =  Math.abs(this.vx); }
    if (this.x > right)  { this.x = right;  this.vx = -Math.abs(this.vx); }
    if (this.y < top)    { this.y = top;     this.vy =  Math.abs(this.vy); }
    if (this.y > bottom) { this.y = bottom;  this.vy = -Math.abs(this.vy); }

    // ── Update sprite ─────────────────────────────────────────────────────
    this.container.x = this.x;
    this.container.y = this.y;
    // Flip to face direction of travel
    if (Math.abs(this.vx) > 0.05) {
      this.container.scale.x = this.vx > 0 ? 1 : -1;
    }

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

    this.pickTargetCooldown = 80 + Math.random() * 120;
  }
}
