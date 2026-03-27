import { Container, Graphics } from 'pixi.js';
import {
  GRID_X, GRID_Y, GRID_W, GRID_H,
  TILE_SIZE, GRID_COLS, GRID_ROWS,
  COLORS,
} from '../constants.js';
import { worldToTile } from '../utils/grid.js';
import { Coral } from '../entities/Coral.js';
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
    // short (flat) coral — brain, lettuce, star, bubble, toadstool
    this.shortCoralContainer = new Container();
    // tall coral — staghorn, finger, candycane, elkhorn, pillar
    this.tallCoralContainer  = new Container();

    // ── Hover overlay (added topmost by ReefScene) ──────────────────────────
    this.hoverContainer = new Container();
    this._hoverGfx = new Graphics();
    this.hoverContainer.addChild(this._hoverGfx);

    this._coralSprites = new Map();   // uid → Graphics container
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
    const occupied = state.grid[row][col] !== null;

    let color;
    if (state.removeMode) {
      if (!occupied) return;          // nothing to remove
      color = 0xff4444;               // red highlight for removal
    } else {
      color = occupied ? 0xff4444 : COLORS.grid_hover;
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
  placeCoral(coralSpec, col, row, uid) {
    const coral = new Coral(coralSpec, col, row, uid);
    coral.container.x = GRID_X + col * TILE_SIZE;
    coral.container.y = GRID_Y + row * TILE_SIZE;

    if (coralSpec.tall) {
      this.tallCoralContainer.addChild(coral.container);
    } else {
      this.shortCoralContainer.addChild(coral.container);
    }

    this._coralSprites.set(uid, coral.container);
  }

  /** Remove a coral sprite by uid. */
  removeCoral(uid) {
    const sprite = this._coralSprites.get(uid);
    if (!sprite) return;
    sprite.parent?.removeChild(sprite);
    sprite.destroy({ children: true });
    this._coralSprites.delete(uid);
  }

  /** Remove all coral sprites (used when switching biomes). */
  clearAllCoral() {
    [...this._coralSprites.keys()].forEach(uid => this.removeCoral(uid));
  }

  /** Refresh hover highlight (call after selection changes). */
  refreshHover() {
    this._drawHover();
  }
}
