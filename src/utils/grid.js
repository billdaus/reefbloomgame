import { GRID_X, GRID_Y, TILE_SIZE, GRID_COLS, GRID_ROWS } from '../constants.js';

/** Convert world pixel coords → grid tile. Returns null if out of bounds. */
export function worldToTile(wx, wy) {
  const col = Math.floor((wx - GRID_X) / TILE_SIZE);
  const row = Math.floor((wy - GRID_Y) / TILE_SIZE);
  if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return null;
  return { col, row };
}

/** Convert grid tile → world pixel coords of tile's top-left corner. */
export function tileToWorld(col, row) {
  return {
    x: GRID_X + col * TILE_SIZE,
    y: GRID_Y + row * TILE_SIZE,
  };
}

/** Center of a tile in world coords. */
export function tileCenter(col, row) {
  return {
    x: GRID_X + col * TILE_SIZE + TILE_SIZE / 2,
    y: GRID_Y + row * TILE_SIZE + TILE_SIZE / 2,
  };
}

/** Whether a tile coord is within grid bounds. */
export function inBounds(col, row) {
  return col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS;
}

/** Return list of coral tiles from state.grid. */
export function getOccupiedTiles(grid) {
  const tiles = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (grid[r][c] !== null) tiles.push({ col: c, row: r, speciesId: grid[r][c] });
    }
  }
  return tiles;
}
