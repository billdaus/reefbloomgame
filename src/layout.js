/**
 * layout.js — Computes all screen/grid/panel layout constants once at startup
 * based on the actual viewport size.
 *
 * Portrait phone  (vw < vh && vw < 640):
 *   Canvas = viewport size, panel sits below the grid.
 *
 * Landscape / tablet / desktop:
 *   Canvas = 1024×768, panel is a right-side column (existing layout).
 */

const vw = window.innerWidth;
const vh = window.innerHeight;

export const IS_PORTRAIT = vw < vh && vw < 640;

export const GRID_COLS = 10;
export const GRID_ROWS = 10;

let _tile, _sw, _sh, _gx, _gy, _gw, _gh, _hh, _px, _py, _pw, _ph;

if (IS_PORTRAIT) {
  _tile = Math.floor((vw - 8) / 10);   // fit 10 cols with 4px margins each side
  _sw   = vw;
  _sh   = vh;
  _gx   = 4;
  _gy   = 56;                           // compact HUD
  _gw   = _tile * 10;
  _gh   = _tile * 10;
  _hh   = 56;
  _px   = 0;
  _py   = _gy + _gh + 4;               // panel immediately below grid
  _pw   = vw;
  _ph   = vh - _py;
} else {
  _tile = 60;
  _sw   = 1024;
  _sh   = 768;
  _gx   = 16;
  _gy   = 80;
  _gw   = 600;
  _gh   = 600;
  _hh   = 80;
  _px   = 632;
  _py   = 80;
  _pw   = 384;
  _ph   = 600;
}

export const TILE_SIZE = _tile;
export const SCREEN_W  = _sw;
export const SCREEN_H  = _sh;
export const GRID_X    = _gx;
export const GRID_Y    = _gy;
export const GRID_W    = _gw;
export const GRID_H    = _gh;
export const HUD_H     = _hh;
export const PANEL_X   = _px;
export const PANEL_Y   = _py;
export const PANEL_W   = _pw;
export const PANEL_H   = _ph;
