import {
  START_BE, START_HARMONY, START_LEVEL, START_PEARLS,
  GRID_ROWS, GRID_COLS,
} from './constants.js';

export const state = {
  // ── Resources ──────────────────────────────────────────────────────────────
  be:      START_BE,
  harmony: START_HARMONY,
  level:   START_LEVEL,
  pearls:  START_PEARLS,

  // ── Ad / clam tracking ─────────────────────────────────────────────────────
  clamWatchCount: 0,           // watches used today
  clamWatchDate:  '',          // date string — resets count when day changes

  // ── Selection (placement mode) ─────────────────────────────────────────────
  selectedType: null,   // 'coral' | 'fish' | null
  selectedId:   null,   // species id string
  removeMode:   false,  // true = tap to remove entities

  // ── Grid ───────────────────────────────────────────────────────────────────
  // [row][col] = speciesId string | null
  grid: Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null)),

  // ── Placed entities ────────────────────────────────────────────────────────
  placedCoral: [],   // [{ uid, col, row, speciesId }]
  fish:        [],   // Fish instances (added by FishLayer)

  // ── Idle streak ────────────────────────────────────────────────────────────
  lastInteractionTime: Date.now(),

  // ── Stats (for Harmony calculation) ───────────────────────────────────────
  coralCount:      0,
  coralTierCounts: { common: 0, uncommon: 0, rare: 0, superRare: 0, epic: 0, legendary: 0, mythic: 0 },
  coralTypesSeen:  new Set(),   // unique speciesIds placed

  fishCount:      0,
  fishTierCounts: { common: 0, uncommon: 0, rare: 0, superRare: 0, epic: 0, legendary: 0, mythic: 0 },
  fishLayerCounts: { A: 0, B: 0 },
  fishTypesSeen:  new Set(),

  // ── Harmony display (smoothed, for saturation filter) ─────────────────────
  harmonySmoothed: START_HARMONY,

  // ── UID counter ────────────────────────────────────────────────────────────
  _nextUid: 1,
  nextUid() { return this._nextUid++; },
};
