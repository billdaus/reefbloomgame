import { Container, Graphics } from 'pixi.js';
import {
  GRID_X, GRID_Y, GRID_W, GRID_H,
  TILE_SIZE, GRID_COLS, GRID_ROWS,
  COLORS, CORAL_SPECIES, DECOR_SPECIES,
} from '../constants.js';
import { worldToTile } from '../utils/grid.js';
import { Coral } from '../entities/Coral.js';
import { Decor } from '../entities/Decor.js';
import { state } from '../state.js';

/**
 * GridLayer — renders the 10×10 tile grid and handles coral placement input.
 *
 * Exposes three public containers so ReefScene can interleave them with fish
 * layers to produce correct 2.5D depth ordering:
 *
 *   shortCoralContainer  — flat/low coral; renders BELOW Layer-A fish
 *   tallCoralContainer   — branching/pillar coral; renders ABOVE Layer-A fish
 *   hoverContainer       — tile highlight; always rendered on top
 *
 * Fish are NOT drawn here; they live in ReefScene.
 */
export class GridLayer {
  /** @param {function} onTileTap  Called with ({col, row}) when a tile is tapped. */
  constructor(onTileTap) {
    this.onTileTap = onTileTap;

    // ── Main container: floor + grid lines + input hit area ─────────────────
    this.container = new Container();

    this._floorGfx = new Graphics();
    this._gridGfx  = new Graphics();
    this.container.addChild(this._floorGfx);
    this.container.addChild(this._gridGfx);

    // ── Coral depth layers (added to worldContainer by ReefScene) ──────────
    // decor — static aesthetic props, sits on the floor below coral and fish
    this.decorContainer      = new Container();
    // short (flat) coral — brain, lettuce, star, bubble, toadstool
    this.shortCoralContainer = new Container();
    // tall coral — staghorn, finger, candycane, elkhorn, pillar
    this.tallCoralContainer  = new Container();

    // ── Coral upgrade badges (added above coral, below hover, by ReefScene) ──
    // A small "···" tap target on each coral that opens its upgrade menu.
    this.badgeContainer = new Container();
    this.onCoralTap = null;   // (uid) => void — set by ReefScene

    // ── Hover overlay (added topmost by ReefScene) ──────────────────────────
    this.hoverContainer = new Container();
    this._hoverGfx = new Graphics();
    this.hoverContainer.addChild(this._hoverGfx);

    this._coralSprites = new Map();   // uid → Coral instance
    this._coralBadges  = new Map();   // uid → badge Container
    this._decorSprites = new Map();   // uid → Graphics container
    this._hoveredTile  = null;

    this._drawFloor();
    this._drawGrid();
    this._setupInput();
  }

  // ── Static visuals ─────────────────────────────────────────────────────────

  _drawFloor() {
    const g = this._floorGfx;
    g.rect(GRID_X, GRID_Y, GRID_W, GRID_H).fill({ color: COLORS.grid_floor, alpha: 0.42 });
    g.rect(GRID_X, GRID_Y + GRID_H - 10, GRID_W, 10)
     .fill({ color: 0x0a1810, alpha: 0.5 });
  }

  _drawGrid() {
    const g = this._gridGfx;
    g.clear();
    for (let c = 0; c <= GRID_COLS; c++) {
      const x = GRID_X + c * TILE_SIZE;
      g.moveTo(x, GRID_Y).lineTo(x, GRID_Y + GRID_H)
       .stroke({ color: COLORS.grid_line, width: 1, alpha: 0.7 });
    }
    for (let r = 0; r <= GRID_ROWS; r++) {
      const y = GRID_Y + r * TILE_SIZE;
      g.moveTo(GRID_X, y).lineTo(GRID_X + GRID_W, y)
       .stroke({ color: COLORS.grid_line, width: 1, alpha: 0.7 });
    }
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  _setupInput() {
    const hitArea = new Graphics();
    hitArea.rect(GRID_X, GRID_Y, GRID_W, GRID_H).fill({ color: 0x000000, alpha: 0 });
    hitArea.interactive = true;
    hitArea.cursor = 'crosshair';

    hitArea.on('pointermove',  (e) => this._onMove(e));
    hitArea.on('pointerdown',  (e) => this._onTap(e));
    hitArea.on('pointerleave', () => { this._hoveredTile = null; this._drawHover(); });

    this.container.addChild(hitArea);
  }

  _onMove(e) {
    const pos  = e.global;
    const tile = worldToTile(pos.x, pos.y);
    const key  = tile ? `${tile.col},${tile.row}` : null;
    const prev = this._hoveredTile ? `${this._hoveredTile.col},${this._hoveredTile.row}` : null;
    if (key !== prev) {
      this._hoveredTile = tile;
      this._drawHover();
    }
  }

  _onTap(e) {
    const tile = worldToTile(e.global.x, e.global.y);
    if (tile) this.onTileTap(tile);
  }

  _drawHover() {
    const g = this._hoverGfx;
    g.clear();
    if (!this._hoveredTile) return;
    if (!state.selectedType && !state.removeMode) return;
    const { col, row } = this._hoveredTile;

    const cellId    = state.grid[row][col];
    const decorHere = state.placedDecor.some(d => d.col === col && d.row === row);
    const anyHere   = cellId !== null || decorHere;

    let color;
    if (state.removeMode) {
      if (!anyHere) return;
      color = 0xff4444;
    } else {
      let blocked;
      if (state.selectedType === 'coral') {
        const spec = CORAL_SPECIES[state.selectedId];
        blocked = (cellId !== null) || (decorHere && !spec?.tall);
      } else if (state.selectedType === 'decor') {
        const spec = DECOR_SPECIES[state.selectedId];
        if (spec?.stackable) {
          const cellSpec = cellId ? CORAL_SPECIES[cellId] : null;
          blocked = decorHere || (cellId !== null && !cellSpec?.tall);
        } else {
          blocked = anyHere;
        }
      } else {
        blocked = cellId !== null;
      }
      color = blocked ? 0xff4444 : COLORS.grid_hover;
    }

    const x = GRID_X + col * TILE_SIZE + 1;
    const y = GRID_Y + row * TILE_SIZE + 1;
    g.rect(x, y, TILE_SIZE - 2, TILE_SIZE - 2).fill({ color, alpha: 0.3 });
    g.rect(x, y, TILE_SIZE - 2, TILE_SIZE - 2).stroke({ color, width: 2, alpha: 0.9 });
  }

  // ── Coral placement ────────────────────────────────────────────────────────

  /**
   * Place a coral sprite into the correct depth layer.
   * Tall coral (staghorn, finger, candycane, elkhorn, pillar) goes into
   * tallCoralContainer so Layer-A fish render behind them.
   * Short/flat coral goes into shortCoralContainer so fish can swim over them.
   */
  placeCoral(coralSpec, col, row, uid, level = 1) {
    const coral = new Coral(coralSpec, col, row, uid, level);
    // Coral pivot is its base-centre, so offset the position into the tile.
    coral.container.x = GRID_X + col * TILE_SIZE + TILE_SIZE / 2;
    coral.container.y = GRID_Y + row * TILE_SIZE + TILE_SIZE;

    if (coralSpec.tall) {
      this.tallCoralContainer.addChild(coral.container);
    } else {
      this.shortCoralContainer.addChild(coral.container);
    }

    this._coralSprites.set(uid, coral);
    this._addCoralBadge(uid, col, row);
  }

  /** Re-scale a placed coral's sprite to a new upgrade level. */
  upgradeCoral(uid, level) {
    this._coralSprites.get(uid)?.setLevel(level);
  }

  /** Remove a coral sprite by uid. */
  removeCoral(uid) {
    const coral = this._coralSprites.get(uid);
    if (!coral) return;
    coral.container.parent?.removeChild(coral.container);
    coral.container.destroy({ children: true });
    this._coralSprites.delete(uid);

    const badge = this._coralBadges.get(uid);
    if (badge) {
      badge.parent?.removeChild(badge);
      badge.destroy({ children: true });
      this._coralBadges.delete(uid);
    }
  }

  /** Remove all coral sprites (used when switching biomes). */
  clearAllCoral() {
    [...this._coralSprites.keys()].forEach(uid => this.removeCoral(uid));
  }

  /** Build the small "···" upgrade tap target at a coral's base-right corner. */
  _addCoralBadge(uid, col, row) {
    const W = 24, H = 16;
    const bx = GRID_X + col * TILE_SIZE + TILE_SIZE - W - 2;
    const by = GRID_Y + row * TILE_SIZE + TILE_SIZE - H - 2;

    const badge = new Container();
    badge.x = bx;
    badge.y = by;

    const g = new Graphics();
    g.roundRect(0, 0, W, H, 8).fill({ color: 0x0a1a08, alpha: 0.8 });
    g.roundRect(0, 0, W, H, 8).stroke({ color: 0x8bc34a, width: 1.5, alpha: 0.9 });
    for (let i = 0; i < 3; i++) {
      g.circle(W / 2 + (i - 1) * 6, H / 2, 2).fill({ color: 0xc8e6a0, alpha: 0.95 });
    }
    badge.addChild(g);

    badge.eventMode = 'static';
    badge.cursor = 'pointer';
    // Hit area fills the coral's OWN tile (inset 2px) and never spills into a
    // neighbour's tile — so every badge is equally, reliably tappable
    // regardless of placement order, and adjacent badges can't steal taps.
    const padInX = TILE_SIZE - W - 4;   // left edge → tile's left (−2px)
    const padInY = TILE_SIZE - H - 4;   // top edge  → tile's top  (−2px)
    const padOut = 2;
    badge.hitArea = {
      contains: (x, y) => x >= -padInX && x <= W + padOut && y >= -padInY && y <= H + padOut,
    };
    badge.on('pointerdown', (e) => {
      e.stopPropagation();
      this.onCoralTap?.(uid);
    });

    this.badgeContainer.addChild(badge);
    this._coralBadges.set(uid, badge);
  }

  // ── Decor placement ────────────────────────────────────────────────────────

  placeDecor(decorSpec, col, row, uid) {
    const decor = new Decor(decorSpec, col, row, uid);
    decor.container.x = GRID_X + col * TILE_SIZE;
    decor.container.y = GRID_Y + row * TILE_SIZE;
    this.decorContainer.addChild(decor.container);
    this._decorSprites.set(uid, decor.container);
  }

  removeDecor(uid) {
    const sprite = this._decorSprites.get(uid);
    if (!sprite) return;
    sprite.parent?.removeChild(sprite);
    sprite.destroy({ children: true });
    this._decorSprites.delete(uid);
  }

  clearAllDecor() {
    [...this._decorSprites.keys()].forEach(uid => this.removeDecor(uid));
  }

  /** Refresh hover highlight (call after selection changes). */
  refreshHover() {
    this._drawHover();
  }
}
